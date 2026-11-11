import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'
import prisma from './prisma'
import { hashAccountToken, invalidAccountLink, sendAccountLink, consumeAccountLink } from './accountTokens'
import { accountMailer, mailConfiguration } from './mailer'
import { changeOrderStatus } from './orderStatus'

const restorers: (() => void)[] = []
function stub(target: object, key: PropertyKey, implementation: unknown) {
  const original = Reflect.get(target, key)
  Reflect.set(target, key, implementation)
  restorers.push(() => { Reflect.set(target, key, original) })
}
const account = { id: 1, email: 'teste@gmail.com', sessionVersion: 2 }
const rawToken = 'a'.repeat(64)
const storedToken = { tokenHash: hashAccountToken(rawToken), accountId: 1, sessionVersion: 2, purpose: 'RESET_PASSWORD', consumedAt: null, expiresAt: new Date(Date.now() + 60000) }
const baseOrder = { id: 42, status: 'PENDING', paymentStatus: 'PENDING', updatedAt: new Date(), stockRestoredAt: null, items: [{ productId: 3, quantity: 2 }, { productId: 4, quantity: 1 }] }
let env: NodeJS.ProcessEnv
beforeEach(() => {
  stub(prisma, '$queryRaw', async () => [])
  stub(prisma.paymentCheckout, 'findMany', async () => [])
  env = { ...process.env }
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'ficticio', SMTP_PASS: 'senha-ficticia', MAIL_FROM: 'Clima <loja@example.test>', APP_PUBLIC_URL: 'http://localhost:5173' })
  // Toda chamada não prevista falha antes de alcançar o banco real ou SMTP.
  for (const model of [prisma.customerAuthToken, prisma.customerAccount, prisma.order, prisma.product]) {
    for (const method of ['create', 'updateMany', 'update', 'findUnique', 'findUniqueOrThrow']) stub(model, method, async () => { throw new Error('Acesso não simulado') })
  }
  stub(prisma, '$transaction', async (callback: (tx: typeof prisma) => unknown) => callback(prisma))
  stub(accountMailer, 'send', async () => { throw new Error('Envio não simulado') })
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0; process.env = env })
after(() => prisma.$disconnect())

test('link enviado tem 256 bits aleatórios; banco guarda somente hash e validade correta', async () => {
  let data: Record<string, unknown> = {}
  let delivered = ''
  stub(prisma.customerAuthToken, 'create', async (args: { data: typeof data }) => { data = args.data })
  stub(accountMailer, 'send', async (email: string, purpose: string, token: string) => { assert.equal(email, account.email); assert.equal(purpose, 'RESET_PASSWORD'); delivered = token })
  await sendAccountLink(account, 'RESET_PASSWORD')
  assert.match(delivered, /^[a-f0-9]{64}$/)
  assert.equal(data.tokenHash, hashAccountToken(delivered))
  assert.equal(data.sessionVersion, 2)
  assert.ok(!JSON.stringify(data).includes(delivered))
  assert.ok(Math.abs(Number(data.expiresAt) - Date.now() - 30 * 60000) < 1000)
})

test('falha de entrega inutiliza o link sem expor erro SMTP', async () => {
  stub(prisma.customerAuthToken, 'create', async () => ({}))
  let invalidated = false
  stub(prisma.customerAuthToken, 'updateMany', async (args: { data: { consumedAt: Date } }) => { invalidated = args.data.consumedAt instanceof Date; return { count: 1 } })
  await assert.rejects(sendAccountLink(account, 'VERIFY_EMAIL'), /Não foi possível enviar/)
  assert.equal(invalidated, true)
})

test('reset exige token válido, da finalidade correta, não consumido e não expirado', async () => {
  for (const token of [null, { ...storedToken, purpose: 'VERIFY_EMAIL' }, { ...storedToken, consumedAt: new Date() }, { ...storedToken, expiresAt: new Date(0) }]) {
    stub(prisma.customerAuthToken, 'findUnique', async () => token)
    await assert.rejects(consumeAccountLink(rawToken, 'RESET_PASSWORD', 'hash-novo'), { message: invalidAccountLink })
  }
})

test('reset consome atomicamente e incrementa versão para revogar sessões antigas', async () => {
  stub(prisma.customerAuthToken, 'findUnique', async () => storedToken)
  let claims = 0
  stub(prisma.customerAuthToken, 'updateMany', async (args: { where: { tokenHash?: string; accountId?: number }; data: { consumedAt: Date } }) => {
    assert.ok(args.data.consumedAt instanceof Date)
    if (args.where.tokenHash) return { count: ++claims === 1 ? 1 : 0 }
    assert.equal(args.where.accountId, 1)
    return { count: 4 }
  })
  let writes = 0
  stub(prisma.customerAccount, 'updateMany', async (args: { where: unknown; data: { passwordHash: string; sessionVersion: unknown; emailVerifiedAt: Date } }) => {
    writes++
    assert.deepEqual(args.where, { id: 1, sessionVersion: 2 })
    assert.equal(args.data.passwordHash, 'hash-novo')
    assert.deepEqual(args.data.sessionVersion, { increment: 1 })
    assert.ok(args.data.emailVerifiedAt instanceof Date)
    return { count: 1 }
  })
  await consumeAccountLink(rawToken, 'RESET_PASSWORD', 'hash-novo')
  await assert.rejects(consumeAccountLink(rawToken, 'RESET_PASSWORD', 'outro-hash'), { message: invalidAccountLink })
  assert.equal(writes, 1)
})

test('link emitido antes de outra troca de senha não pode redefinir novamente', async () => {
  stub(prisma.customerAuthToken, 'findUnique', async () => storedToken)
  stub(prisma.customerAuthToken, 'updateMany', async () => ({ count: 1 }))
  stub(prisma.customerAccount, 'updateMany', async () => ({ count: 0 }))
  await assert.rejects(consumeAccountLink(rawToken, 'RESET_PASSWORD', 'hash'), { message: invalidAccountLink })
})

test('confirmação registra a data sem modificar senha ou versão da sessão', async () => {
  stub(prisma.customerAuthToken, 'findUnique', async () => ({ ...storedToken, purpose: 'VERIFY_EMAIL' }))
  stub(prisma.customerAuthToken, 'updateMany', async () => ({ count: 1 }))
  stub(prisma.customerAccount, 'updateMany', async (args: { data: Record<string, unknown> }) => { assert.deepEqual(Object.keys(args.data), ['emailVerifiedAt']); return { count: 1 } })
  await consumeAccountLink(rawToken, 'VERIFY_EMAIL')
})

test('SMTP recusa configuração ausente e URLs não seguras ou adulteradas', () => {
  for (const url of ['https://evil.test/path', 'https://user:pass@evil.test', 'javascript:alert(1)', 'http://loja.test', 'https://loja.test/?injected=1']) {
    process.env.APP_PUBLIC_URL = url
    assert.throws(() => mailConfiguration())
  }
  process.env.APP_PUBLIC_URL = 'https://loja.test'
  delete process.env.SMTP_PASS
  assert.throws(() => mailConfiguration())
})

test('cancelamento repõe cada item e muda pagamento dentro da mesma transação', async () => {
  stub(prisma.order, 'findUnique', async () => baseOrder)
  stub(prisma.order, 'updateMany', async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    assert.equal(args.where.stockRestoredAt, null)
    assert.equal(args.where.status, 'PENDING')
    assert.equal(args.data.status, 'CANCELED')
    assert.equal(args.data.paymentStatus, 'CANCELED')
    assert.ok(args.data.stockRestoredAt instanceof Date)
    return { count: 1 }
  })
  const replenished: unknown[] = []
  stub(prisma.product, 'update', async (args: unknown) => { replenished.push(args) })
  stub(prisma.order, 'findUniqueOrThrow', async () => ({ ...baseOrder, status: 'CANCELED' }))
  const result = await changeOrderStatus(42, 'CANCELED')
  assert.equal(result.status, 'CANCELED')
  assert.deepEqual(replenished, [{ where: { id: 3 }, data: { stock: { increment: 2 } } }, { where: { id: 4 }, data: { stock: { increment: 1 } } }])
})

test('cancelamento repetido é idempotente e pedido cancelado não reabre', async () => {
  stub(prisma.order, 'findUnique', async () => ({ ...baseOrder, status: 'CANCELED', stockRestoredAt: new Date() }))
  assert.equal((await changeOrderStatus(42, 'CANCELED')).status, 'CANCELED')
  await assert.rejects(changeOrderStatus(42, 'PENDING'), /não pode ser reaberto/)
})

test('cancelamento histórico sem marcador também não faz reposição retroativa', async () => {
  stub(prisma.order, 'findUnique', async () => ({ ...baseOrder, status: 'CANCELED' }))
  assert.equal((await changeOrderStatus(42, 'CANCELED')).status, 'CANCELED')
})

test('pedido pago, enviado ou entregue não cancela nem devolve estoque automaticamente', async () => {
  for (const changes of [{ paymentStatus: 'APPROVED' }, { status: 'SHIPPED' }, { status: 'DELIVERED' }]) {
    stub(prisma.order, 'findUnique', async () => ({ ...baseOrder, ...changes }))
    await assert.rejects(changeOrderStatus(42, 'CANCELED'))
  }
})

test('atualização concorrente não repõe estoque sem conseguir alterar o pedido', async () => {
  stub(prisma.order, 'findUnique', async () => baseOrder)
  stub(prisma.order, 'updateMany', async () => ({ count: 0 }))
  await assert.rejects(changeOrderStatus(42, 'CANCELED'), /outra solicitação/)
})

test('dois cancelamentos simultâneos disputam a mesma reserva sem repor duas vezes', async () => {
  stub(prisma.order, 'findUnique', async () => baseOrder)
  let claimed = false
  stub(prisma.order, 'updateMany', async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 } })
  const quantities: number[] = []
  stub(prisma.product, 'update', async (args: { data: { stock: { increment: number } } }) => { quantities.push(args.data.stock.increment) })
  stub(prisma.order, 'findUniqueOrThrow', async () => ({ ...baseOrder, status: 'CANCELED' }))
  const results = await Promise.allSettled([changeOrderStatus(42, 'CANCELED'), changeOrderStatus(42, 'CANCELED')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.deepEqual(quantities, [2, 1])
})

test('cancelar pedido libera uma utilização do cupom dentro da transação de estoque', async () => {
  stub(prisma.order, 'findUnique', async () => ({ ...baseOrder, couponId: 'coupon-1', couponReleasedAt: null }))
  stub(prisma.order, 'updateMany', async (args: { data: Record<string, unknown> }) => { assert.ok(args.data.couponReleasedAt instanceof Date); return { count: 1 } })
  let releases = 0
  stub(prisma.coupon, 'updateMany', async (args: { where: unknown; data: unknown }) => { releases++; assert.deepEqual(args.where, { id: 'coupon-1', usedCount: { gt: 0 } }); assert.deepEqual(args.data, { usedCount: { decrement: 1 } }); return { count: 1 } })
  stub(prisma.product, 'update', async () => ({}))
  stub(prisma.order, 'findUniqueOrThrow', async () => ({ ...baseOrder, status: 'CANCELED' }))
  await changeOrderStatus(42, 'CANCELED'); assert.equal(releases, 1)
  stub(prisma.order, 'findUnique', async () => ({ ...baseOrder, couponId: 'coupon-1', status: 'CANCELED', couponReleasedAt: new Date() }))
  await changeOrderStatus(42, 'CANCELED'); assert.equal(releases, 1)
})

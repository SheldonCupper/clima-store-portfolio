import { test, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import type { TokenPayload } from 'google-auth-library'
import { app } from './index'
import prisma from './prisma'
import { googleAccount, googleProvider, validateGoogleIdentity } from './googleAuth'
import { claimCoupon, welcomeCouponId, welcomeCouponCode, welcomeEligibility } from './coupons'
const savedEnv = { ...process.env }
const restores: (() => void)[] = []
function stub(target: object, key: string, value: unknown) { const old = Reflect.get(target, key); Reflect.set(target, key, value); restores.push(() => { Reflect.set(target, key, old) }) }
const server = app.listen(0, '127.0.0.1')
beforeEach(() => {
  Object.assign(process.env, { JWT_SECRET: 'chave-ficticia', GOOGLE_CLIENT_ID: 'id-ficticio', GOOGLE_CLIENT_SECRET: 'segredo-ficticio', APP_PUBLIC_URL: 'https://loja.example' })
  stub(prisma, '$transaction', async () => { throw Error('Banco não simulado') })
})
afterEach(() => { restores.reverse().forEach(restore => restore()); restores.length = 0; process.env = { ...savedEnv } })
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() })
async function call(path: string, options: RequestInit = {}) {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api${path}`, { redirect: 'manual', ...options })
}
test('compra sem sessão, sessão inválida ou somente admin é recusada antes de consultar produtos/frete', async () => {
  stub(prisma.product, 'findMany', () => { throw Error('Não consultar produtos') })
  for (const cookie of ['', 'customer_session=invalido', `admin_token=${jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET!)}`]) {
    const response = await call('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ accountId: 1 }) })
    assert.equal(response.status, 401); assert.equal((await response.json()).requiresLogin, true)
  }
})
test('boas-vindas exige conta e bloqueia pedidos anteriores por conta, e-mail ou CPF', async () => {
  const db = { order: { findFirst: async (args: unknown) => { assert.match(JSON.stringify(args), /CANCELED/); assert.match(JSON.stringify(args), /cpf/); return { id: 1 } } } }
  await assert.rejects(welcomeEligibility(db as never, null), /Entre/)
  await assert.rejects(welcomeEligibility(db as never, { id: 1, email: 'a@gmail.com', cpf: '12345678901' }), /primeira compra/)
  await welcomeEligibility({ order: { findFirst: async () => null } } as never, { id: 1, email: 'a@gmail.com', cpf: '' })
})
test('reserva de boas-vindas bloqueia antes de consumir contador e calcula desconto oficial', async () => {
  let previous: object | null = { id: 1 }, increments = 0, locks = 0
  const tx = { $queryRaw: async () => { locks++; return [] }, order: { findFirst: async () => previous }, coupon: { findUnique: async () => ({ id: welcomeCouponId, code: welcomeCouponCode, kind: 'FIXED', value: '12.50', minSubtotal: '0', maxDiscount: null, active: true, startsAt: null, expiresAt: null, usageLimit: null, usedCount: 0 }), updateMany: async () => { increments++; return { count: 1 } } } }
  const account = { id: 1, email: 'a@gmail.com', cpf: '12345678901' }
  await assert.rejects(claimCoupon(tx as never, welcomeCouponCode, 10000, account), /primeira compra/)
  assert.equal(increments, 0); previous = null
  assert.equal((await claimCoupon(tx as never, welcomeCouponCode, 10000, account))?.discountCents, 1250)
  assert.equal(increments, 1); assert.equal(locks, 2)
})
test('Google usa estado, nonce e PKCE; não aceita retorno sem cookie válido', async () => {
  let exchanges = 0
  stub(googleProvider, 'identity', async () => { exchanges++; throw Error('Não deveria trocar código') })
  const start = await call('/customer/google/start?next=https://evil.example')
  assert.equal(start.status, 302)
  const url = new URL(start.headers.get('location')!)
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://loja.example/api/customer/google/callback')
  assert.ok(url.searchParams.get('nonce')); assert.ok(url.searchParams.get('state'))
  assert.match(start.headers.get('set-cookie')!, /HttpOnly/)
  for (const cookie of ['', start.headers.get('set-cookie')!.split(';')[0]]) {
    const callback = await call('/customer/google/callback?code=falso&state=errado', { headers: { Cookie: cookie } })
    assert.equal(new URL(callback.headers.get('location')!).origin, 'https://loja.example')
  }
  assert.equal(exchanges, 0)
})
test('Google conclui com cookie de cliente e destino permitido; nenhum token vai na URL', async () => {
  const start = await call('/customer/google/start?next=%2Fcheckout')
  const params = new URL(start.headers.get('location')!).searchParams
  stub(googleProvider, 'identity', async () => ({ sub: 'google123', email: 'cliente@gmail.com', email_verified: true, nonce: params.get('nonce') }))
  stub(prisma, '$transaction', async (fn: (tx: unknown) => unknown) => fn({ customerAccount: { findUnique: async () => ({ id: 5, email: 'cliente@gmail.com', sessionVersion: 0 }) } }))
  const callback = await call(`/customer/google/callback?code=simulado&state=${params.get('state')}`, { headers: { Cookie: start.headers.get('set-cookie')!.split(';')[0] } })
  assert.equal(callback.headers.get('location'), 'https://loja.example/checkout')
  assert.match(callback.headers.get('set-cookie')!, /customer_session=.*HttpOnly/)
})
test('Google rejeita nonce incorreto, e-mail não verificado, outro domínio e admin', () => {
  const good = { sub: '123', email: 'cliente@gmail.com', email_verified: true, nonce: 'nonce' } as TokenPayload & { nonce: string }
  assert.equal(validateGoogleIdentity(good, 'nonce').subject, '123')
  for (const change of [{ nonce: 'errado' }, { email_verified: false }, { email: 'cliente@example.com' }, { sub: '' }]) assert.throws(() => validateGoogleIdentity({ ...good, ...change }, 'nonce'))
})
test('Google não vincula conta local sem e-mail confirmado', async () => {
  let writes = 0
  stub(prisma, '$transaction', async (fn: (tx: unknown) => unknown) => fn({ customerAccount: { findUnique: async ({ where }: { where: { googleSubject?: string } }) => where.googleSubject ? null : { id: 1, emailVerifiedAt: null }, update: () => { writes++; throw Error('Não escrever') } } }))
  await assert.rejects(googleAccount({ subject: '123', email: 'cliente@gmail.com', name: 'Cliente' }), /Confirme/)
  assert.equal(writes, 0)
})

import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { CustomerAccount } from '../../generated/prisma/client'
import prisma from './prisma'
import { app } from './index'
import { accountMailer } from './mailer'
import { hashAccountToken } from './accountTokens'

const restorers: (() => void)[] = []
function stub<T extends object>(target: T, method: keyof T, implementation: (...args: never[]) => unknown) {
  const original = target[method]
  Reflect.set(target, method, implementation)
  restorers.push(() => { Reflect.set(target, method, original) })
}
const profile = { id: 1, name: 'Cliente Teste', email: 'cliente@gmail.com', phone: '34992562467', cpf: '01234567890', emailVerifiedAt: null }
const password = 'SenhaFicticia!123'
let account: CustomerAccount
let savedEnv: NodeJS.ProcessEnv
const server = app.listen(0, '127.0.0.1')
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  account = { ...profile, googleSubject: null, verificationRequired: false, sessionVersion: 0, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date(), updatedAt: new Date() }
})
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await prisma.$disconnect()
})
beforeEach(() => {
  stub(prisma, '$queryRaw', async () => [])
  stub(prisma.paymentCheckout, 'findMany', async () => [])
  savedEnv = { ...process.env }
  process.env.JWT_SECRET = 'segredo-ficticio-para-testes-de-conta'
  delete process.env.EMAIL_VERIFICATION_REQUIRED
  stub(prisma.customerAccount, 'findUnique', async () => null)
  stub(prisma.customerAccount, 'create', async () => { throw new Error('Escrita inesperada no teste') })
  stub(prisma.order, 'findMany', async () => { throw new Error('Leitura inesperada de pedidos') })
  stub(prisma.order, 'findFirst', async () => { throw new Error('Leitura inesperada de pedido') })
  stub(prisma.order, 'findUnique', async () => { throw new Error('Leitura inesperada de pedido') })
  stub(prisma.customerAuthToken, 'create', async () => { throw new Error('Token inesperado') })
  stub(prisma.customerAuthToken, 'updateMany', async () => { throw new Error('Token inesperado') })
  stub(prisma.customerAuthToken, 'findUnique', async () => { throw new Error('Token inesperado') })
  stub(prisma.customerAccount, 'updateMany', async () => { throw new Error('Conta inesperada') })
  stub(prisma, '$transaction', async () => { throw new Error('Transação inesperada') })
  stub(accountMailer, 'send', async () => { throw new Error('E-mail inesperado') })
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0; process.env = savedEnv })

function call(method: string, path: string, body?: unknown, cookie = '') {
  return new Promise<{ status: number; data: Record<string, unknown>; cookie: string | undefined }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, method, path, headers: { 'Content-Type': 'application/json', Cookie: cookie } }, res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(text), cookie: res.headers['set-cookie']?.[0] }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
function session(id = 1, changes: Record<string, unknown> = {}) {
  return `customer_session=${jwt.sign({ role: 'CUSTOMER', ...changes }, process.env.JWT_SECRET!, { algorithm: 'HS256', subject: String(id), audience: 'customer-account', issuer: 'ecommerce-api', expiresIn: '1h' })}`
}

test('cadastro salva hash bcrypt e perfil normalizado; não retorna hash nem token no JSON', async () => {
  let saved: Record<string, unknown> = {}
  stub(prisma.customerAccount, 'create', async (args: unknown) => {
    const { data, select } = args as { data: Record<string, unknown>; select: Record<string, unknown> }
    saved = data
    assert.equal(select.passwordHash, undefined)
    return { ...profile, sessionVersion: 0 }
  })
  const result = await call('POST', '/api/customer/register', { ...profile, name: '  Cliente Teste  ', email: '  CLIENTE@GMAIL.COM ', phone: '34 99256-2467', password })
  assert.equal(result.status, 201)
  assert.equal(saved.email, profile.email)
  assert.equal(saved.phone, profile.phone)
  assert.notEqual(saved.passwordHash, password)
  assert.ok(await bcrypt.compare(password, String(saved.passwordHash)))
  assert.deepEqual(result.data, { customer: profile })
  assert.ok(result.cookie?.startsWith('customer_session='))
  assert.match(result.cookie!, /HttpOnly/)
  assert.match(result.cookie!, /SameSite=Lax/)
  assert.match(result.cookie!, /Path=\/api;/)
})

test('cadastro recusa campos inválidos e senha curta ou maior que o limite do bcrypt', async () => {
  for (const invalid of [{ email: 'cliente@hotmail.com' }, { cpf: '123' }, { phone: '123' }, { password: '123' }, { password: 'á'.repeat(40) }]) {
    const result = await call('POST', '/api/customer/register', { ...profile, password, ...invalid })
    assert.equal(result.status, 400)
    assert.equal(result.cookie, undefined)
  }
})

test('cadastro duplicado retorna conflito sem revelar hash ou dados existentes', async () => {
  stub(prisma.customerAccount, 'create', async () => { throw { code: 'P2002' } })
  const result = await call('POST', '/api/customer/register', { ...profile, password })
  assert.equal(result.status, 409)
  assert.deepEqual(Object.keys(result.data), ['error'])
})

test('login válido emite cookie e permite consultar perfil sem hash', async () => {
  stub(prisma.customerAccount, 'findUnique', async (args: unknown) => {
    const query = args as { where: Record<string, unknown>; select?: unknown }
    if (query.where.email) assert.equal(query.where.email, profile.email)
    return query.select ? { ...profile, sessionVersion: 0, verificationRequired: false } : account
  })
  const login = await call('POST', '/api/customer/login', { email: ' CLIENTE@GMAIL.COM ', password })
  assert.equal(login.status, 200)
  assert.deepEqual(login.data, { customer: profile })
  const me = await call('GET', '/api/customer/me', undefined, login.cookie!.split(';')[0])
  assert.equal(me.status, 200)
  assert.deepEqual(me.data, { customer: profile })
})

test('senha errada e e-mail inexistente retornam a mesma resposta', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => account)
  const wrong = await call('POST', '/api/customer/login', { email: profile.email, password: 'SenhaIncorreta' })
  stub(prisma.customerAccount, 'findUnique', async () => null)
  const absent = await call('POST', '/api/customer/login', { email: 'outro@gmail.com', password })
  assert.equal(wrong.status, 401)
  assert.equal(absent.status, 401)
  assert.deepEqual(wrong.data, absent.data)
  assert.equal(wrong.cookie, undefined)
})

test('sessão ausente, adulterada, expirada ou de administrador não autentica cliente', async () => {
  const expired = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, { subject: '1', audience: 'customer-account', issuer: 'ecommerce-api', expiresIn: -1 })
  for (const cookie of ['', 'customer_session=adulterado', `customer_session=${expired}`, session(1, { role: 'ADMIN' })]) {
    const result = await call('GET', '/api/customer/me', undefined, cookie)
    assert.equal(result.status, 401)
  }
})

test('meus pedidos filtra pelo ID da sessão, sem aceitar filtro de outra conta pelo cliente', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...profile, sessionVersion: 0, verificationRequired: false }))
  stub(prisma.order, 'findMany', async (args: unknown) => {
    const query = args as { where: unknown; select: Record<string, unknown> }
    assert.deepEqual(query.where, { accountId: 1 })
    assert.equal(query.select.customer, undefined)
    return [{ id: 42 }]
  })
  const result = await call('GET', '/api/customer/orders?accountId=2', undefined, session())
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.orders, [{ id: 42 }])
  assert.equal((await call('GET', '/api/customer/orders')).status, 401)
})

test('conta autenticada pode abrir somente seus pedidos; cadastro não libera histórico por e-mail', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...profile, sessionVersion: 0, verificationRequired: false }))
  stub(prisma.order, 'findFirst', async (args: unknown) => {
    const { where } = args as { where: { id: number; accountId: number } }
    assert.equal(where.accountId, 1)
    return where.id === 42 ? { id: 42 } : null
  })
  stub(prisma.order, 'findUnique', async () => ({ id: 42 }))
  assert.equal((await call('GET', '/api/orders/42', undefined, session())).status, 200)
  assert.equal((await call('GET', '/api/orders/43', undefined, session())).status, 401)
})

test('logout remove o cookie de cliente no mesmo caminho usado pelo login', async () => {
  const result = await call('POST', '/api/customer/logout', {}, session())
  assert.equal(result.status, 200)
  assert.match(result.cookie!, /customer_session=;/)
  assert.match(result.cookie!, /Path=\/api;/)
  assert.match(result.cookie!, /Expires=Thu, 01 Jan 1970/)
})

function smtp() { Object.assign(process.env, { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'usuario-ficticio', SMTP_PASS: 'senha-ficticia', SMTP_PORT: '587', MAIL_FROM: 'loja@example.test', APP_PUBLIC_URL: 'http://localhost:5173' }) }

test('cadastro com confirmação obrigatória envia link sem iniciar sessão', async () => {
  smtp()
  process.env.EMAIL_VERIFICATION_REQUIRED = 'true'
  let emitted = ''
  stub(prisma.customerAccount, 'create', async (args: unknown) => { assert.equal((args as { data: { verificationRequired: boolean } }).data.verificationRequired, true); return { ...profile, sessionVersion: 0 } })
  stub(prisma.customerAuthToken, 'create', async () => ({}))
  stub(accountMailer, 'send', async (_email: string, purpose: string, token: string) => { assert.equal(purpose, 'VERIFY_EMAIL'); emitted = token })
  const result = await call('POST', '/api/customer/register', { ...profile, password })
  assert.equal(result.status, 201)
  assert.equal(result.data.requiresVerification, true)
  assert.equal(result.data.emailSent, true)
  assert.equal(result.data.customer, undefined)
  assert.equal(result.cookie, undefined)
  assert.match(emitted, /^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(result.data).includes(emitted))
})

test('SMTP ausente bloqueia novo cadastro obrigatório sem criar conta', async () => {
  process.env.EMAIL_VERIFICATION_REQUIRED = 'true'
  delete process.env.SMTP_HOST
  const result = await call('POST', '/api/customer/register', { ...profile, password })
  assert.equal(result.status, 503)
  assert.equal(result.cookie, undefined)
})

test('conta pendente exige confirmação; versão nova revoga cookie antigo', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...account, verificationRequired: true }))
  const pending = await call('POST', '/api/customer/login', { email: profile.email, password })
  assert.equal(pending.status, 403)
  assert.equal(pending.data.requiresVerification, true)
  assert.equal(pending.cookie, undefined)
  assert.equal((await call('GET', '/api/customer/me', undefined, session())).status, 401)
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...account, sessionVersion: 1 }))
  assert.equal((await call('GET', '/api/customer/me', undefined, session())).status, 401)
})

test('recuperação não revela se e-mail existe; SMTP ausente não simula envio', async () => {
  smtp()
  stub(prisma.customerAuthToken, 'create', async () => ({}))
  let sent = 0
  stub(accountMailer, 'send', async () => { sent++ })
  stub(prisma.customerAccount, 'findUnique', async () => account)
  const known = await call('POST', '/api/customer/forgot-password', { email: 'conhecido@gmail.com' })
  stub(prisma.customerAccount, 'findUnique', async () => null)
  const unknown = await call('POST', '/api/customer/forgot-password', { email: 'desconhecido@gmail.com' })
  assert.equal(known.status, 200)
  assert.deepEqual(known.data, unknown.data)
  assert.equal(known.cookie, undefined)
  assert.equal(sent, 1)
  delete process.env.SMTP_HOST
  assert.equal((await call('POST', '/api/customer/forgot-password', { email: profile.email })).status, 503)
})

test('reset HTTP salva hash bcrypt e remove sessão; não emite autenticação nova', async () => {
  const token = 'b'.repeat(64)
  stub(prisma, '$transaction', async (callback: unknown) => (callback as (tx: typeof prisma) => unknown)(prisma))
  stub(prisma.customerAuthToken, 'findUnique', async () => ({ tokenHash: hashAccountToken(token), accountId: 1, sessionVersion: 0, purpose: 'RESET_PASSWORD', consumedAt: null, expiresAt: new Date(Date.now() + 60000) }))
  stub(prisma.customerAuthToken, 'updateMany', async () => ({ count: 1 }))
  let hash = ''
  stub(prisma.customerAccount, 'updateMany', async (args: unknown) => { hash = (args as { data: { passwordHash: string } }).data.passwordHash; return { count: 1 } })
  const result = await call('POST', '/api/customer/reset-password', { token, password })
  assert.equal(result.status, 200)
  assert.ok(await bcrypt.compare(password, hash))
  assert.match(result.cookie!, /customer_session=;/)
  assert.match(result.cookie!, /Expires=Thu, 01 Jan 1970/)
  assert.equal(result.data.customer, undefined)
  assert.ok(!JSON.stringify(result.data).includes(token))
})

test('endpoints recusam links malformados e senha inválida antes de gravar', async () => {
  assert.equal((await call('POST', '/api/customer/verify-email', { token: 'invalido' })).status, 400)
  assert.equal((await call('POST', '/api/customer/reset-password', { token: 'a'.repeat(64), password: '123' })).status, 400)
})

test('API de status exige admin e preserva erros de negócio do cancelamento', async () => {
  assert.equal((await call('PATCH', '/api/orders/42/status', { status: 'CANCELED' })).status, 401)
  const admin = `admin_token=${jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`
  stub(prisma, '$transaction', async (callback: unknown) => (callback as (tx: typeof prisma) => unknown)(prisma))
  stub(prisma.order, 'findUnique', async () => null)
  assert.equal((await call('PATCH', '/api/orders/42/status', { status: 'CANCELED' }, admin)).status, 404)
  stub(prisma.order, 'findUnique', async () => ({ id: 42, status: 'CONFIRMED', paymentStatus: 'APPROVED' }))
  const paid = await call('PATCH', '/api/orders/42/status', { status: 'CANCELED' }, admin)
  assert.equal(paid.status, 409)
  assert.match(String(paid.data.error), /reembolso/)
  assert.equal((await call('PATCH', '/api/orders/42/status', { status: 'INVALIDO' }, admin)).status, 400)
})

test('confirmação desativada permite login e sessão de conta pendente sem marcar e-mail como confirmado', async () => {
  process.env.EMAIL_VERIFICATION_REQUIRED = 'false'
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...account, verificationRequired: true }))
  const login = await call('POST', '/api/customer/login', { email: profile.email, password })
  assert.equal(login.status, 200)
  assert.equal((login.data.customer as typeof profile & { emailVerificationRequired: boolean }).emailVerificationRequired, false)
  assert.equal((login.data.customer as typeof profile).emailVerifiedAt, null)
  const me = await call('GET', '/api/customer/me', undefined, session())
  assert.equal(me.status, 200)
  assert.equal((me.data.customer as { emailVerificationRequired: boolean }).emailVerificationRequired, false)
  const bad = await call('POST', '/api/customer/login', { email: profile.email, password: 'incorreta' })
  assert.equal(bad.status, 401)
  process.env.EMAIL_VERIFICATION_REQUIRED = 'true'
  assert.equal((await call('POST', '/api/customer/login', { email: profile.email, password })).status, 403)
})

test('admin lista contas sem compra, une compradores por e-mail e não consulta segredos das contas', async () => {
  const now = new Date()
  stub(prisma.customer, 'findMany', async () => [{ ...profile, id: 1, createdAt: now, _count: { orders: 2 } }, { ...profile, id: 3, email: 'legado@gmail.com', createdAt: now, _count: { orders: 1 } }])
  stub(prisma.customerAccount, 'findMany', async (args: { select: Record<string, unknown> }) => {
    assert.equal(args.select.passwordHash, undefined); assert.equal(args.select.googleSubject, undefined)
    return [{ ...profile, createdAt: now, _count: { orders: 2 } }, { ...profile, id: 2, email: 'novo@gmail.com', createdAt: now, _count: { orders: 0 } }]
  })
  const token = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)
  const result = await call('GET', '/api/admin/customers', undefined, `admin_token=${token}`)
  assert.equal(result.status, 200)
  const customers = result.data as unknown as { id: string; email: string; _count: { orders: number } }[]
  assert.equal(customers.length, 3)
  assert.equal(customers.find(value => value.email === 'novo@gmail.com')?._count.orders, 0)
  assert.equal(customers.filter(value => value.email === profile.email).length, 1)
})

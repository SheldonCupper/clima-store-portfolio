import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'

const server = app.listen(0, '127.0.0.1')
const restorers: (() => void)[] = []
function stub<T extends object>(target: T, key: keyof T, replacement: unknown) {
  const previous = target[key]
  Reflect.set(target, key, replacement)
  restorers.push(() => { Reflect.set(target, key, previous) })
}
const password = 'SenhaDeTeste!123'
const profile = { id: 1, name: 'Cliente Teste', email: 'cliente@gmail.com', phone: '11000000000', cpf: '01234567890', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') }
let hash = ''
let savedEnv: NodeJS.ProcessEnv
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  hash = await bcrypt.hash(password, 4)
})
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect() })
beforeEach(() => {
  savedEnv = { ...process.env }
  delete process.env.EMAIL_VERIFICATION_REQUIRED
  Object.assign(process.env, { ADMIN_EMAIL: 'dono@clima.example', ADMIN_PASSWORD_HASH: hash, JWT_SECRET: 'segredo-ficticio-do-login-unificado' })
  stub(prisma.customerAccount, 'findUnique', async () => { throw new Error('Consulta inesperada de conta') })
  stub(prisma.customerAccount, 'create', async () => { throw new Error('Escrita inesperada') })
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0; process.env = savedEnv })

function call(path: string, body?: unknown, cookie = '', method = 'POST') {
  return new Promise<{ status: number; data: Record<string, unknown>; cookies: string[] }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method, headers: { 'Content-Type': 'application/json', Cookie: cookie } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => { data += chunk })
      res.on('end', () => { try { resolve({ status: res.statusCode!, data: JSON.parse(data), cookies: res.headers['set-cookie'] || [] }) } catch (error) { reject(error) } })
    })
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

const account = () => ({ ...profile, passwordHash: hash, verificationRequired: false, sessionVersion: 0 })

test('login comum reconhece admin do env com espaços/maiúsculas e emite sessão administrativa', async () => {
  const response = await call('/api/customer/login', { email: '  DONO@Clima.EXAMPLE ', password })
  assert.equal(response.status, 200)
  assert.equal(response.data.role, 'ADMIN')
  assert.equal(response.data.customer, undefined)
  assert.ok(!JSON.stringify(response.data).includes(hash))
  const cookie = response.cookies.find(value => value.startsWith('admin_token='))!
  const token = cookie.split(';')[0].slice('admin_token='.length)
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload
  assert.equal(decoded.role, 'ADMIN')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Path=\//)
  assert.ok(response.cookies.some(value => value.startsWith('customer_session=;') && value.includes('Path=/api;')))
  assert.equal((await call('/api/admin/me', undefined, cookie.split(';')[0], 'GET')).status, 200)
})

test('senha de admin incorreta nunca tenta autenticar conta cliente com o mesmo e-mail', async () => {
  const response = await call('/api/customer/login', { email: process.env.ADMIN_EMAIL, password: 'Incorreta' })
  assert.equal(response.status, 401)
  assert.deepEqual(response.cookies, [])
})

test('cliente com papel ADMIN forjado recebe apenas sessão de cliente e perde cookie administrativo anterior', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => account())
  const response = await call('/api/customer/login', { email: profile.email, password, role: 'ADMIN' }, 'admin_token=antigo')
  assert.equal(response.status, 200)
  assert.equal(response.data.role, undefined)
  const customerCookie = response.cookies.find(value => value.startsWith('customer_session='))!
  assert.ok(customerCookie)
  assert.ok(response.cookies.some(value => value.startsWith('admin_token=;') && value.includes('Expires=Thu, 01 Jan 1970')))
  assert.equal((await call('/api/admin/me', undefined, customerCookie.split(';')[0], 'GET')).status, 401)
})

test('cliente pendente continua exigindo confirmação e não recebe sessão', async () => {
  stub(prisma.customerAccount, 'findUnique', async () => ({ ...account(), verificationRequired: true, emailVerifiedAt: null }))
  const response = await call('/api/customer/login', { email: profile.email, password })
  assert.equal(response.status, 403)
  assert.equal(response.data.requiresVerification, true)
  assert.deepEqual(response.cookies, [])
})

test('endpoint administrativo antigo preserva acesso com senha e normalização do e-mail', async () => {
  const response = await call('/api/admin/login', { email: ' DONO@Clima.EXAMPLE ', password })
  assert.equal(response.status, 200)
  assert.equal(response.data.role, 'ADMIN')
  assert.equal((await call('/api/admin/login', { email: profile.email, password })).status, 401)
})

test('cadastro não cria conta cliente usando a identidade administrativa reservada', async () => {
  process.env.ADMIN_EMAIL = 'dono@gmail.com'
  const response = await call('/api/customer/register', { ...profile, email: ' DONO@GMAIL.COM ', password })
  assert.equal(response.status, 409)
  assert.deepEqual(response.cookies, [])
})

test('configuração administrativa incompleta falha sem fallback para cliente', async () => {
  delete process.env.ADMIN_PASSWORD_HASH
  const response = await call('/api/customer/login', { email: process.env.ADMIN_EMAIL, password })
  assert.equal(response.status, 500)
  assert.deepEqual(response.cookies, [])
})

test('login recusa senha vazia, objeto e senha além do limite antes de consultar dados', async () => {
  for (const invalid of ['', { senha: password }, 'á'.repeat(40)]) {
    assert.equal((await call('/api/customer/login', { email: process.env.ADMIN_EMAIL, password: invalid })).status, 400)
    assert.equal((await call('/api/admin/login', { email: process.env.ADMIN_EMAIL, password: invalid })).status, 400)
  }
})

test('sessões emitidas em produção são HttpOnly, Secure e SameSite=Lax', async () => {
  process.env.NODE_ENV = 'production'
  const response = await call('/api/customer/login', { email: process.env.ADMIN_EMAIL, password })
  assert.equal(response.status, 200)
  const cookie = response.cookies.find(value => value.startsWith('admin_token='))!
  for (const attribute of [/HttpOnly/, /Secure/, /SameSite=Lax/]) assert.match(cookie, attribute)
})

import { Router, type CookieOptions, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { checkoutCustomerErrors, normalizeCheckoutCustomer } from '../../shared/checkoutCustomer'
import { invalidAccountLink, sendAccountLink, consumeAccountLink, validAccountToken } from './accountTokens'
import { mailConfiguration } from './mailer'
import { clearAdminSession, isAdminEmail, signInAdmin } from './adminAuth'

export const customerCookieName = 'customer_session'
const sessionSeconds = 7 * 24 * 60 * 60
const jwtOptions = { algorithms: ['HS256'] as jwt.Algorithm[], audience: 'customer-account', issuer: 'ecommerce-api' }
const verificationPolicy = () => process.env.EMAIL_VERIFICATION_REQUIRED === 'false' ? { emailVerificationRequired: false } : {}
const publicProfile = { id: true, name: true, email: true, phone: true, cpf: true, emailVerifiedAt: true } as const
const cookieOptions = (): CookieOptions => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api', maxAge: sessionSeconds * 1000 })

export async function readCustomerSession(req: Request) {
  const token = req.cookies?.[customerCookieName]
  if (typeof token !== 'string' || !token || !process.env.JWT_SECRET) return null
  let accountId: number
  let sessionVersion: number
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, jwtOptions)
    if (typeof payload === 'string' || payload.role !== 'CUSTOMER') return null
    accountId = Number(payload.sub)
    sessionVersion = payload.version === undefined ? 0 : Number(payload.version)
    if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) return null
    if (!Number.isSafeInteger(accountId) || accountId <= 0) return null
  } catch { return null }
  const account = await prisma.customerAccount.findUnique({ where: { id: accountId }, select: { ...publicProfile, sessionVersion: true, verificationRequired: true } })
  if (!account || account.sessionVersion !== sessionVersion || (process.env.EMAIL_VERIFICATION_REQUIRED !== 'false' && account.verificationRequired && !account.emailVerifiedAt)) return null
  return { id: account.id, name: account.name, email: account.email, phone: account.phone, cpf: account.cpf, emailVerifiedAt: account.emailVerifiedAt, ...verificationPolicy() }
}

export function setCustomerSession(res: Response, accountId: number, secret: string, version: number) {
  const token = jwt.sign({ role: 'CUSTOMER', version }, secret, {
    algorithm: 'HS256', subject: String(accountId), audience: jwtOptions.audience,
    issuer: jwtOptions.issuer, expiresIn: sessionSeconds,
  })
  res.cookie(customerCookieName, token, cookieOptions())
  clearAdminSession(res)
}

// Limita as tentativas por IP e mantém apenas uma janela em memória.
export function authAttemptLimit(maxAttempts = 20, windowMs = 10 * 60 * 1000) {
  const attempts = new Map<string, { count: number; expiresAt: number }>()
  return (req: Request, res: Response, next: () => void) => {
    const now = Date.now()
    for (const [key, value] of attempts) if (value.expiresAt <= now) attempts.delete(key)
    const key = req.ip || 'unknown'
    const entry = attempts.get(key) || { count: 0, expiresAt: now + windowMs }
    if (entry.count >= maxAttempts) {
      res.setHeader('Retry-After', Math.ceil((entry.expiresAt - now) / 1000))
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' })
    }
    if (attempts.size >= 10000 && !attempts.has(key)) attempts.delete(attempts.keys().next().value!)
    entry.count++
    attempts.set(key, entry)
    next()
  }
}

export const customerAuthRouter = Router()
customerAuthRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
const limit = authAttemptLimit()

customerAuthRouter.post('/register', limit, async (req, res) => {
  try {
    const secret = process.env.JWT_SECRET
    if (!secret?.trim()) return res.status(500).json({ error: 'Configuração de autenticação ausente' })
    const errors = checkoutCustomerErrors(req.body)
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fieldErrors: errors })
    const password: unknown = req.body.password
    if (typeof password !== 'string' || password.length < 8 || !password.trim()) return res.status(400).json({ error: 'Use uma senha com pelo menos 8 caracteres.' })
    if (new TextEncoder().encode(password).length > 72) return res.status(400).json({ error: 'Essa senha é muito longa. Escolha uma senha menor.' })
    const profile = normalizeCheckoutCustomer(req.body)
    if (isAdminEmail(profile.email)) return res.status(409).json({ error: 'Este e-mail não está disponível para cadastro. Entre com sua senha.' })
    const verificationRequired = process.env.EMAIL_VERIFICATION_REQUIRED === 'true'
    if (verificationRequired) {
      try { mailConfiguration() }
      catch { return res.status(503).json({ error: 'O cadastro aguarda a configuração do envio de e-mails. Tente novamente mais tarde.' }) }
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const account = await prisma.customerAccount.create({ data: { ...profile, passwordHash, verificationRequired }, select: { ...publicProfile, sessionVersion: true } })
    if (verificationRequired) {
      let emailSent = false
      try { await sendAccountLink(account, 'VERIFY_EMAIL'); emailSent = true } catch { /* A conta pendente pode solicitar novo envio. */ }
      return res.status(201).json({ requiresVerification: true, emailSent, message: emailSent ? 'Enviamos um link para confirmar seu e-mail.' : 'Conta criada. O envio falhou; solicite um novo link de confirmação.' })
    }
    const { sessionVersion, ...customer } = account
    setCustomerSession(res, account.id, secret, sessionVersion)
    return res.status(201).json({ customer: { ...customer, ...verificationPolicy() } })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Este e-mail já possui uma conta. Entre com sua senha.' })
    }
    console.error('Falha ao criar conta de cliente')
    return res.status(500).json({ error: 'Não foi possível criar a conta. Tente novamente.' })
  }
})

customerAuthRouter.post('/login', limit, async (req, res) => {
  try {
    const secret = process.env.JWT_SECRET
    if (!secret?.trim()) return res.status(500).json({ error: 'Configuração de autenticação ausente' })
    const { email, password } = req.body || {}
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || email.length > 254 || !password || password.length > 72 || new TextEncoder().encode(password).length > 72) {
      return res.status(400).json({ error: 'Informe seu e-mail e senha.' })
    }
    if (isAdminEmail(email)) return signInAdmin(req, res)
    const account = await prisma.customerAccount.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Faz a comparação mesmo sem conta para reduzir diferenças de tempo entre as respostas.
    const fallbackHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.ku7S8eU4a0j4yOHpkC6e3JoT07lLShW'
    const matches = await bcrypt.compare(password, account?.passwordHash || fallbackHash)
    if (!account || !matches) return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    if (process.env.EMAIL_VERIFICATION_REQUIRED !== 'false' && account.verificationRequired && !account.emailVerifiedAt) return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar.', requiresVerification: true })
    setCustomerSession(res, account.id, secret, account.sessionVersion)
    return res.json({ customer: { id: account.id, name: account.name, email: account.email, phone: account.phone, cpf: account.cpf, emailVerifiedAt: account.emailVerifiedAt, ...verificationPolicy() } })
  } catch {
    return res.status(500).json({ error: 'Não foi possível entrar. Tente novamente.' })
  }
})

customerAuthRouter.post('/logout', (_req, res) => {
  const options = cookieOptions()
  delete options.maxAge
  res.clearCookie(customerCookieName, options)
  return res.json({ success: true })
})

customerAuthRouter.get('/me', async (req, res) => {
  try {
    const customer = await readCustomerSession(req)
    if (!customer) return res.status(401).json({ error: 'Entre na sua conta para continuar.' })
    return res.json({ customer })
  } catch { return res.status(500).json({ error: 'Não foi possível consultar sua conta.' }) }
})

customerAuthRouter.get('/orders', async (req, res) => {
  try {
    const customer = await readCustomerSession(req)
    if (!customer) return res.status(401).json({ error: 'Entre na sua conta para ver seus pedidos.' })
    const orders = await prisma.order.findMany({
      where: { accountId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100,
      select: {
        id: true, status: true, paymentStatus: true, paymentMethod: true,
        total: true, createdAt: true, shippingCompany: true, shippingServiceName: true,
        items: { select: { productName: true, quantity: true } },
      },
    })
    return res.json({ orders })
  } catch { return res.status(500).json({ error: 'Não foi possível consultar seus pedidos.' }) }
})

// Respostas neutras para evitar a descoberta de contas por e-mail.
const emailLimit = authAttemptLimit(12, 15 * 60 * 1000)
const emailAttempts = new Map<string, number>()
const emailMessage = 'Se houver uma conta elegível para este e-mail, você receberá um link. Confira também o spam.'
for (const [route, purpose] of [['/forgot-password', 'RESET_PASSWORD'], ['/resend-verification', 'VERIFY_EMAIL']] as const) {
  customerAuthRouter.post(route, emailLimit, async (req, res) => {
    try {
      try { mailConfiguration() } catch { return res.status(503).json({ error: 'O envio de e-mails ainda não está configurado. Tente novamente mais tarde.' }) }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
      if (email.length > 254 || !/^[^\s@]+@gmail\.com$/.test(email)) return res.status(400).json({ error: 'Informe um endereço @gmail.com válido.' })
      const now = Date.now()
      for (const [key, expiry] of emailAttempts) if (expiry <= now) emailAttempts.delete(key)
      // Limite por destinatário além do limite por IP, sem revelar sua existência.
      const key = `${purpose}:${email}`
      if ((emailAttempts.get(key) || 0) > now) return res.json({ message: emailMessage })
      if (emailAttempts.size >= 10000) emailAttempts.delete(emailAttempts.keys().next().value!)
      emailAttempts.set(key, now + 60000)
      const account = await prisma.customerAccount.findUnique({ where: { email } })
      if (account && (purpose === 'RESET_PASSWORD' || !account.emailVerifiedAt)) {
        // A resposta não espera o SMTP, evitando diferenças que revelem contas.
        void sendAccountLink(account, purpose).catch(() => { console.error('Falha ao entregar link de acesso por e-mail') })
      }
      return res.json({ message: emailMessage })
    } catch { return res.status(500).json({ error: 'Não foi possível solicitar o link. Tente novamente.' }) }
  })
}

customerAuthRouter.post('/verify-email', emailLimit, async (req, res) => {
  const token: unknown = req.body?.token
  if (!validAccountToken(token)) return res.status(400).json({ error: invalidAccountLink })
  try {
    await consumeAccountLink(token, 'VERIFY_EMAIL')
    return res.json({ message: 'E-mail confirmado! Agora você pode entrar na sua conta.' })
  } catch { return res.status(400).json({ error: invalidAccountLink }) }
})

customerAuthRouter.post('/reset-password', emailLimit, async (req, res) => {
  const token: unknown = req.body?.token
  const password: unknown = req.body?.password
  if (!validAccountToken(token)) return res.status(400).json({ error: invalidAccountLink })
  if (typeof password !== 'string' || password.length < 8 || !password.trim() || new TextEncoder().encode(password).length > 72) return res.status(400).json({ error: 'Use uma senha com pelo menos 8 caracteres e no máximo 72 bytes.' })
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    await consumeAccountLink(token, 'RESET_PASSWORD', passwordHash)
    const options = cookieOptions()
    delete options.maxAge
    res.clearCookie(customerCookieName, options)
    return res.json({ message: 'Senha atualizada! Entre novamente com sua nova senha.' })
  } catch { return res.status(400).json({ error: invalidAccountLink }) }
})

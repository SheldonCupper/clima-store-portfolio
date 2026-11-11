import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { OAuth2Client, type TokenPayload } from 'google-auth-library'
import prisma from './prisma'
import { authAttemptLimit, setCustomerSession } from './customerAuth'
import { isAdminEmail } from './adminAuth'

const cookieName = 'google_login'
const paths = ['/checkout', '/conta', '/meus-pedidos']
export function googleConfiguration() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const publicUrl = new URL(process.env.APP_PUBLIC_URL || 'http://localhost:5173')
  const redirectUri = new URL('/api/customer/google/callback', publicUrl).href
  if (!clientId || !clientSecret || !process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' && publicUrl.protocol !== 'https:')) throw new Error('Login Google indisponível.')
  return { clientId, clientSecret, redirectUri, origin: publicUrl.origin }
}
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/customer/google', maxAge: 10 * 60 * 1000 })
export const googleProvider = {
  async identity(code: string, verifier: string, config: ReturnType<typeof googleConfiguration>) {
    const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri)
    const { tokens } = await client.getToken({ code, codeVerifier: verifier })
    if (!tokens.id_token) throw new Error('Identidade ausente.')
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId })
    return ticket.getPayload()
  },
}
export function validateGoogleIdentity(payload: (TokenPayload & { nonce?: string }) | undefined, nonce: string) {
  if (!payload || payload.nonce !== nonce || !payload.sub || !payload.email_verified || !payload.email || !/^[^\s@]+@gmail\.com$/i.test(payload.email)) throw new Error('Use uma conta Gmail verificada.')
  if (isAdminEmail(payload.email)) throw new Error('Entre no painel com sua senha de administrador.')
  return { subject: payload.sub, email: payload.email.toLowerCase(), name: (payload.name || payload.email.split('@')[0]).slice(0, 120) }
}
export async function googleAccount(identity: ReturnType<typeof validateGoogleIdentity>) {
  // Apenas Gmail verificado é vinculado. Uma conta local pendente não ganha acesso
  // pelo Google, pois sua senha pode ter sido cadastrada por outra pessoa.
  return prisma.$transaction(async tx => {
    const linked = await tx.customerAccount.findUnique({ where: { googleSubject: identity.subject } })
    if (linked) {
      if (linked.email !== identity.email) throw new Error('A identidade Google mudou. Entre com sua senha.')
      return linked
    }
    const existing = await tx.customerAccount.findUnique({ where: { email: identity.email } })
    if (existing) {
      if (!existing.emailVerifiedAt || existing.googleSubject) throw new Error('Confirme o e-mail da conta existente e tente novamente.')
      return tx.customerAccount.update({ where: { id: existing.id, AND: [{ googleSubject: null }], sessionVersion: existing.sessionVersion, emailVerifiedAt: existing.emailVerifiedAt }, data: { googleSubject: identity.subject } })
    }
    return tx.customerAccount.create({ data: { name: identity.name, email: identity.email, phone: '', cpf: '', passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12), googleSubject: identity.subject, emailVerifiedAt: new Date(), verificationRequired: true } })
  })
}
export const googleAuthRouter = Router()
googleAuthRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next() })
googleAuthRouter.get('/status', (_req, res) => {
  try { googleConfiguration(); return res.json({ enabled: true }) } catch { return res.json({ enabled: false }) }
})
googleAuthRouter.get('/start', authAttemptLimit(), (req, res) => {
  try {
    const config = googleConfiguration()
    const state = randomBytes(32).toString('base64url')
    const nonce = randomBytes(32).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const next = typeof req.query.next === 'string' && paths.includes(req.query.next) ? req.query.next : '/conta'
    const flow = jwt.sign({ state, nonce, verifier, next }, process.env.JWT_SECRET!, { algorithm: 'HS256', audience: 'google-login', issuer: 'ecommerce-api', expiresIn: '10m' })
    res.cookie(cookieName, flow, cookieOptions())
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString()
    return res.redirect(url.href)
  } catch { return res.status(503).json({ error: 'O login com Google ainda não está configurado. Use e-mail e senha.' }) }
})
googleAuthRouter.get('/callback', authAttemptLimit(), async (req, res) => {
  res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined })
  let destination = '/conta'
  try {
    const config = googleConfiguration()
    const flow = jwt.verify(req.cookies?.[cookieName] || '', process.env.JWT_SECRET!, { algorithms: ['HS256'], audience: 'google-login', issuer: 'ecommerce-api' })
    if (typeof flow === 'string' || typeof flow.state !== 'string' || flow.state !== req.query.state || typeof flow.nonce !== 'string' || typeof flow.verifier !== 'string' || typeof req.query.code !== 'string' || req.query.code.length > 4096) throw new Error('Retorno inválido.')
    destination = paths.includes(flow.next) ? flow.next : '/conta'
    const payload = await googleProvider.identity(req.query.code, flow.verifier, config)
    const identity = validateGoogleIdentity(payload, flow.nonce)
    const account = await googleAccount(identity)
    setCustomerSession(res, account.id, process.env.JWT_SECRET!, account.sessionVersion)
    return res.redirect(new URL(destination, config.origin).href)
  } catch {
    // Nunca inclui tokens, dados pessoais ou mensagens do provedor na URL/log.
    const origin = new URL(process.env.APP_PUBLIC_URL || 'http://localhost:5173').origin
    return res.redirect(new URL(`/entrar?google=error&next=${encodeURIComponent(destination)}`, origin).href)
  }
})

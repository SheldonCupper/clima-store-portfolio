import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const adminCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
})

export function clearAdminSession(res: Response) {
  res.clearCookie('admin_token', adminCookieOptions())
}

export function isAdminEmail(email: string) {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  return Boolean(configured && email.trim().toLowerCase() === configured)
}

// A identidade administrativa vem do .env, nunca de um papel enviado pelo navegador.
export async function signInAdmin(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || email.length > 254 || new TextEncoder().encode(password).length > 72) {
    return res.status(400).json({ error: 'Informe seu e-mail e senha.' })
  }
  const configuredEmail = process.env.ADMIN_EMAIL?.trim()
  const hash = process.env.ADMIN_PASSWORD_HASH
  const secret = process.env.JWT_SECRET
  if (!configuredEmail || !hash || !secret?.trim()) {
    return res.status(500).json({ error: 'Administrador não configurado no servidor.' })
  }
  try {
    const matches = await bcrypt.compare(password, hash)
    if (!isAdminEmail(email) || !matches) return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    const token = jwt.sign({ email: configuredEmail, role: 'ADMIN' }, secret, { algorithm: 'HS256', expiresIn: '8h' })
    res.cookie('admin_token', token, { ...adminCookieOptions(), maxAge: 8 * 60 * 60 * 1000 })
    res.clearCookie('customer_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api' })
    return res.json({ success: true, role: 'ADMIN', admin: { email: configuredEmail } })
  } catch {
    return res.status(500).json({ error: 'Não foi possível entrar. Tente novamente.' })
  }
}

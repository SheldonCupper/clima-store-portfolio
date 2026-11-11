import type { CookieOptions, NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { readCustomerSession } from './customerAuth'

const audience = 'order-confirmation'
const issuer = 'ecommerce-api'
const accessLifetimeSeconds = 30 * 24 * 60 * 60

export function orderAccessCookieName(orderId: number) {
  return `order_access_${orderId}`
}

export function createOrderAccessToken(orderId: number, secret: string) {
  return jwt.sign({ purpose: 'ORDER_VIEW' }, secret, {
    algorithm: 'HS256',
    subject: String(orderId),
    audience,
    issuer,
    expiresIn: accessLifetimeSeconds,
  })
}

export function orderAccessCookieOptions(orderId: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/api/orders/${orderId}`,
    maxAge: accessLifetimeSeconds * 1000,
  }
}

export async function requireOrderAccess(req: Request, res: Response, next: NextFunction) {
  // Inclui respostas negadas: nunca permita cache de uma consulta de pedido.
  res.setHeader('Cache-Control', 'no-store')
  const orderId = Number(req.params.id)
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'Número do pedido inválido' })
  }

  const token = req.cookies?.[orderAccessCookieName(orderId)]
  const secret = process.env.JWT_SECRET
  if (!secret?.trim()) {
    return res.status(500).json({ error: 'Configuração de autenticação ausente' })
  }

  try {
    const payload = typeof token === 'string' && token ? jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience,
      issuer,
      subject: String(orderId),
    }) : null
    if (payload && typeof payload !== 'string' && payload.purpose === 'ORDER_VIEW') return next()
  } catch { /* Uma conta autenticada também pode autorizar o próprio pedido. */ }

  try {
    const customer = await readCustomerSession(req)
    if (customer) {
      const owned = await prisma.order.findFirst({ where: { id: orderId, accountId: customer.id }, select: { id: true } })
      if (owned) return next()
    }
  } catch {
    return res.status(500).json({ error: 'Não foi possível verificar o acesso ao pedido.' })
  }
  return res.status(401).json({ error: 'Acesso ao pedido não autorizado. Entre na sua conta ou use o navegador da compra.' })
}

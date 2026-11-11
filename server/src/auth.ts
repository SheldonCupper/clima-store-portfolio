import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

type AdminToken = {
  email: string
  role: 'ADMIN'
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.admin_token

    if (!token) {
      return res.status(401).json({
        error: 'Não autenticado',
      })
    }

    const secret = process.env.JWT_SECRET

    if (!secret) {
      console.error('JWT_SECRET não configurado')

      return res.status(500).json({
        error: 'Configuração de autenticação ausente',
      })
    }

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AdminToken

    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acesso negado',
      })
    }

    res.locals.adminEmail = typeof decoded.email === 'string' && decoded.email.length <= 254 ? decoded.email : 'admin'
    return next()
  } catch {
    return res.status(401).json({
      error: 'Sessão inválida ou expirada',
    })
  }
}

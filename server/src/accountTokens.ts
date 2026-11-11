import { createHash, randomBytes } from 'node:crypto'
import prisma from './prisma'
import { accountMailer, mailConfiguration } from './mailer'

type Purpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD'
export function hashAccountToken(token: string) { return createHash('sha256').update(token).digest('hex') }
export function validAccountToken(token: unknown): token is string { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) }
export const invalidAccountLink = 'Este link é inválido, expirou ou já foi usado. Solicite um novo link.'

export async function sendAccountLink(account: { id: number; email: string; sessionVersion: number }, purpose: Purpose) {
  mailConfiguration()
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashAccountToken(token)
  await prisma.customerAuthToken.create({ data: { tokenHash, accountId: account.id, purpose, sessionVersion: account.sessionVersion, expiresAt: new Date(Date.now() + (purpose === 'VERIFY_EMAIL' ? 24 * 60 : 30) * 60000) } })
  try { await accountMailer.send(account.email, purpose, token) }
  catch {
    // Falha de entrega não deixa um link utilizável ou expõe o erro do provedor.
    await prisma.customerAuthToken.updateMany({ where: { tokenHash, consumedAt: null }, data: { consumedAt: new Date() } })
    throw new Error('Não foi possível enviar o e-mail. Tente solicitar um novo link mais tarde.')
  }
}

export async function consumeAccountLink(token: string, purpose: Purpose, passwordHash?: string) {
  const tokenHash = hashAccountToken(token)
  return prisma.$transaction(async tx => {
    const now = new Date()
    const stored = await tx.customerAuthToken.findUnique({ where: { tokenHash } })
    if (!stored || stored.purpose !== purpose || stored.consumedAt || stored.expiresAt <= now) throw new Error(invalidAccountLink)
    const claimed = await tx.customerAuthToken.updateMany({ where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
    if (claimed.count !== 1) throw new Error(invalidAccountLink)
    const updated = await tx.customerAccount.updateMany({
      where: { id: stored.accountId, sessionVersion: stored.sessionVersion },
      data: purpose === 'RESET_PASSWORD'
        ? { passwordHash: passwordHash!, emailVerifiedAt: now, sessionVersion: { increment: 1 } }
        : { emailVerifiedAt: now },
    })
    if (updated.count !== 1) throw new Error(invalidAccountLink)
    await tx.customerAuthToken.updateMany({ where: { accountId: stored.accountId, ...(purpose === 'VERIFY_EMAIL' ? { purpose } : {}), consumedAt: null }, data: { consumedAt: now } })
  })
}

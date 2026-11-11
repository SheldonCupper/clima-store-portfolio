import { Router } from 'express'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { authAttemptLimit, readCustomerSession } from './customerAuth'
export const productReviewsRouter = Router()
function productId(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw Error('Produto inválido.'); return id }
export function reviewInput(input: unknown) {
  const data = input as { rating?: unknown; comment?: unknown }
  if (!data || !Number.isInteger(data.rating) || Number(data.rating) < 1 || Number(data.rating) > 5 || typeof data.comment !== 'string' || data.comment.trim().length < 10 || data.comment.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data.comment)) throw Error('Escolha uma nota de 1 a 5 e escreva de 10 a 2.000 caracteres.')
  return { rating: Number(data.rating), comment: data.comment.trim() }
}
const purchase = (id: number, accountId: number) => prisma.order.findFirst({ where: { accountId, paymentStatus: 'APPROVED', paymentReviewRequired: false, status: { not: 'CANCELED' }, items: { some: { productId: id, isService: false } }, paymentCheckouts: { some: { environment: 'production', payments: { some: { providerStatus: 'approved', refundedAmount: 0 } } } } }, select: { id: true } })
const publicReview = (review: { id: string; rating: number; comment: string; createdAt: Date; account: { name: string } }) => ({ id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt, author: review.account.name.trim().split(/\s+/)[0] || 'Cliente', verifiedPurchase: true })
productReviewsRouter.get('/products/:id/reviews', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const id = productId(req.params.id)
    if (!await prisma.product.findFirst({ where: { id, active: true, isService: false }, select: { id: true } })) return res.status(404).json({ error: 'Produto não encontrado.' })
    const account = await readCustomerSession(req)
    const where = { productId: id, status: 'APPROVED' }
    const [reviews, stats, own, eligible] = await Promise.all([
      prisma.productReview.findMany({ where, include: { account: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.productReview.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      account ? prisma.productReview.findUnique({ where: { productId_accountId: { productId: id, accountId: account.id } }, select: { rating: true, comment: true, status: true } }) : null,
      account ? purchase(id, account.id) : null,
    ])
    return res.json({ reviews: reviews.map(publicReview), total: stats._count._all, average: stats._avg.rating, own, eligible: Boolean(eligible), limit: 50 })
  } catch { return res.status(503).json({ error: 'Não foi possível consultar as avaliações.' }) }
})
productReviewsRouter.post('/products/:id/reviews', authAttemptLimit(12), async (req, res) => {
  try {
    const account = await readCustomerSession(req)
    if (!account) return res.status(401).json({ error: 'Entre na sua conta para avaliar.' })
    const id = productId(req.params.id), data = reviewInput(req.body)
    if (!await prisma.product.findFirst({ where: { id, active: true, isService: false }, select: { id: true } })) return res.status(404).json({ error: 'Produto não encontrado.' })
    if (!await purchase(id, account.id)) return res.status(403).json({ error: 'Avaliações são liberadas para compradores com pagamento real aprovado deste produto. Compras de teste não habilitam avaliações.' })
    await prisma.productReview.upsert({ where: { productId_accountId: { productId: id, accountId: account.id } }, create: { ...data, productId: id, accountId: account.id }, update: { ...data, status: 'PENDING' } })
    return res.json({ success: true, message: 'Avaliação recebida! Ela aparecerá após a análise da Clima.' })
  } catch (error) { return res.status(400).json({ error: error instanceof Error && !('code' in error) ? error.message : 'Não foi possível salvar a avaliação.' }) }
})
productReviewsRouter.get('/admin/products/:id/reviews', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { const id = productId(req.params.id); return res.json(await prisma.productReview.findMany({ where: { productId: id }, select: { id: true, rating: true, comment: true, status: true, createdAt: true, updatedAt: true, account: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })) }
  catch { return res.status(400).json({ error: 'Não foi possível carregar as avaliações.' }) }
})
productReviewsRouter.patch('/admin/product-reviews/:id', requireAdmin, async (req, res) => {
  try {
    if (!['APPROVED', 'REJECTED'].includes(req.body?.status) || Object.keys(req.body).some(key => !['status', 'updatedAt'].includes(key))) throw Error('Escolha publicar ou ocultar a avaliação.')
    if (typeof req.body.updatedAt !== 'string' || !Number.isFinite(Date.parse(req.body.updatedAt))) throw Error('Atualize a lista antes de moderar.')
    const result = await prisma.productReview.updateMany({ where: { id: String(req.params.id), updatedAt: new Date(req.body.updatedAt) }, data: { status: req.body.status } })
    return result.count ? res.json({ success: true }) : res.status(409).json({ error: 'A avaliação mudou. Atualize a lista antes de publicar.' })
  } catch { return res.status(400).json({ error: 'Não foi possível atualizar a avaliação.' }) }
})

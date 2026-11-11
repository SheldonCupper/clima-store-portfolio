import { SERVICE_QUANTITY_LIMIT } from '../../shared/services'
import { Router } from 'express'
import type { Coupon, Prisma } from '../../generated/prisma/client'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { authAttemptLimit, readCustomerSession } from './customerAuth'
import { validateShippingItems } from './shipping'
import { couponCode, couponDiscount, moneyCents, parseCouponInput } from '../../shared/coupons'

function rules(coupon: Coupon) {
  return { ...coupon, kind: coupon.kind as 'PERCENT' | 'FIXED', value: String(coupon.value), minSubtotal: String(coupon.minSubtotal), maxDiscount: coupon.maxDiscount === null ? null : String(coupon.maxDiscount) }
}
export const welcomeCouponId = 'clima-welcome-first-purchase'
export const welcomeCouponCode = 'BOASVINDAS'
type AccountIdentity = { id: number; email: string; cpf: string }
export async function welcomeEligibility(db: Pick<Prisma.TransactionClient, 'order'>, account: AccountIdentity | null) {
  if (!account) throw new Error('Entre na sua conta para usar o cupom de boas-vindas.')
  const previous = await db.order.findFirst({ where: { status: { not: 'CANCELED' }, OR: [{ accountId: account.id }, { customer: { email: account.email } }, ...(account.cpf ? [{ customer: { cpf: account.cpf } }] : [])] }, select: { id: true } })
  if (previous) throw new Error('O cupom de boas-vindas é exclusivo da primeira compra. Você já tem um pedido em andamento ou concluído.')
}
export async function claimCoupon(tx: Prisma.TransactionClient, raw: unknown, subtotalCents: number, account: AccountIdentity | null = null) {
  if (raw === undefined || raw === null || raw === '') return null
  const code = couponCode(raw)
  // Serializa usos e edição do benefício, inclusive entre contas com o mesmo CPF.
  if (code === welcomeCouponCode) await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${welcomeCouponId} FOR UPDATE`
  const coupon = await tx.coupon.findUnique({ where: { code } })
  if (!coupon) throw new Error('Cupom inválido, inativo ou fora da validade.')
  if (coupon.id === welcomeCouponId) await welcomeEligibility(tx, account)
  const discountCents = couponDiscount(rules(coupon), subtotalCents)
  if (discountCents < 1) throw new Error('O desconto deste cupom não se aplica ao carrinho.')
  const now = new Date()
  const claimed = await tx.coupon.updateMany({ where: {
    id: coupon.id, active: true,
    ...(coupon.usageLimit === null ? {} : { usedCount: { lt: coupon.usageLimit } }),
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  }, data: { usedCount: { increment: 1 } } })
  if (claimed.count !== 1) throw new Error('Este cupom ficou indisponível. Remova-o ou tente novamente.')
  return { id: coupon.id, code, discountCents }
}
export const couponsRouter = Router()
couponsRouter.use(['/admin/coupons', '/coupons', '/customer/coupons'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
couponsRouter.get('/admin/coupons', requireAdmin, async (_req, res) => {
  try { return res.json(await prisma.coupon.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } })) }
  catch { return res.status(500).json({ error: 'Não foi possível carregar os cupons.' }) }
})
couponsRouter.put('/admin/coupons/welcome', requireAdmin, async (req, res) => {
  try {
    const input = parseCouponInput({ ...req.body, code: welcomeCouponCode, usageLimit: null, startsAt: null, expiresAt: null })
    const coupon = await prisma.coupon.upsert({ where: { id: welcomeCouponId }, create: { id: welcomeCouponId, ...input }, update: { ...input, deletedAt: null, ...(req.body.published === undefined ? { published: undefined } : {}) } })
    return res.json(coupon)
  } catch (error) { return res.status(400).json({ error: error instanceof Error && !('code' in error) ? error.message : 'Não foi possível salvar o benefício de boas-vindas.' }) }
})
couponsRouter.get('/coupons/welcome', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const account = await readCustomerSession(req)
    if (!account) return res.json({ coupon: null })
    const coupon = await prisma.coupon.findUnique({ where: { id: welcomeCouponId } })
    if (!coupon?.active) return res.json({ coupon: null })
    try { await welcomeEligibility(prisma, account) } catch { return res.json({ coupon: null }) }
    return res.json({ coupon: { code: coupon.code, kind: coupon.kind, value: String(coupon.value), minSubtotal: String(coupon.minSubtotal), maxDiscount: coupon.maxDiscount === null ? null : String(coupon.maxDiscount) } })
  } catch { return res.status(503).json({ error: 'Não foi possível consultar o benefício.' }) }
})
couponsRouter.post('/admin/coupons', requireAdmin, async (req, res) => {
  let input
  try { input = parseCouponInput(req.body); if (input.code === welcomeCouponCode) throw new Error('Configure BOASVINDAS na seção de primeira compra.') } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Cupom inválido.' }) }
  try { return res.status(201).json(await prisma.coupon.create({ data: input })) }
  catch (error) { return res.status((error as { code?: string }).code === 'P2002' ? 409 : 500).json({ error: (error as { code?: string }).code === 'P2002' ? 'Já existe um cupom com este código.' : 'Não foi possível criar o cupom.' }) }
})
couponsRouter.patch('/admin/coupons/:id', requireAdmin, async (req, res) => {
  const keys = Object.keys(req.body ?? {})
  if (!keys.length || keys.some(key => !['active', 'published'].includes(key) || typeof req.body[key] !== 'boolean')) return res.status(400).json({ error: 'É possível ativar, pausar ou alterar a divulgação. Para outras condições, crie um novo cupom.' })
  try {
    const result = await prisma.coupon.updateMany({ where: { id: String(req.params.id), deletedAt: null }, data: { ...(keys.includes('active') ? { active: req.body.active } : {}), ...(keys.includes('published') ? { published: req.body.published } : {}) } })
    return result.count ? res.json({ success: true }) : res.status(404).json({ error: 'Cupom não encontrado.' })
  } catch { return res.status(500).json({ error: 'Não foi possível atualizar o cupom.' }) }
})
couponsRouter.delete('/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id)
    if (!id || id.length > 100 || typeof req.body?.confirmation !== 'string') return res.status(400).json({ error: 'Confirme o código do cupom para excluir.' })
    const coupon = await prisma.coupon.findUnique({ where: { id } })
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado.' })
    if (req.body.confirmation !== coupon.code) return res.status(400).json({ error: 'O código informado não corresponde ao cupom.' })
    // Preserva vínculos de pedidos e carteiras. O mesmo UPDATE bloqueia novos usos.
    await prisma.coupon.updateMany({ where: { id, deletedAt: null }, data: { active: false, published: false, deletedAt: new Date() } })
    return res.json({ success: true, message: `Cupom ${coupon.code} excluído. O histórico dos pedidos foi preservado.` })
  } catch { return res.status(500).json({ error: 'Não foi possível excluir o cupom. Tente novamente.' }) }
})
export function couponUnavailable(coupon: Coupon, now = new Date()) {
  if (coupon.deletedAt) return 'Cupom encerrado pela loja.'
  if (!coupon.active) return 'Campanha pausada.'
  if (coupon.startsAt && coupon.startsAt > now) return 'Campanha ainda não começou.'
  if (coupon.expiresAt && coupon.expiresAt <= now) return 'Cupom expirado.'
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'Limite de utilizações atingido.'
  return ''
}
function offer(coupon: Coupon, unavailable = '', saved = false) {
  return { id: coupon.id, code: coupon.code, kind: coupon.kind, value: String(coupon.value), minSubtotal: String(coupon.minSubtotal), maxDiscount: coupon.maxDiscount === null ? null : String(coupon.maxDiscount), expiresAt: coupon.expiresAt, firstPurchase: coupon.id === welcomeCouponId, unavailable, saved }
}
async function unavailableFor(coupon: Coupon, account: AccountIdentity | null) {
  const reason = couponUnavailable(coupon)
  if (reason) return reason
  if (coupon.id === welcomeCouponId && account) {
    try { await welcomeEligibility(prisma, account) } catch { return 'Exclusivo para a primeira compra.' }
  }
  return ''
}
// Salvar na carteira não reserva utilizações nem garante desconto futuro.
export async function redeemCoupon(couponId: string, account: AccountIdentity) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${couponId} FOR UPDATE`
    const coupon = await tx.coupon.findUnique({ where: { id: couponId } })
    if (!coupon?.published) throw new Error('Cupom não disponível para resgate.')
    const reason = couponUnavailable(coupon)
    if (reason) throw new Error(reason)
    if (coupon.id === welcomeCouponId) await welcomeEligibility(tx, account)
    await tx.couponClaim.upsert({ where: { couponId_accountId: { couponId, accountId: account.id } }, create: { couponId, accountId: account.id }, update: {} })
    return offer(coupon, '', true)
  })
}
couponsRouter.get('/coupons/available', async (req, res) => {
  try {
    const account = await readCustomerSession(req)
    const now = new Date()
    const coupons = await prisma.coupon.findMany({ where: { deletedAt: null, published: true, active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] }, orderBy: { createdAt: 'desc' }, take: 100 })
    const saved = account ? await prisma.couponClaim.findMany({ where: { accountId: account.id }, select: { couponId: true } }) : []
    const offers = await Promise.all(coupons.map(async coupon => offer(coupon, await unavailableFor(coupon, account), saved.some(item => item.couponId === coupon.id))))
    return res.json({ coupons: offers.filter(item => !item.unavailable) })
  } catch { return res.status(503).json({ error: 'Não foi possível consultar os cupons.' }) }
})
couponsRouter.get('/customer/coupons', async (req, res) => {
  try {
    const account = await readCustomerSession(req)
    if (!account) return res.status(401).json({ error: 'Entre na sua conta para ver seus cupons.' })
    const claims = await prisma.couponClaim.findMany({ where: { accountId: account.id }, include: { coupon: true }, orderBy: { claimedAt: 'desc' } })
    return res.json({ coupons: await Promise.all(claims.map(async claim => offer(claim.coupon, await unavailableFor(claim.coupon, account), true))) })
  } catch { return res.status(503).json({ error: 'Não foi possível carregar seus cupons.' }) }
})
couponsRouter.post('/customer/coupons/:id/redeem', authAttemptLimit(60), async (req, res) => {
  try {
    const account = await readCustomerSession(req)
    if (!account) return res.status(401).json({ error: 'Entre na sua conta para resgatar cupons.' })
    const id = String(req.params.id)
    if (!id || id.length > 100) throw new Error('Cupom inválido.')
    return res.json({ coupon: await redeemCoupon(id, account) })
  } catch (error) { return res.status(400).json({ error: error instanceof Error && !('code' in error) ? error.message : 'Não foi possível resgatar o cupom.' }) }
})
couponsRouter.post('/coupons/preview', authAttemptLimit(60), async (req, res) => {
  try {
    const code = couponCode(req.body?.code)
    const method = req.body?.paymentMethod
    if (method !== 'PIX' && method !== 'CREDIT_CARD') throw new Error('Forma de pagamento inválida.')
    const items = validateShippingItems(req.body.items)
    if (items.length > 100) throw new Error('Carrinho muito grande.')
    const products = await prisma.product.findMany({ where: { id: { in: items.map(item => item.productId) }, active: true } })
    let subtotal = 0
    const itemPrices = items.map(item => {
      const product = products.find(product => product.id === item.productId)
      if (!product || (!product.isService && product.stock < item.quantity) || (product?.isService && item.quantity > SERVICE_QUANTITY_LIMIT)) throw new Error('Há um produto indisponível ou sem estoque. Confira o carrinho.')
      const unit = moneyCents(String(method === 'PIX' && product.pixPrice !== null ? product.pixPrice : product.price))
      subtotal += unit * item.quantity
      return { productId: product.id, unitPrice: unit / 100 }
    })
    const coupon = await prisma.coupon.findUnique({ where: { code } })
    if (!coupon) throw new Error('Cupom inválido, inativo ou fora da validade.')
    if (coupon.id === welcomeCouponId) await welcomeEligibility(prisma, await readCustomerSession(req))
    const discount = couponDiscount(rules(coupon), subtotal)
    if (discount < 1) throw new Error('O desconto deste cupom não se aplica ao carrinho.')
    return res.json({ code, subtotal: subtotal / 100, discount: discount / 100, itemPrices })
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível validar o cupom.' }) }
})

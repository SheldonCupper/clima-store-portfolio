import { Router } from 'express'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { authAttemptLimit } from './customerAuth'
import { PaymentError, cents, mercadoPagoApi, object, paymentConfiguration, providerOrderId, verifiedSeller, type PaymentConfig } from './mercadoPago'
import { reconcilePayment, validatedPayment } from './payments'
import { changeOrderStatus, changeOrderStatusInTransaction, OrderStatusError } from './orderStatus'
import type { Order, OrderRefund, PaymentCheckout } from '../../generated/prisma/client'

function cancelable(order: Order) {
  if (order.paymentReviewRequired) throw new PaymentError('Pagamento em conferência. Confira cobranças, reembolsos parciais ou contestações no Mercado Pago antes de continuar.')
  if (['SHIPPED', 'DELIVERED'].includes(order.status)) throw new PaymentError('O pedido já saiu para entrega. Confira a devolução antes de cancelar e repor o estoque.')
  if (order.status === 'CANCELED' || order.stockRestoredAt) throw new PaymentError('Este pedido já está cancelado. Atualize a página para conferir o pagamento.')
}
async function currentOrder(id: number) {
  const order = await prisma.order.findUnique({ where: { id }, include: { refundRequest: true, paymentCheckouts: true } })
  if (!order) throw new PaymentError('Pedido não encontrado.', 404)
  return order
}
function binding(request: OrderRefund, checkout: PaymentCheckout, config: PaymentConfig, sellerId: string) {
  if (request.checkoutId !== checkout.id || request.environment !== config.environment || request.sellerId !== sellerId || cents(request.amount) !== cents(checkout.amount)) throw new PaymentError('O estorno precisa ser conferido na conta e no ambiente que receberam a venda.')
}
async function consult(orderId: number, checkout: PaymentCheckout, config: PaymentConfig, sellerId: string) {
  const order = await currentOrder(orderId), id = providerOrderId(checkout.preferenceId)
  const authoritative = await mercadoPagoApi.request(`/v1/orders/${id}`, config)
  if (object(authoritative).id !== id) throw new PaymentError('A cobrança consultada não corresponde ao pedido.')
  const checked = validatedPayment(authoritative, checkout, order)
  if (!await reconcilePayment(authoritative, config, sellerId)) throw new PaymentError('A cobrança não corresponde à venda registrada.')
  await prisma.paymentCheckout.update({ where: { id: checkout.id }, data: { lastSyncedAt: new Date() } })
  return checked
}
async function finishCancellation(id: number, requestId?: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`
    const order = await tx.order.findUniqueOrThrow({ where: { id } })
    if (order.paymentStatus !== 'REFUNDED' || order.paymentReviewRequired) throw new PaymentError('O reembolso integral ainda não foi confirmado. O estoque permanece reservado.')
    if (requestId) await tx.orderRefund.update({ where: { id: requestId, orderId: id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } })
    return changeOrderStatusInTransaction(tx, id, 'CANCELED')
  })
}
export async function cancelOrderWithRefund(id: number, expectedTotal: unknown, requestedBy: string) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new PaymentError('Número de pedido inválido.', 400)
  let order = await currentOrder(id)
  if (cents(expectedTotal) !== cents(order.total)) throw new PaymentError('O total mudou. Abra a confirmação novamente para conferir o valor.')
  if (order.status === 'CANCELED' && !order.paymentReviewRequired && ['REFUNDED', 'CANCELED'].includes(order.paymentStatus)) return { pending: false, order }
  cancelable(order)
  if (!order.paymentCheckouts.length) {
    if (order.paymentStatus === 'APPROVED' || order.refundRequest) throw new PaymentError('Não há cobrança vinculada para solicitar o estorno. Confira o pagamento diretamente no provedor.')
    return { pending: false, order: await changeOrderStatus(id, 'CANCELED') }
  }
  if (order.paymentCheckouts.length !== 1) throw new PaymentError('Há cobranças em mais de um ambiente. Confira o pedido no Mercado Pago antes de cancelar.')
  const checkout = order.paymentCheckouts[0], config = paymentConfiguration(), sellerId = await verifiedSeller(config)
  if (checkout.environment !== config.environment || checkout.sellerId !== sellerId) throw new PaymentError('Use a conta e o ambiente do Mercado Pago que receberam esta venda.')
  if (order.refundRequest) binding(order.refundRequest, checkout, config, sellerId)
  let checked = await consult(id, checkout, config, sellerId)
  if (checked.review) throw new PaymentError('Há divergência no pagamento. Confira o pedido no Mercado Pago antes de solicitar um estorno.')
  if (checked.status === 'refunded') return { pending: false, order: await finishCancellation(id, order.refundRequest?.id) }
  if (checked.status !== 'approved') {
    if (order.refundRequest) return { pending: true, order: await currentOrder(id) }
    return { pending: false, order: await changeOrderStatus(id, 'CANCELED') }
  }
  const request = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`
    const latest = await tx.order.findUniqueOrThrow({ where: { id }, include: { refundRequest: true } })
    cancelable(latest)
    if (latest.paymentStatus !== 'APPROVED' || cents(latest.total) !== cents(checkout.amount)) throw new PaymentError('O pagamento mudou. Confira o pedido e tente novamente.')
    if (latest.refundRequest) { binding(latest.refundRequest, checkout, config, sellerId); return latest.refundRequest }
    // O ID é a chave de idempotência persistida ANTES da chamada financeira.
    return tx.orderRefund.create({ data: { orderId: id, checkoutId: checkout.id, environment: config.environment, sellerId, amount: latest.total, requestedBy } })
  })
  let requestFailed = false
  try {
    // Reembolso integral: nenhum valor do frontend é enviado ao provedor.
    await mercadoPagoApi.request(`/v1/orders/${providerOrderId(checkout.preferenceId)}/refund`, config, {}, request.id)
  } catch { requestFailed = true }
  try { checked = await consult(id, checkout, config, sellerId) }
  catch { throw new PaymentError('A solicitação de estorno está registrada, mas não foi possível confirmar o resultado. Confira novamente; a mesma solicitação será reutilizada e o estoque permanece reservado.', 502) }
  if (checked.review) throw new PaymentError('O Mercado Pago indicou divergência ou estorno parcial. O pedido e o estoque continuam reservados para conferência.')
  if (checked.status === 'refunded') return { pending: false, order: await finishCancellation(id, request.id) }
  order = await currentOrder(id)
  return { pending: true, order, message: requestFailed ? 'O Mercado Pago ainda não confirmou o estorno. A solicitação ficou registrada. Confira saldo/permissões no provedor e use Conferir estorno para tentar novamente com a mesma chave.' : 'Estorno solicitado. Aguarde a confirmação do Mercado Pago e use Conferir estorno para concluir o cancelamento. O estoque continua reservado.' }
}
export const orderRefundsRouter = Router()
orderRefundsRouter.use('/admin/orders', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
orderRefundsRouter.get('/admin/orders/:id/cancel-preview', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id <= 0) throw new PaymentError('Número de pedido inválido.', 400)
    const order = await currentOrder(id)
    cancelable(order)
    return res.json({ id, total: String(order.total), paymentStatus: order.paymentStatus, status: order.status, environment: order.paymentCheckouts[0]?.environment ?? null, refundPending: order.refundRequest?.status === 'REQUESTED' })
  } catch (error) { return res.status(error instanceof PaymentError ? error.statusCode : 500).json({ error: error instanceof PaymentError ? error.message : 'Não foi possível conferir o pedido.' }) }
})
orderRefundsRouter.post('/admin/orders/:id/cancel', requireAdmin, authAttemptLimit(30), async (req, res) => {
  if (req.body?.confirmation !== 'CANCELAR') return res.status(400).json({ error: 'Confirme o cancelamento e o estorno integral antes de continuar.' })
  try {
    const result = await cancelOrderWithRefund(Number(req.params.id), req.body.expectedTotal, res.locals.adminEmail || 'admin')
    const current = await currentOrder(Number(req.params.id))
    const request = current.refundRequest
    return res.status(result.pending ? 202 : 200).json({ pending: result.pending, message: 'message' in result ? result.message : undefined, order: { id: current.id, status: current.status, paymentStatus: current.paymentStatus, paymentReviewRequired: current.paymentReviewRequired, total: String(current.total), refundRequest: request ? { status: request.status, amount: String(request.amount), environment: request.environment, createdAt: request.createdAt, confirmedAt: request.confirmedAt } : null } })
  } catch (error) { return res.status(error instanceof PaymentError || error instanceof OrderStatusError ? error.statusCode : 500).json({ error: error instanceof PaymentError || error instanceof OrderStatusError ? error.message : 'Não foi possível concluir. Confira o pagamento antes de tentar novamente.' }) }
})

import { Router } from 'express'
import { Prisma, type Order, type PaymentCheckout } from '../../generated/prisma/client'
import prisma from './prisma'
import { requireOrderAccess } from './orderAccess'
import { requireAdmin } from './auth'
import { PaymentError, cents, checkoutUrl, mercadoPagoApi, object, paymentAvailability, paymentConfiguration, paymentMethods, providerId, providerOrderId, validWebhook, verifiedSeller, type PaymentConfig } from './mercadoPago'

async function lockOrder(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`
  const order = await tx.order.findUnique({ where: { id }, include: { refundRequest: true } })
  if (!order) throw new PaymentError('Pedido não encontrado.', 404)
  return order
}
function payable(order: Order & { refundRequest?: { id: string } | null }) {
  if (order.refundRequest) throw new PaymentError('Este pedido está em processo de estorno/cancelamento.')
  if (order.status === 'CANCELED' || order.stockRestoredAt || order.paymentReviewRequired || ['APPROVED', 'REFUNDED'].includes(order.paymentStatus)) throw new PaymentError('Este pedido não está disponível para um novo pagamento.')
  if (cents(order.total) <= 0) throw new PaymentError('Total do pedido inválido.')
}
function matchingOrder(value: unknown, checkout: PaymentCheckout, order: Order) {
  const result = object(value), id = providerOrderId(result.id)
  // Orders de teste têm prefixo ORDTST. O vendedor também é verificado via /users/me.
  if (id.startsWith('ORDTST') !== (checkout.environment === 'sandbox') || (result.live_mode !== undefined && result.live_mode !== (checkout.environment === 'production')) || result.type !== 'online' || result.processing_mode !== 'manual' || result.external_reference !== checkout.id || providerId(result.user_id) !== checkout.sellerId || result.country_code !== 'BRA' || result.currency !== 'BRL' || cents(result.total_amount) !== cents(checkout.amount) || cents(order.total) !== cents(checkout.amount)) throw new PaymentError('A cobrança não corresponde ao pedido.')
  if (checkout.preferenceId && checkout.preferenceId !== id) throw new PaymentError('A order não corresponde à cobrança vinculada.')
  return { result, id }
}
export async function createPaymentCheckout(orderId: number) {
  const config = paymentConfiguration()
  const snapshot = await prisma.order.findUnique({ where: { id: orderId }, include: { refundRequest: true } })
  if (!snapshot) throw new PaymentError('Pedido não encontrado.', 404)
  payable(snapshot)
  const sellerId = await verifiedSeller(config)
  // Persiste a chave ANTES da chamada externa, preservando-a em timeout/reinício.
  const checkout = await prisma.$transaction(async tx => {
    const order = await lockOrder(tx, orderId)
    payable(order)
    const existing = await tx.paymentCheckout.findUnique({ where: { orderId_environment: { orderId, environment: config.environment } } })
    if (existing) {
      if (existing.sellerId !== sellerId || cents(existing.amount) !== cents(order.total)) throw new PaymentError('Este pagamento precisa de conferência pela loja.')
      if (existing.preferenceId) providerOrderId(existing.preferenceId) // Nunca converte uma preferência antiga em nova cobrança.
      if (existing.expiresAt <= new Date()) throw new PaymentError('O link de pagamento expirou. Fale com a loja para continuar.')
      return existing
    }
    const created = await tx.paymentCheckout.create({ data: { orderId, environment: config.environment, sellerId, amount: order.total, expiresAt: new Date(Date.now() + 30 * 60000) } })
    await tx.order.update({ where: { id: orderId }, data: { updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)) } })
    return created
  })
  if (checkout.checkoutUrl) return { url: checkoutUrl(checkout.checkoutUrl), environment: config.environment }
  const methods = await paymentMethods(config, snapshot.paymentMethod)
  const back = `${config.appOrigin}/pedido/${orderId}`
  const response = await mercadoPagoApi.request('/v1/orders', config, {
    type: 'online', processing_mode: 'manual', capture_mode: 'automatic_async',
    total_amount: (cents(checkout.amount) / 100).toFixed(2), external_reference: checkout.id, expiration_time: 'PT30M',
    items: [{ title: `Pedido Clima #${orderId} (itens do pedido)`, quantity: 1, unit_price: (cents(checkout.amount) / 100).toFixed(2) }],
    config: { online: { success_url: back, pending_url: back, failure_url: back, auto_return: 'approved' }, payment_method: methods },
  }, checkout.id)
  const { result, id } = matchingOrder(response, checkout, snapshot)
  const url = checkoutUrl(result.checkout_url)
  const updated = validatedPayment(result, { ...checkout, preferenceId: id }, snapshot)
  if (updated.status !== 'pending' || result.status !== 'created') throw new PaymentError('A cobrança precisa de conferência antes de continuar.')
  return prisma.$transaction(async tx => {
    const order = await lockOrder(tx, orderId)
    payable(order)
    const saved = await tx.paymentCheckout.findUniqueOrThrow({ where: { id: checkout.id } })
    if (saved.preferenceId && saved.preferenceId !== id) throw new PaymentError('Cobrança duplicada. Entre em contato com a loja.')
    // preferenceId é o nome histórico da coluna; agora armazena exclusivamente o ID ORD da Orders API.
    await tx.paymentCheckout.update({ where: { id: checkout.id }, data: { preferenceId: id, checkoutUrl: url } })
    return { url, environment: config.environment }
  })
}

export function validatedPayment(value: unknown, checkout: PaymentCheckout, order: Order) {
  const { result, id } = matchingOrder(value, checkout, order)
  const updatedAt = new Date(String(result.last_updated_date))
  if (!Number.isFinite(updatedAt.getTime())) throw new PaymentError('Data da cobrança inválida.')
  const status = String(result.status), detail = String(result.status_detail)
  if (!['created', 'processing', 'processed', 'action_required', 'failed', 'refunded', 'canceled'].includes(status)) throw new PaymentError('Status de pagamento desconhecido.')
  const total = cents(checkout.amount)
  const transactions = result.transactions === undefined ? {} : object(result.transactions)
  const list = (key: string) => {
    const entries = transactions[key] ?? []
    if (!Array.isArray(entries) || entries.length > 100) throw new PaymentError('Transações inválidas.')
    return entries.map(object)
  }
  const payments = list('payments'), refunds = list('refunds'), chargebacks = list('chargebacks')
  // Orders novas ou encerradas sem transações podem omitir total_paid_amount.
  // Aprovações e reembolsos continuam exigindo valores explícitos.
  const emptyUnpaid = ['created', 'canceled', 'failed'].includes(status) && payments.length === 0 && refunds.length === 0 && chargebacks.length === 0
  // Após recusa, o Checkout Pro mantém a order aberta em waiting_retry e pode
  // omitir total_paid_amount. Todas as tentativas devem estar explicitamente failed.
  const retryAfterRefusal = status === 'action_required' && detail === 'waiting_retry' && payments.length > 0 && payments.every(payment => payment.status === 'failed') && refunds.length === 0 && chargebacks.length === 0
  const paid = cents(result.total_paid_amount === undefined && (emptyUnpaid || retryAfterRefusal) ? '0.00' : result.total_paid_amount)
  const ids = new Set<string>()
  let approved = 0, approvals = 0
  for (const payment of payments) {
    const paymentId = String(payment.id)
    if (!/^PAY[A-Z0-9]{20,40}$/.test(paymentId) || ids.has(paymentId)) throw new PaymentError('Identificador de transação inválido.')
    ids.add(paymentId)
    const method = object(payment.payment_method)
    if (order.paymentMethod === 'PIX' ? method.id !== 'pix' || method.type !== 'bank_transfer' : method.type !== 'credit_card') throw new PaymentError('A forma de pagamento não corresponde ao pedido.')
    const amount = cents(payment.amount)
    if (!amount || amount > total) throw new PaymentError('Valor de transação inválido.')
    if (payment.status === 'processed' && ['accredited', 'partially_refunded'].includes(String(payment.status_detail))) { approved += amount; approvals++ }
  }
  let refunded = 0
  const refundIds = new Set<string>()
  for (const refund of refunds) {
    if (typeof refund.id !== 'string' || refundIds.has(refund.id) || !ids.has(String(refund.transaction_id))) throw new PaymentError('Reembolso não corresponde às transações.')
    refundIds.add(refund.id)
    if (refund.status === 'processed') refunded += cents(refund.amount)
  }
  if (refunded > total) throw new PaymentError('Valor de reembolso inválido.')
  if (status === 'processed' && (approved < total || paid < total - refunded)) throw new PaymentError('Pagamento integral não confirmado.')
  if (status === 'refunded' && refunded !== total) throw new PaymentError('Reembolso integral não confirmado.')
  const hasOpenPayment = payments.some(payment => !['failed', 'canceled', 'cancelled', 'refunded'].includes(String(payment.status)))
  const inconsistentClosed = status === 'canceled' && (paid > 0 || approved > 0 || hasOpenPayment)
  const inconsistentPending = !['processed', 'refunded'].includes(status) && approved > 0
  const review = approvals > 1 || approved > total || paid > total || chargebacks.length > 0 || (refunded > 0 && refunded < total) || detail === 'partially_refunded' || inconsistentClosed || inconsistentPending || (retryAfterRefusal && paid > 0)
  const normalized = chargebacks.length ? 'charged_back' : status === 'processed' ? 'approved' : status === 'refunded' ? 'refunded' : status === 'canceled' ? 'cancelled' : status === 'failed' || retryAfterRefusal ? 'rejected' : 'pending'
  return { id, updatedAt, status: normalized, refunded, amount: total, review, type: order.paymentMethod === 'PIX' ? 'bank_transfer' : 'credit_card', method: order.paymentMethod === 'PIX' ? 'pix' : 'credit_card' }
}
export function paymentProjection(payments: { providerStatus: string; amount: unknown; refundedAmount: unknown }[]) {
  const paid = payments.filter(payment => payment.providerStatus === 'approved')
  const review = paid.length > 1 || payments.some(payment => ['charged_back', 'in_mediation'].includes(payment.providerStatus) || (cents(payment.refundedAmount) > 0 && cents(payment.refundedAmount) < cents(payment.amount)))
  const status = paid.length ? 'APPROVED' : payments.some(payment => payment.providerStatus === 'refunded') ? 'REFUNDED' : payments.some(payment => ['pending', 'authorized', 'in_process', 'in_mediation'].includes(payment.providerStatus)) ? 'PENDING' : payments.some(payment => payment.providerStatus === 'rejected') ? 'REFUSED' : payments.length ? 'CANCELED' : 'PENDING'
  return { status: status as Order['paymentStatus'], review }
}
export async function reconcilePayment(value: unknown, config: PaymentConfig, sellerId: string) {
  const result = object(value), id = providerOrderId(result.id)
  const checkout = await prisma.paymentCheckout.findUnique({ where: { preferenceId: id } })
  if (!checkout || checkout.environment !== config.environment || checkout.sellerId !== sellerId) return false
  return prisma.$transaction(async tx => {
    const order = await lockOrder(tx, checkout.orderId)
    const checked = validatedPayment(result, checkout, order)
    const unique = { environment: config.environment, providerPaymentId: checked.id }
    const previous = await tx.providerPayment.findUnique({ where: { environment_providerPaymentId: unique } })
    if (previous && previous.checkoutId !== checkout.id) throw new PaymentError('Pagamento vinculado a outro pedido.')
    if (previous && previous.providerUpdatedAt > checked.updatedAt) return true
    if (previous && ['refunded', 'charged_back'].includes(previous.providerStatus) && checked.status !== previous.providerStatus) return true
    if (previous?.providerStatus === 'approved' && !['approved', 'refunded', 'charged_back'].includes(checked.status)) throw new PaymentError('A cobrança mudou de forma inesperada. Fale com a loja.')
    await tx.providerPayment.upsert({ where: { environment_providerPaymentId: unique }, create: { ...unique, checkoutId: checkout.id, providerStatus: checked.status, amount: checked.amount / 100, refundedAmount: checked.refunded / 100, paymentType: checked.type, methodId: checked.method, providerUpdatedAt: checked.updatedAt }, update: { providerStatus: checked.status, refundedAmount: checked.refunded / 100, providerUpdatedAt: checked.updatedAt } })
    const payments = await tx.providerPayment.findMany({ where: { checkoutId: checkout.id } })
    const projection = paymentProjection(payments)
    const late = projection.status === 'APPROVED' && (order.status === 'CANCELED' || order.stockRestoredAt !== null)
    const review = order.paymentReviewRequired || projection.review || checked.review || late
    const status = review && order.paymentStatus === 'APPROVED' ? 'APPROVED' : projection.status
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: status, paymentReviewRequired: review, ...(status === 'APPROVED' && !review && !order.paymentApprovedAt ? { paymentApprovedAt: checked.updatedAt } : {}), ...(status === 'APPROVED' && !review && order.status === 'PENDING' ? { status: 'CONFIRMED' } : {}) } })
    return true
  })
}
const synchronizing = new Map<string, Promise<void>>()
export async function refreshOrderPayment(orderId: number) {
  const config = paymentConfiguration(), sellerId = await verifiedSeller(config)
  const checkout = await prisma.paymentCheckout.findUnique({ where: { orderId_environment: { orderId, environment: config.environment } } })
  if (!checkout) return
  if (checkout.sellerId !== sellerId) throw new PaymentError('O pagamento precisa ser consultado na conta que recebeu a venda.')
  const id = providerOrderId(checkout.preferenceId)
  const running = synchronizing.get(checkout.id)
  if (running) return running
  if (checkout.lastSyncedAt && checkout.lastSyncedAt.getTime() > Date.now() - 15000) return
  const sync = async () => {
    const authoritative = await mercadoPagoApi.request(`/v1/orders/${id}`, config)
    if (object(authoritative).id !== id || !await reconcilePayment(authoritative, config, sellerId)) throw new PaymentError('A cobrança consultada não corresponde ao pedido.')
    await prisma.paymentCheckout.update({ where: { id: checkout.id }, data: { lastSyncedAt: new Date() } })
  }
  const pending = sync().finally(() => { synchronizing.delete(checkout.id) })
  synchronizing.set(checkout.id, pending)
  return pending
}
export const paymentsRouter = Router()
paymentsRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
paymentsRouter.get('/payments/config', (_req, res) => res.json(paymentAvailability()))
function failure(res: import('express').Response, error: unknown) {
  return res.status(error instanceof PaymentError ? error.statusCode : 500).json({ error: error instanceof PaymentError ? error.message : 'Não foi possível processar o pagamento. Tente novamente.' })
}
paymentsRouter.post('/orders/:id/payment/checkout', requireOrderAccess, async (req, res) => {
  try { return res.json(await createPaymentCheckout(Number(req.params.id))) } catch (error) { return failure(res, error) }
})
paymentsRouter.post('/orders/:id/payment/refresh', requireOrderAccess, async (req, res) => {
  try { await refreshOrderPayment(Number(req.params.id)); return res.json({ success: true }) } catch (error) { return failure(res, error) }
})
paymentsRouter.post('/admin/orders/:id/payment/refresh', requireAdmin, async (req, res) => {
  try { await refreshOrderPayment(Number(req.params.id)); return res.json({ success: true }) } catch (error) { return failure(res, error) }
})
paymentsRouter.post('/payments/mercado-pago/webhook', async (req, res) => {
  try {
    const config = paymentConfiguration()
    if (!validWebhook(req, config.webhookSecret)) return res.status(401).json({ error: 'Notificação inválida.' })
    if (!['order', 'orders_v2'].includes(req.body?.type) || req.body?.data?.id !== req.query['data.id']) return res.status(400).json({ error: 'Notificação inválida.' })
    const sellerId = await verifiedSeller(config), id = providerOrderId(req.query['data.id'])
    const authoritative = await mercadoPagoApi.request(`/v1/orders/${id}`, config)
    if (object(authoritative).id !== id) throw new PaymentError('Order consultada inválida.')
    await reconcilePayment(authoritative, config, sellerId)
    return res.json({ received: true })
  } catch (error) { return failure(res, error) }
})

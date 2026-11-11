import { Router } from 'express'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { moneyCents } from '../../shared/coupons'

const zone = 'America/Sao_Paulo'
export const salesDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(date)
function day(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Informe datas no formato AAAA-MM-DD.')
  const parsed = new Date(value + 'T12:00:00Z')
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw Error('Data inválida.')
  return value
}
// As vendas da loja começaram em 2026; São Paulo utiliza UTC-3 nesse período.
export function reportPeriod(input: Record<string, unknown>) {
  const from = day(input.from), to = day(input.to)
  if (from < '2020-01-01' || to < from || (+new Date(to) - +new Date(from)) / 86400000 > 365) throw Error('Escolha um intervalo de até 366 dias, a partir de 2020.')
  const environment = input.environment ?? 'production'
  if (!['production', 'sandbox'].includes(String(environment))) throw Error('Ambiente inválido.')
  return { from, to, environment: environment as 'production' | 'sandbox', start: new Date(from + 'T00:00:00-03:00'), end: new Date(+new Date(to + 'T00:00:00-03:00') + 86400000) }
}
export type SalesRow = { id: number; createdAt: Date; paymentApprovedAt: Date | null; status: string; paymentStatus: string; paymentReviewRequired: boolean; subtotal: unknown; discount: unknown; shipping: unknown; total: unknown; paymentMethod: string; customer: { name: string }; items: { productName: string; isService: boolean; quantity: number; total: unknown }[]; refundRequest: { status: string; confirmedAt: Date | null; amount: unknown } | null; paymentCheckouts: { environment: string; payments: { providerStatus: string; providerUpdatedAt: Date; refundedAmount: unknown }[] }[] }
const cents = (value: unknown) => moneyCents(String(value))
export function summarizeSales(orders: SalesRow[], period: ReturnType<typeof reportPeriod>) {
  const inPeriod = (date: Date | null) => date !== null && date >= period.start && date < period.end
  const totals = { received: 0, refunded: 0, balance: 0, orders: 0, pending: 0, pendingAmount: 0, review: 0, discounts: 0, shipping: 0, products: 0, services: 0, pix: 0, card: 0, average: 0, legacyDates: 0 }
  const days = new Map<string, { date: string; received: number; refunded: number; orders: number }>()
  for (let stamp = +period.start; stamp < +period.end; stamp += 86400000) { const date = salesDate(new Date(stamp)); days.set(date, { date, received: 0, refunded: 0, orders: 0 }) }
  const rows = []
  for (const order of orders) {
    if (!order.paymentCheckouts.some(checkout => checkout.environment === period.environment)) continue
    const paidAt = order.paymentApprovedAt ?? (['APPROVED', 'REFUNDED'].includes(order.paymentStatus) ? order.createdAt : null)
    const refundDates = order.paymentCheckouts.filter(c => c.environment === period.environment).flatMap(c => c.payments.filter(p => p.providerStatus === 'refunded').map(p => p.providerUpdatedAt))
    const refundedAt = order.refundRequest?.status === 'CONFIRMED' ? order.refundRequest.confirmedAt : refundDates.sort((a, b) => +b - +a)[0] ?? null
    const refundedTotal = order.refundRequest?.status === 'CONFIRMED' ? cents(order.refundRequest.amount) : order.paymentCheckouts.filter(c => c.environment === period.environment).flatMap(c => c.payments).reduce((sum, p) => sum + cents(p.refundedAmount), 0)
    const received = !order.paymentReviewRequired && inPeriod(paidAt) && ['APPROVED', 'REFUNDED'].includes(order.paymentStatus) ? cents(order.total) : 0
    const refunded = !order.paymentReviewRequired && inPeriod(refundedAt) ? Math.min(cents(order.total), refundedTotal) : 0
    if (order.paymentReviewRequired && (inPeriod(paidAt) || inPeriod(order.createdAt) || inPeriod(refundedAt))) totals.review++
    if (inPeriod(order.createdAt) && order.paymentStatus === 'PENDING' && order.status !== 'CANCELED') { totals.pending++; totals.pendingAmount += cents(order.total) }
    if (received) {
      totals.received += received; totals.orders++; totals.discounts += cents(order.discount); totals.shipping += cents(order.shipping)
      totals[order.paymentMethod === 'PIX' ? 'pix' : 'card'] += received
      if (!order.paymentApprovedAt) totals.legacyDates++
      for (const item of order.items) totals[item.isService ? 'services' : 'products'] += cents(item.total)
      const bucket = days.get(salesDate(paidAt!))!; bucket.received += received; bucket.orders++
    }
    if (refunded) { totals.refunded += refunded; days.get(salesDate(refundedAt!))!.refunded += refunded }
    if (received || refunded || inPeriod(order.createdAt) || order.paymentReviewRequired) rows.push({ id: order.id, createdAt: order.createdAt, paidAt, refundedAt, customer: order.customer.name, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, status: order.status, review: order.paymentReviewRequired, received, refunded, total: cents(order.total), discount: cents(order.discount), shipping: cents(order.shipping), items: order.items.map(item => `${item.quantity} × ${item.productName}`).join(' | ') })
  }
  totals.balance = totals.received - totals.refunded; totals.average = totals.orders ? Math.round(totals.received / totals.orders) : 0
  return { period: { from: period.from, to: period.to, environment: period.environment, timezone: zone }, totals, days: [...days.values()], rows, dateBasis: 'Recebimentos por data de aprovação; estornos por data de confirmação. Pedidos antigos sem data de aprovação usam a data de criação, identificados no relatório. Valores em centavos, antes de taxas e custos.' }
}
export function reportCsv(report: ReturnType<typeof summarizeSales>) {
  const cell = (raw: unknown) => { let value = String(raw ?? ''); if (/^[=+\-@\t\r\n]/.test(value)) value = "'" + value; return '"' + value.replaceAll('"', '""') + '"' }
  const amount = (value: number) => (value / 100).toFixed(2).replace('.', ',')
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(value) : ''
  const records: unknown[][] = [['Pedido','Ambiente','Criação (São Paulo)','Aprovação (São Paulo)','Estorno (São Paulo)','Cliente','Itens','Pagamento','Status pagamento','Status pedido','Em conferência','Total pedido (R$)','Desconto (R$)','Frete (R$)','Recebido no período (R$)','Estornado no período (R$)'], ...report.rows.map(row => [row.id,report.period.environment,date(row.createdAt),date(row.paidAt),date(row.refundedAt),row.customer,row.items,row.paymentMethod,row.paymentStatus,row.status,row.review?'Sim':'Não',amount(row.total),amount(row.discount),amount(row.shipping),amount(row.received),amount(row.refunded)])]
  return '\uFEFF' + records.map(row => row.map(cell).join(';')).join('\r\n')
}
export const salesReportsRouter = Router()
salesReportsRouter.get('/admin/sales-report', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  let period
  try { period = reportPeriod(req.query); if (req.query.format !== undefined && req.query.format !== 'csv') throw Error('Formato inválido.') }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Período inválido.' }) }
  try {
    const range = { gte: period.start, lt: period.end }
    const orders = await prisma.order.findMany({ where: { paymentCheckouts: { some: { environment: period.environment } }, OR: [{ paymentApprovedAt: range }, { createdAt: range }, { refundRequest: { confirmedAt: range } }, { paymentCheckouts: { some: { environment: period.environment, payments: { some: { refundedAmount: { gt: 0 }, providerUpdatedAt: range } } } } }] }, include: { customer: { select: { name: true } }, items: { select: { productName: true, isService: true, quantity: true, total: true } }, refundRequest: { select: { status: true, confirmedAt: true, amount: true } }, paymentCheckouts: { where: { environment: period.environment }, select: { environment: true, payments: { select: { providerStatus: true, providerUpdatedAt: true, refundedAmount: true } } } } }, orderBy: { createdAt: 'desc' }, take: 10001 })
    if (orders.length > 10000) return res.status(413).json({ error: 'Mais de 10 mil pedidos. Escolha um período menor.' })
    const report = summarizeSales(orders, period)
    if (req.query.format === 'csv') return res.type('text/csv; charset=utf-8').attachment(`vendas-${period.environment}-${period.from}-${period.to}.csv`).send(reportCsv(report))
    return res.json(report)
  } catch { return res.status(503).json({ error: 'Não foi possível carregar o relatório. Tente novamente.' }) }
})

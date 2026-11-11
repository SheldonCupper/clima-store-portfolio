import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

export class PaymentError extends Error {
  constructor(message: string, public statusCode = 409) { super(message) }
}
export type PaymentConfig = { token: string; webhookSecret: string; environment: 'sandbox' | 'production'; appOrigin: string; apiOrigin: string }
export function paymentConfiguration(): PaymentConfig {
  if (process.env.PAYMENTS_ENABLED !== 'true') throw new PaymentError('O pagamento online ainda não está disponível.', 503)
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  const environment = process.env.MERCADO_PAGO_ENV || 'sandbox'
  if (!token || !webhookSecret || !['sandbox', 'production'].includes(environment)) throw new PaymentError('O pagamento online ainda não está disponível.', 503)
  const origin = (value: string | undefined) => {
    try {
      const url = new URL(value || '')
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error()
      return url.origin
    } catch { throw new PaymentError('O pagamento online ainda não está disponível.', 503) }
  }
  return { token, webhookSecret, environment: environment as PaymentConfig['environment'], appOrigin: origin(process.env.APP_PUBLIC_URL), apiOrigin: origin(process.env.API_PUBLIC_URL) }
}
export function paymentAvailability() {
  try { const config = paymentConfiguration(); return { enabled: true, environment: config.environment } }
  catch { return { enabled: false, environment: 'sandbox' } }
}
export function cents(value: unknown) {
  const text = String(value)
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new PaymentError('Valor de pagamento inválido.')
  const [whole, decimal = ''] = text.split('.')
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
}
export function providerId(value: unknown) {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) throw new PaymentError('Identificador do pagamento inválido.')
  const id = String(value)
  if (!/^[1-9]\d{0,24}$/.test(id)) throw new PaymentError('Identificador do pagamento inválido.')
  return id
}
export function providerOrderId(value: unknown) {
  if (typeof value !== 'string' || !/^ORD(?:TST)?[A-Z0-9]{20,40}$/.test(value)) throw new PaymentError('Identificador da order inválido.')
  return value
}
export function checkoutUrl(value: unknown) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'https:' || url.hostname !== 'www.mercadopago.com.br' || url.username || url.password || !url.pathname.startsWith('/checkout/')) throw new Error()
    return url.href
  } catch { throw new PaymentError('Endereço de pagamento inválido.', 502) }
}

export function checkoutCanBeCanceled(checkout: { expiresAt: Date; lastSyncedAt: Date | null; payments: { providerStatus: string }[] }, now = Date.now()) {
  if (!checkout.lastSyncedAt || checkout.payments.length === 0) return false
  // O estado refunded só é salvo após conferir o reembolso integral na API.
  // A cobrança já foi encerrada: não depende da validade original do link.
  if (checkout.payments.every(payment => payment.providerStatus === 'refunded')) return true
  return checkout.expiresAt.getTime() + 60000 < now && checkout.lastSyncedAt.getTime() > checkout.expiresAt.getTime() + 60000 && checkout.payments.every(payment => ['cancelled', 'refunded'].includes(payment.providerStatus))
}
export const mercadoPagoApi = {
  async request(path: string, config: PaymentConfig, body?: unknown, idempotencyKey?: string): Promise<unknown> {
    try {
      const response = await fetch(`https://api.mercadopago.com${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
      if (!response.ok) throw new Error()
      return await response.json()
    } catch { throw new PaymentError('Não foi possível consultar o Mercado Pago. Tente novamente.', 502) }
  },
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PaymentError('Resposta de pagamento inválida.', 502)
  return value as Record<string, unknown>
}
export async function verifiedSeller(config: PaymentConfig) {
  const seller = object(await mercadoPagoApi.request('/users/me', config))
  const isTest = Array.isArray(seller.tags) && seller.tags.includes('test_user')
  if (!Array.isArray(seller.tags) || seller.site_id !== 'MLB' || isTest !== (config.environment === 'sandbox')) {
    throw new PaymentError('As credenciais do Mercado Pago não correspondem ao ambiente configurado.', 503)
  }
  return providerId(seller.id)
}
export async function paymentMethods(config: PaymentConfig, selected: 'PIX' | 'CREDIT_CARD') {
  const response = await mercadoPagoApi.request('/v1/payment_methods', config)
  if (!Array.isArray(response)) throw new PaymentError('Meios de pagamento indisponíveis.', 502)
  const methods = response.map(object)
  const allowed = (method: Record<string, unknown>) => selected === 'PIX' ? method.id === 'pix' : method.payment_type_id === 'credit_card'
  if (!methods.some(method => allowed(method) && method.status === 'active')) throw new PaymentError('A forma de pagamento selecionada não está disponível.', 502)
  const allowedType = selected === 'PIX' ? 'bank_transfer' : 'credit_card'
  const excludedTypes = [...new Set([...methods.map(method => String(method.payment_type_id)), 'account_money'])].filter(type => type !== allowedType)
  // Uma bandeira pode aparecer em crédito e pré-pago com o mesmo ID (ex.: master).
  // A exclusão por tipo bloqueia o pré-pago sem bloquear a bandeira no crédito.
  const allowedIds = new Set(methods.filter(allowed).map(method => String(method.id)))
  const excludedIds = [...new Set(methods.map(method => String(method.id)))].filter(id => !allowedIds.has(id))
  return { not_allowed_types: excludedTypes.map(type => type === 'digital_wallet' ? 'wallet' : type), not_allowed_ids: excludedIds, max_installments: 1 }
}
export function validWebhook(req: Request, secret: string, now = Date.now()) {
  const id = req.query['data.id']
  const signature = req.get('x-signature') || ''
  const requestId = req.get('x-request-id') || ''
  if (typeof id !== 'string' || !/^ORD(?:TST)?[A-Za-z0-9]{20,40}$/.test(id) || !/^[\w-]{1,200}$/.test(requestId)) return false
  const parts = signature.split(',').map(part => part.trim().split('='))
  if (parts.length !== 2 || parts.filter(([key]) => key === 'ts').length !== 1 || parts.filter(([key]) => key === 'v1').length !== 1) return false
  const values = Object.fromEntries(parts)
  const ts = values.ts || '', digest = values.v1 || ''
  if (!/^(\d{10}|\d{13})$/.test(ts) || !/^[a-f0-9]{64}$/i.test(digest)) return false
  const timestamp = Number(ts) * (ts.length === 10 ? 1000 : 1)
  if (Math.abs(now - timestamp) > 5 * 60000) return false
  const expected = createHmac('sha256', secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest()
  return timingSafeEqual(expected, Buffer.from(digest, 'hex'))
}

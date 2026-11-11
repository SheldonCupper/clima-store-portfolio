import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'
import { createHmac } from 'node:crypto'
import type { Request } from 'express'
import type { Order, PaymentCheckout } from '../../generated/prisma/client'
import prisma from './prisma'
import { cents, checkoutCanBeCanceled, checkoutUrl, mercadoPagoApi, paymentAvailability, paymentConfiguration, paymentMethods, validWebhook, verifiedSeller } from './mercadoPago'
import { testProviderOrder, testOrderId, testPaymentId } from './paymentFixtures'
import { paymentProjection, validatedPayment } from './payments'

let env: NodeJS.ProcessEnv
const originalRequest = mercadoPagoApi.request
beforeEach(() => {
  env = { ...process.env }
  Object.assign(process.env, { PAYMENTS_ENABLED: 'true', MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-ficticio', MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio', APP_PUBLIC_URL: 'https://loja.example', API_PUBLIC_URL: 'https://api.example' })
  mercadoPagoApi.request = async () => { throw new Error('Rede inesperada') }
})
afterEach(() => { process.env = env; mercadoPagoApi.request = originalRequest })
after(() => prisma.$disconnect())
const checkout = { id: 'checkout-ficticio', amount: '115.16', preferenceId: testOrderId, currency: 'BRL', sellerId: '123', environment: 'sandbox' } as unknown as PaymentCheckout
const order = { id: 42, total: '115.16', paymentMethod: 'PIX' } as unknown as Order
const payment = () => testProviderOrder(checkout.id)

test('pagamentos ficam desativados sem flag ou sem segredos; configuração pública não os revela', () => {
  delete process.env.PAYMENTS_ENABLED
  assert.equal(paymentAvailability().enabled, false)
  assert.throws(paymentConfiguration)
  process.env.PAYMENTS_ENABLED = 'true'
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET
  assert.equal(paymentAvailability().enabled, false)
  assert.ok(!JSON.stringify(paymentAvailability()).includes('APP_USR'))
})
test('configuração rejeita callback HTTP, credenciais na URL e caminhos arbitrários', () => {
  for (const url of ['http://api.example', 'https://user:pass@api.example', 'https://api.example/path', 'https://api.example/?x=1']) {
    process.env.API_PUBLIC_URL = url
    assert.throws(paymentConfiguration)
  }
})
test('valores em centavos preservam decimais e recusam precisão extra, negativos e não números', () => {
  assert.equal(cents('115.16'), 11516)
  assert.equal(cents('0.3'), 30)
  for (const value of ['1.001', -10, NaN, Infinity, null, '1e3']) assert.throws(() => cents(value))
})
test('checkout aceita somente URL HTTPS do checkout oficial brasileiro', () => {
  assert.match(checkoutUrl('https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=teste'), /^https:/)
  for (const url of ['https://mercadopago.com.br.evil.test/checkout/', 'http://www.mercadopago.com.br/checkout/', 'https://user:senha@www.mercadopago.com.br/checkout/', 'https://www.mercadopago.com.br/other']) assert.throws(() => checkoutUrl(url))
})
test('sandbox recusa token de vendedor real mesmo com prefixo APP_USR', async () => {
  mercadoPagoApi.request = async () => ({ id: 123, site_id: 'MLB', tags: ['normal'] })
  await assert.rejects(verifiedSeller(paymentConfiguration()), /credenciais/)
  mercadoPagoApi.request = async () => ({ id: 123, site_id: 'MLB', tags: ['test_user'] })
  assert.equal(await verifiedSeller(paymentConfiguration()), '123')
  process.env.MERCADO_PAGO_ENV = 'production'
  await assert.rejects(verifiedSeller(paymentConfiguration()), /credenciais/)
})
test('forma escolhida exclui cartão no Pix e exclui Pix e saldo na opção cartão', async () => {
  mercadoPagoApi.request = async () => [{ id: 'pix', status: 'active', payment_type_id: 'bank_transfer' }, { id: 'visa', status: 'active', payment_type_id: 'credit_card' }, { id: 'bolbradesco', status: 'active', payment_type_id: 'ticket' }]
  const pix = await paymentMethods(paymentConfiguration(), 'PIX')
  assert.ok(pix.not_allowed_ids.includes('visa'))
  const card = await paymentMethods(paymentConfiguration(), 'CREDIT_CARD')
  assert.ok(card.not_allowed_ids.includes('pix'))
  assert.ok(card.not_allowed_types.includes('account_money'))
})
test('webhook valida HMAC em tempo constante e rejeita assinatura adulterada, repetida ou vencida', () => {
  const ts = String(Math.floor(Date.now() / 1000)), id = testOrderId, requestId = 'request-ficticio'
  const hash = createHmac('sha256', 'segredo').update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex')
  const request = (signature: string, dataId: unknown = id) => ({ query: { 'data.id': dataId }, get: (key: string) => key === 'x-signature' ? signature : requestId }) as unknown as Request
  const signature = `ts=${ts},v1=${hash}`
  assert.equal(validWebhook(request(signature), 'segredo'), true)
  assert.equal(validWebhook(request(signature), 'outro'), false)
  assert.equal(validWebhook(request(signature + ',v1=' + hash), 'segredo'), false)
  assert.equal(validWebhook(request(signature, ['456', '789']), 'segredo'), false)
  assert.equal(validWebhook(request(signature), 'segredo', Date.now() + 6 * 60000), false)
})
test('aprovação exige referência, vendedor, ambiente, moeda, valor e método correspondentes ao pedido', () => {
  assert.equal(validatedPayment(payment(), checkout, order).status, 'approved')
  for (const difference of [{ external_reference: 'outro' }, { user_id: '999' }, { id: testOrderId.replace('ORDTST', 'ORD') }, { currency: 'USD' }, { total_amount: '1.00' }, { country_code: 'ARG' }, { last_updated_date: 'inválida' }, { total_paid_amount: '1.00' }, { status: 'inventado' }]) {
    assert.throws(() => validatedPayment({ ...payment(), ...difference }, checkout, order))
  }
})
test('reembolso parcial não equivale a reembolso integral', () => {
  assert.throws(() => validatedPayment({ ...payment(), status: 'refunded', transactions: { ...payment().transactions, refunds: [{ id: 'REF-ficticio', transaction_id: testPaymentId, amount: '10.00', status: 'processed' }] } }, checkout, order))
  const result = paymentProjection([{ providerStatus: 'approved', amount: 115.16, refundedAmount: 10 }])
  assert.equal(result.status, 'APPROVED'); assert.equal(result.review, true)
})
test('aprovações duplicadas e contestações exigem conferência; recusa não substitui outra aprovação', () => {
  const approved = { providerStatus: 'approved', amount: 115.16, refundedAmount: 0 }
  assert.deepEqual(paymentProjection([approved, { ...approved, providerStatus: 'rejected' }]), { status: 'APPROVED', review: false })
  assert.equal(paymentProjection([approved, approved]).review, true)
  assert.equal(paymentProjection([{ ...approved, providerStatus: 'charged_back' }]).review, true)
})
test('cancelamento de cobrança exige expiração e consulta concluída; Pix ainda pendente bloqueia estoque', () => {
  const now = Date.now(), expired = new Date(now - 180000), checked = new Date(now - 1000)
  assert.equal(checkoutCanBeCanceled({ expiresAt: expired, lastSyncedAt: checked, payments: [{ providerStatus: 'cancelled' }] }, now), true)
  assert.equal(checkoutCanBeCanceled({ expiresAt: new Date(now + 1000), lastSyncedAt: checked, payments: [] }, now), false)
  assert.equal(checkoutCanBeCanceled({ expiresAt: expired, lastSyncedAt: null, payments: [] }, now), false)
  assert.equal(checkoutCanBeCanceled({ expiresAt: expired, lastSyncedAt: checked, payments: [{ providerStatus: 'pending' }] }, now), false)
})

test('Orders: status processed sem transação aprovada ou com método divergente não confirma', () => {
  assert.throws(() => validatedPayment({ ...payment(), transactions: { payments: [] } }, checkout, order))
  const value = payment()
  value.transactions.payments[0].payment_method = { id: 'visa', type: 'credit_card' }
  assert.throws(() => validatedPayment(value, checkout, order))
})
test('Orders: canceled com transação aberta ou aprovada exige revisão e não libera estoque', () => {
  const value = { ...payment(), status: 'canceled', total_paid_amount: '0.00' }
  assert.equal(validatedPayment(value, checkout, order).review, true)
  value.transactions.payments[0].status = 'processing'
  assert.equal(validatedPayment(value, checkout, order).review, true)
})
test('Orders: reembolso precisa pertencer à transação e não pode ser contado duas vezes', () => {
  const refund = { id: 'REF-ficticio', transaction_id: testPaymentId, amount: '115.16', status: 'processed' }
  const value = { ...payment(), status: 'refunded', transactions: { ...payment().transactions, refunds: [refund] } }
  assert.equal(validatedPayment(value, checkout, order).status, 'refunded')
  assert.throws(() => validatedPayment({ ...value, transactions: { ...value.transactions, refunds: [refund, refund] } }, checkout, order))
  assert.throws(() => validatedPayment({ ...value, transactions: { ...value.transactions, refunds: [{ ...refund, transaction_id: 'outra' }] } }, checkout, order))
})
test('Orders: request envia chave idempotente no header e sanitiza erros do provedor', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://api.mercadopago.com/v1/orders')
      assert.equal(new Headers(init?.headers).get('X-Idempotency-Key'), 'chave-persistente')
      return new Response(JSON.stringify({ id: testOrderId }), { status: 201 })
    }
    assert.deepEqual(await originalRequest('/v1/orders', paymentConfiguration(), {}, 'chave-persistente'), { id: testOrderId })
    globalThis.fetch = async () => new Response('segredo-do-provedor', { status: 400 })
    await assert.rejects(originalRequest('/v1/orders', paymentConfiguration(), {}, 'chave-persistente'), error => error instanceof Error && !error.message.includes('segredo-do-provedor'))
  } finally { globalThis.fetch = originalFetch }
})

test('Orders real: criação sem total_paid_amount e transactions permanece pendente; aprovação não assume valor ausente', () => {
  const created = { ...payment(), status: 'created', total_paid_amount: undefined, transactions: undefined }
  assert.equal(validatedPayment(created, checkout, order).status, 'pending')
  assert.throws(() => validatedPayment({ ...payment(), total_paid_amount: undefined }, checkout, order))
  assert.throws(() => validatedPayment({ ...created, status: 'processed' }, checkout, order))
})

test('Orders: bandeiras repetidas em crédito e pré-pago não bloqueiam cartão de crédito', async () => {
  mercadoPagoApi.request = async () => [
    { id: 'master', status: 'active', payment_type_id: 'credit_card' },
    { id: 'master', status: 'active', payment_type_id: 'prepaid_card' },
    { id: 'visa', status: 'active', payment_type_id: 'credit_card' },
    { id: 'visa', status: 'active', payment_type_id: 'prepaid_card' },
    { id: 'elo', status: 'active', payment_type_id: 'credit_card' },
    { id: 'elo', status: 'active', payment_type_id: 'prepaid_card' },
    { id: 'debelo', status: 'active', payment_type_id: 'debit_card' },
    { id: 'pix', status: 'active', payment_type_id: 'bank_transfer' },
  ]
  const card = await paymentMethods(paymentConfiguration(), 'CREDIT_CARD')
  for (const id of ['master', 'visa', 'elo']) assert.ok(!card.not_allowed_ids.includes(id))
  assert.ok(card.not_allowed_types.includes('prepaid_card'))
  assert.ok(card.not_allowed_types.includes('debit_card'))
  assert.ok(card.not_allowed_ids.includes('debelo'))
  assert.equal(new Set(card.not_allowed_ids).size, card.not_allowed_ids.length)
})

test('Orders real: expiração sem transações pode omitir valor pago, mas não libera aprovação ou reembolso', () => {
  const empty = { ...payment(), status: 'canceled', status_detail: 'expired', total_paid_amount: undefined, transactions: undefined }
  assert.equal(validatedPayment(empty, checkout, order).status, 'cancelled')
  assert.equal(validatedPayment({ ...empty, status: 'failed' }, checkout, order).status, 'rejected')
  assert.throws(() => validatedPayment({ ...empty, status: 'refunded' }, checkout, order))
  assert.throws(() => validatedPayment({ ...empty, transactions: payment().transactions }, checkout, order))
})

test('reembolso integral consultado permite cancelamento antes da expiração; parcial, pendente e falta de consulta bloqueiam', () => {
  const now = Date.now(), expiresAt = new Date(now + 1800000), lastSyncedAt = new Date(now)
  assert.equal(checkoutCanBeCanceled({ expiresAt, lastSyncedAt, payments: [{ providerStatus: 'refunded' }] }, now), true)
  assert.equal(checkoutCanBeCanceled({ expiresAt, lastSyncedAt: null, payments: [{ providerStatus: 'refunded' }] }, now), false)
  assert.equal(checkoutCanBeCanceled({ expiresAt, lastSyncedAt, payments: [{ providerStatus: 'approved' }] }, now), false)
  assert.equal(checkoutCanBeCanceled({ expiresAt, lastSyncedAt, payments: [{ providerStatus: 'refunded' }, { providerStatus: 'pending' }] }, now), false)
  assert.equal(checkoutCanBeCanceled({ expiresAt, lastSyncedAt, payments: [{ providerStatus: 'cancelled' }] }, now), false)
})

test('Orders real: waiting_retry com todas as transações recusadas e sem valor pago representa recusa', () => {
  const value = payment()
  const failed = { ...value.transactions.payments[0], status: 'failed', status_detail: 'rejected_by_issuer', paid_amount: undefined }
  const retry = { ...value, status: 'action_required', status_detail: 'waiting_retry', total_paid_amount: undefined, transactions: { payments: [failed] } }
  assert.equal(validatedPayment(retry, checkout, order).status, 'rejected')
  assert.equal(validatedPayment(retry, checkout, order).review, false)
  assert.throws(() => validatedPayment({ ...retry, transactions: { payments: [] } }, checkout, order))
  const pending = { ...failed, status: 'processing' }
  assert.throws(() => validatedPayment({ ...retry, transactions: { payments: [pending] } }, checkout, order))
  assert.equal(validatedPayment({ ...retry, total_paid_amount: '0.00', transactions: { payments: [pending] } }, checkout, order).status, 'pending')
  assert.equal(validatedPayment({ ...retry, status_detail: 'waiting_capture', total_paid_amount: '0.00' }, checkout, order).status, 'pending')
  assert.equal(validatedPayment({ ...retry, total_paid_amount: '115.16' }, checkout, order).review, true)
})

import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { after, before, test } from 'node:test'
import { createHmac, randomUUID } from 'node:crypto'
import { app } from './index'
import { createOrderAccessToken, orderAccessCookieName } from './orderAccess'
import prisma from './prisma'
import { mercadoPagoApi, paymentConfiguration } from './mercadoPago'
import { createPaymentCheckout, reconcilePayment, refreshOrderPayment } from './payments'
import { changeOrderStatus } from './orderStatus'
import { cancelOrderWithRefund } from './orderRefunds'
import { testProviderOrder, testPaymentId } from './paymentFixtures'

const enabled = process.env.RUN_PAYMENT_DB_TESTS === 'true'
const options = { skip: !enabled }
const original = mercadoPagoApi.request
let categoryId = 0
const creations = new Map<string, ReturnType<typeof testProviderOrder> & { checkout_url: string }>()
before(async () => {
  if (!enabled) return
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/)
  Object.assign(process.env, { PAYMENTS_ENABLED: 'true', MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-ficticio-db', MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio-db', JWT_SECRET: 'segredo-jwt-ficticio-db', APP_PUBLIC_URL: 'https://loja.example', API_PUBLIC_URL: 'https://api.example' })
  categoryId = (await prisma.category.create({ data: { name: 'Categoria fictícia', slug: randomUUID() } })).id
  mercadoPagoApi.request = async (path, _config, body, key) => {
    if (path === '/users/me') return { id: 123, site_id: 'MLB', tags: ['test_user'] }
    if (path === '/v1/payment_methods') return [{ id: 'pix', status: 'active', payment_type_id: 'bank_transfer' }, { id: 'visa', status: 'active', payment_type_id: 'credit_card' }]
    if (path === '/v1/orders') {
      assert.equal(typeof key, 'string'); assert.ok(key)
      const value = body as { total_amount: string; external_reference: string; processing_mode: string; config: unknown }
      assert.equal(value.total_amount, '115.16'); assert.equal(value.processing_mode, 'manual')
      if (!creations.has(key!)) {
        const id = 'ORDTST' + randomUUID().replaceAll('-', '').toUpperCase()
        creations.set(key!, { ...testProviderOrder(value.external_reference, id, { status: 'created', status_detail: 'created', total_paid_amount: '0.00', transactions: { payments: [] } }), checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${id}` })
      }
      return creations.get(key!)
    }
    throw new Error('Rede não simulada: ' + path)
  }
})
after(async () => { mercadoPagoApi.request = original; await prisma.$disconnect() })
async function fixture(paymentMethod: 'PIX' | 'CREDIT_CARD' = 'PIX') {
  const unique = randomUUID()
  const product = await prisma.product.create({ data: { name: 'Produto fictício', slug: unique, sku: unique, price: 47.55, stock: 8, categoryId } })
  const customer = await prisma.customer.create({ data: { name: 'Pessoa fictícia', email: `${unique}@gmail.com`, phone: '34999999999', cpf: unique } })
  const address = await prisma.address.create({ data: { customerId: customer.id, cep: '38401700', street: 'Rua de teste', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' } })
  const order = await prisma.order.create({ data: { customerId: customer.id, addressId: address.id, paymentMethod, subtotal: 95.10, shipping: 20.06, total: 115.16, items: { create: { productId: product.id, productName: product.name, sku: unique, unitPrice: 47.55, quantity: 2, total: 95.10 } } } })
  return { order, product }
}
async function checkoutFor(id: number) {
  await createPaymentCheckout(id)
  return prisma.paymentCheckout.findUniqueOrThrow({ where: { orderId_environment: { orderId: id, environment: 'sandbox' } } })
}
const record = (checkout: { id: string; preferenceId: string | null }, changes: Record<string, unknown> = {}) => testProviderOrder(checkout.id, checkout.preferenceId!, changes)
const sync = (value: unknown) => reconcilePayment(value, paymentConfiguration(), '123')
const saved = (id: number) => prisma.order.findUniqueOrThrow({ where: { id } })
async function expired(id: string) { await prisma.paymentCheckout.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 180000), lastSyncedAt: new Date() } }) }

test('Orders/SQL: cliques concorrentes reutilizam chave persistente e uma cobrança', options, async () => {
  const { order } = await fixture(), start = creations.size
  const calls = await Promise.all([createPaymentCheckout(order.id), createPaymentCheckout(order.id)])
  assert.equal(creations.size - start, 1); assert.deepEqual(calls[0], calls[1])
})
test('Orders/SQL: timeout após criação permite retry com a mesma chave após nova solicitação', options, async () => {
  const { order } = await fixture(), handler = mercadoPagoApi.request
  let first = true
  mercadoPagoApi.request = async (path, config, body, key) => {
    const result = await handler(path, config, body, key)
    if (path === '/v1/orders' && first) { first = false; throw new Error('Timeout simulado após criar') }
    return result
  }
  try {
    const start = creations.size
    await assert.rejects(createPaymentCheckout(order.id))
    const checkout = await prisma.paymentCheckout.findUniqueOrThrow({ where: { orderId_environment: { orderId: order.id, environment: 'sandbox' } } })
    assert.equal(checkout.checkoutUrl, null)
    await createPaymentCheckout(order.id)
    assert.equal(creations.size - start, 1)
  } finally { mercadoPagoApi.request = handler }
})
test('Orders/SQL: aprovação repetida não duplica registros nem altera estoque reservado', options, async () => {
  const { order, product } = await fixture(), checkout = await checkoutFor(order.id), value = record(checkout)
  await Promise.all([sync(value), sync(value)])
  assert.equal((await saved(order.id)).paymentStatus, 'APPROVED'); assert.equal((await saved(order.id)).status, 'CONFIRMED')
  assert.equal(await prisma.providerPayment.count({ where: { checkoutId: checkout.id } }), 1)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 8)
  await assert.rejects(changeOrderStatus(order.id, 'CANCELED'), /reembolso/)
})
test('Orders/SQL: divergência de vendedor, moeda, total, ambiente ou referência não aprova', options, async () => {
  const { order } = await fixture(), checkout = await checkoutFor(order.id)
  for (const changes of [{ total_amount: '1.00' }, { live_mode: true }, { user_id: '999' }, { currency: 'USD' }, { external_reference: 'outro' }]) await assert.rejects(sync(record(checkout, changes)))
  assert.equal((await saved(order.id)).paymentStatus, 'PENDING')
})
test('Orders/SQL: duas transações aprovadas exigem conferência e bloqueiam preparação', options, async () => {
  const { order } = await fixture(), checkout = await checkoutFor(order.id), value = record(checkout)
  value.transactions.payments.push({ ...value.transactions.payments[0], id: testPaymentId.replace('PAY', 'PAYA') })
  await sync(value)
  assert.equal((await saved(order.id)).paymentReviewRequired, true)
  await assert.rejects(changeOrderStatus(order.id, 'PROCESSING'), /conferência/)
})
test('Orders/SQL: estorno parcial bloqueia; reembolso integral repõe uma única vez', options, async () => {
  const first = await fixture(), partial = await checkoutFor(first.order.id), value = record(partial)
  await sync({ ...value, status_detail: 'partially_refunded', transactions: { ...value.transactions, refunds: [{ id: 'REF-parcial', transaction_id: testPaymentId, amount: '10.00', status: 'processed' }] } })
  assert.equal((await saved(first.order.id)).paymentReviewRequired, true)
  const second = await fixture(), full = await checkoutFor(second.order.id), other = record(full)
  await sync(other)
  const refund = { ...other, status: 'refunded', status_detail: 'refunded', transactions: { ...other.transactions, refunds: [{ id: 'REF-total', transaction_id: testPaymentId, amount: '115.16', status: 'processed' }] } }
  await sync(refund)
  await assert.rejects(changeOrderStatus(second.order.id, 'CANCELED'), /cobrança/)
  const handler = mercadoPagoApi.request
  mercadoPagoApi.request = async (path, config, body, key) => path === `/v1/orders/${full.preferenceId}` ? refund : handler(path, config, body, key)
  try { await refreshOrderPayment(second.order.id) }
  finally { mercadoPagoApi.request = handler }
  assert.ok(full.expiresAt.getTime() > Date.now())
  await changeOrderStatus(second.order.id, 'CANCELED'); await changeOrderStatus(second.order.id, 'CANCELED')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: second.product.id } })).stock, 10)
})
test('Orders/SQL: created/failed/pending não repõem estoque; canceled confirmado permite', options, async () => {
  const { order } = await fixture(), checkout = await checkoutFor(order.id)
  await expired(checkout.id)
  await sync(record(checkout, { status: 'failed', total_paid_amount: '0.00', transactions: { payments: [] } }))
  await assert.rejects(changeOrderStatus(order.id, 'CANCELED'), /cobrança/)
  await sync(record(checkout, { status: 'canceled', status_detail: 'expired', total_paid_amount: undefined, transactions: undefined }))
  await changeOrderStatus(order.id, 'CANCELED')
})
test('Orders/SQL: aprovação antiga não rebaixa; aprovação após cancelamento exige revisão', options, async () => {
  const first = await fixture(), checkout = await checkoutFor(first.order.id)
  await sync(record(checkout))
  await sync(record(checkout, { status: 'created', total_paid_amount: '0.00', transactions: { payments: [] }, last_updated_date: '2020-01-01T00:00:00Z' }))
  assert.equal((await saved(first.order.id)).paymentStatus, 'APPROVED')
  const second = await fixture(), late = await checkoutFor(second.order.id)
  await expired(late.id)
  await sync(record(late, { status: 'canceled', total_paid_amount: '0.00', transactions: { payments: [] } }))
  await changeOrderStatus(second.order.id, 'CANCELED')
  await sync(record(late))
  assert.equal((await saved(second.order.id)).status, 'CANCELED'); assert.equal((await saved(second.order.id)).paymentReviewRequired, true)
})
test('Orders/SQL: atualização consulta a order vinculada e não registra conferência após falha', options, async () => {
  const { order } = await fixture(), checkout = await checkoutFor(order.id), handler = mercadoPagoApi.request
  mercadoPagoApi.request = async (path, config, body, key) => path === `/v1/orders/${checkout.preferenceId}` ? record(checkout, { total_amount: '1.00' }) : handler(path, config, body, key)
  try {
    await assert.rejects(refreshOrderPayment(order.id))
    assert.equal((await prisma.paymentCheckout.findUniqueOrThrow({ where: { id: checkout.id } })).lastSyncedAt, null)
    mercadoPagoApi.request = async (path, config, body, key) => path === `/v1/orders/${checkout.preferenceId}` ? record(checkout) : handler(path, config, body, key)
    await refreshOrderPayment(order.id)
    assert.equal((await saved(order.id)).paymentStatus, 'APPROVED')
  } finally { mercadoPagoApi.request = handler }
})
test('Orders/HTTP: autenticação, preço adulterado e webhook assinado com ID alfanumérico', options, async () => {
  const { order } = await fixture(), server = app.listen(0, '127.0.0.1')
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
  const handler = mercadoPagoApi.request
  try {
    const path = `/api/orders/${order.id}/payment/checkout`
    assert.equal((await fetch(base + path, { method: 'POST' })).status, 401)
    const cookie = `${orderAccessCookieName(order.id)}=${createOrderAccessToken(order.id, process.env.JWT_SECRET!)}`
    assert.equal((await fetch(base + path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ total: 1, paymentMethod: 'CREDIT_CARD' }) })).status, 200)
    const checkout = await prisma.paymentCheckout.findUniqueOrThrow({ where: { orderId_environment: { orderId: order.id, environment: 'sandbox' } } })
    mercadoPagoApi.request = async (path, config, body, key) => path === `/v1/orders/${checkout.preferenceId}` ? record(checkout, { status: 'failed', total_paid_amount: '0.00', transactions: { payments: [] } }) : handler(path, config, body, key)
    const webhook = `/api/payments/mercado-pago/webhook?data.id=${checkout.preferenceId}`
    const body = JSON.stringify({ type: 'order', data: { id: checkout.preferenceId }, status: 'processed' })
    assert.equal((await fetch(base + webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401)
    const ts = String(Math.floor(Date.now() / 1000)), requestId = 'teste-http'
    const digest = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET!).update(`id:${checkout.preferenceId!.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex')
    const headers = { 'Content-Type': 'application/json', 'x-signature': `ts=${ts},v1=${digest}`, 'x-request-id': requestId }
    assert.equal((await fetch(base + webhook, { method: 'POST', headers, body })).status, 200)
    assert.equal((await saved(order.id)).paymentStatus, 'REFUSED')
    assert.equal((await fetch(base + webhook, { method: 'POST', headers, body: JSON.stringify({ type: 'payment', data: { id: checkout.preferenceId } }) })).status, 400)
  } finally { mercadoPagoApi.request = handler; await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('Orders/SQL: recusa de cartão preserva reserva, bloqueia preparação e reutiliza o checkout sem duplicar cobrança', options, async () => {
  const { order, product } = await fixture('CREDIT_CARD'), checkout = await checkoutFor(order.id)
  const refusal = record(checkout, {
    status: 'failed', status_detail: 'rejected_by_issuer', total_paid_amount: '0.00',
    transactions: { payments: [{ id: testPaymentId, status: 'failed', status_detail: 'rejected_by_issuer', amount: '115.16', paid_amount: '0.00', payment_method: { id: 'visa', type: 'credit_card' } }] },
  })
  await Promise.all([sync(refusal), sync(refusal)])
  const state = await saved(order.id)
  assert.equal(state.paymentStatus, 'REFUSED'); assert.equal(state.status, 'PENDING')
  assert.equal(state.paymentReviewRequired, false); assert.equal(state.stockRestoredAt, null)
  const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock
  assert.equal(await stock(), 8)
  await assert.rejects(changeOrderStatus(order.id, 'PROCESSING'), /confirmação/)
  await assert.rejects(changeOrderStatus(order.id, 'CANCELED'), /cobrança/)
  assert.equal(await stock(), 8)
  const count = creations.size
  const retry = await createPaymentCheckout(order.id)
  assert.equal(retry.url, checkout.checkoutUrl); assert.equal(creations.size, count)
  assert.equal(await prisma.providerPayment.count({ where: { checkoutId: checkout.id } }), 1)
  assert.equal(await stock(), 8)
})

test('Orders/SQL real: recusa waiting_retry mantém reserva e aceita nova aprovação sem baixar estoque novamente', options, async () => {
  const { order, product } = await fixture('CREDIT_CARD'), checkout = await checkoutFor(order.id)
  const failed = { id: testPaymentId, status: 'failed', status_detail: 'rejected_by_issuer', amount: '115.16', payment_method: { id: 'master', type: 'credit_card' } }
  const refusal = record(checkout, { status: 'action_required', status_detail: 'waiting_retry', total_paid_amount: undefined, transactions: { payments: [failed] } })
  await Promise.all([sync(refusal), sync(refusal)])
  const state = await saved(order.id)
  assert.equal(state.paymentStatus, 'REFUSED'); assert.equal(state.status, 'PENDING'); assert.equal(state.stockRestoredAt, null)
  assert.equal(state.paymentReviewRequired, false)
  const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock
  assert.equal(await stock(), 8)
  await assert.rejects(changeOrderStatus(order.id, 'PROCESSING'), /confirmação/)
  await assert.rejects(changeOrderStatus(order.id, 'CANCELED'), /cobrança/)
  const approved = { ...failed, status: 'processed', status_detail: 'accredited', paid_amount: '115.16', id: testPaymentId.replace('PAY', 'PAYB') }
  await sync(record(checkout, { transactions: { payments: [failed, approved] } }))
  assert.equal((await saved(order.id)).paymentStatus, 'APPROVED')
  assert.equal((await saved(order.id)).status, 'CONFIRMED')
  assert.equal((await saved(order.id)).paymentReviewRequired, false)
  assert.equal(await stock(), 8)
})

// Todas as chamadas financeiras abaixo são simuladas; o banco é exclusivo de validação.
async function refundFixture() {
  const value = await fixture(), checkout = await checkoutFor(value.order.id)
  await sync(record(checkout))
  return { ...value, checkout }
}
function fullRefund(checkout: { id: string; preferenceId: string | null }) {
  const value = record(checkout)
  return { ...value, status: 'refunded', status_detail: 'refunded', transactions: { ...value.transactions, refunds: [{ id: 'REF-' + checkout.id, transaction_id: testPaymentId, amount: '115.16', status: 'processed' }] } }
}
function mockRefund(checkout: { id: string; preferenceId: string | null }, mode: 'success' | 'timeout' | 'pending' | 'unavailable' = 'success') {
  const handler = mercadoPagoApi.request, keys: string[] = []
  let refunded = false
  mercadoPagoApi.request = async (path, config, body, key) => {
    if (path === `/v1/orders/${checkout.preferenceId}/refund`) {
      assert.deepEqual(body, {}); assert.match(key!, /^[a-f0-9-]{36}$/)
      keys.push(key!)
      refunded = mode !== 'pending'
      if (mode === 'timeout') throw new Error('Timeout após processar o estorno')
      return { id: checkout.preferenceId }
    }
    if (path === `/v1/orders/${checkout.preferenceId}`) {
      if (refunded && mode === 'unavailable') throw new Error('Falha de consulta após estorno')
      return refunded ? fullRefund(checkout) : record(checkout)
    }
    return handler(path, config, body, key)
  }
  return { keys, restore: () => { mercadoPagoApi.request = handler } }
}
test('Estorno/SQL: devolve total com frete, registra autorização e repõe estoque e cupom uma única vez', options, async () => {
  const { order, product, checkout } = await refundFixture(), provider = mockRefund(checkout)
  const coupon = await prisma.coupon.create({ data: { code: 'REF' + randomUUID().replaceAll('-', '').toUpperCase(), kind: 'FIXED', value: 1, usedCount: 1 } })
  await prisma.order.update({ where: { id: order.id }, data: { couponId: coupon.id } })
  try {
    assert.equal((await cancelOrderWithRefund(order.id, '115.16', 'admin@example.com')).pending, false)
    const request = await prisma.orderRefund.findUniqueOrThrow({ where: { orderId: order.id } })
    assert.equal(request.status, 'CONFIRMED'); assert.equal(String(request.amount), '115.16'); assert.equal(request.requestedBy, 'admin@example.com'); assert.ok(request.confirmedAt)
    await cancelOrderWithRefund(order.id, '115.16', 'admin@example.com')
    assert.equal(provider.keys.length, 1); assert.equal(provider.keys[0], request.id)
    assert.equal((await saved(order.id)).status, 'CANCELED'); assert.equal((await saved(order.id)).paymentStatus, 'REFUNDED')
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 10)
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount, 0)
  } finally { provider.restore() }
})
test('Estorno/SQL: timeout depois de processar é reconciliado sem duplicar reembolso', options, async () => {
  const { order, checkout } = await refundFixture(), provider = mockRefund(checkout, 'timeout')
  try { assert.equal((await cancelOrderWithRefund(order.id, '115.16', 'admin')).pending, false); assert.equal(provider.keys.length, 1) }
  finally { provider.restore() }
})
test('Estorno/SQL: resultado desconhecido preserva estoque e permite retomar sem nova chamada financeira', options, async () => {
  const { order, product, checkout } = await refundFixture(), provider = mockRefund(checkout, 'unavailable')
  try {
    await assert.rejects(cancelOrderWithRefund(order.id, '115.16', 'admin'), /registrada/)
    assert.equal((await prisma.orderRefund.findUniqueOrThrow({ where: { orderId: order.id } })).status, 'REQUESTED')
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 8)
    await assert.rejects(changeOrderStatus(order.id, 'PROCESSING'), /estorno/)
    await assert.rejects(createPaymentCheckout(order.id), /estorno/)
  } finally { provider.restore() }
  const handler = mercadoPagoApi.request
  mercadoPagoApi.request = async (path, config, body, key) => path === `/v1/orders/${checkout.preferenceId}` ? fullRefund(checkout) : handler(path, config, body, key)
  try { assert.equal((await cancelOrderWithRefund(order.id, '115.16', 'admin')).pending, false) }
  finally { mercadoPagoApi.request = handler }
})
test('Estorno/SQL: pendência persistida reutiliza chave no retry e mantém reserva', options, async () => {
  const { order, product, checkout } = await refundFixture(), provider = mockRefund(checkout, 'pending')
  try {
    assert.equal((await cancelOrderWithRefund(order.id, '115.16', 'admin')).pending, true)
    assert.equal((await cancelOrderWithRefund(order.id, '115.16', 'admin')).pending, true)
    assert.equal(provider.keys.length, 2); assert.equal(provider.keys[0], provider.keys[1])
    assert.equal((await saved(order.id)).stockRestoredAt, null)
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 8)
  } finally { provider.restore() }
})
test('Estorno/SQL: cliques concorrentes usam uma autorização persistente e repõem somente uma vez', options, async () => {
  const { order, product, checkout } = await refundFixture(), provider = mockRefund(checkout)
  try {
    const results = await Promise.allSettled([cancelOrderWithRefund(order.id, '115.16', 'admin'), cancelOrderWithRefund(order.id, '115.16', 'admin')])
    assert.ok(results.some(value => value.status === 'fulfilled'))
    assert.ok(provider.keys.length >= 1); assert.equal(new Set(provider.keys).size, 1)
    assert.equal(await prisma.orderRefund.count({ where: { orderId: order.id } }), 1)
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 10)
  } finally { provider.restore() }
})
test('Estorno/SQL: confirmação adulterada, pedido enviado e revisão impedem chamada de estorno', options, async () => {
  const { order, checkout } = await refundFixture(), provider = mockRefund(checkout)
  try {
    await assert.rejects(cancelOrderWithRefund(order.id, '1', 'admin'), /total mudou/)
    await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } })
    await assert.rejects(cancelOrderWithRefund(order.id, '115.16', 'admin'), /devolução/)
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', paymentReviewRequired: true } })
    await assert.rejects(cancelOrderWithRefund(order.id, '115.16', 'admin'), /conferência/)
    assert.equal(provider.keys.length, 0)
  } finally { provider.restore() }
})
test('Estorno/SQL: divergência de vendedor e estorno parcial impedem cancelamento e reposição', options, async () => {
  const { order, product, checkout } = await refundFixture(), handler = mercadoPagoApi.request
  let partial = false
  mercadoPagoApi.request = async (path, config, body, key) => {
    if (path === `/v1/orders/${checkout.preferenceId}`) return partial ? record(checkout, { status_detail: 'partially_refunded', transactions: { ...record(checkout).transactions, refunds: [{ id: 'REF-parcial', transaction_id: testPaymentId, amount: '10.00', status: 'processed' }] } }) : record(checkout, { user_id: '999' })
    assert.ok(!path.endsWith('/refund'))
    return handler(path, config, body, key)
  }
  try {
    await assert.rejects(cancelOrderWithRefund(order.id, '115.16', 'admin'))
    partial = true; await assert.rejects(cancelOrderWithRefund(order.id, '115.16', 'admin'), /divergência/)
    assert.equal((await saved(order.id)).stockRestoredAt, null)
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 8)
    assert.equal(await prisma.orderRefund.count({ where: { orderId: order.id } }), 0)
  } finally { mercadoPagoApi.request = handler }
})

test('Estorno/HTTP: exige admin e confirmação; prévia não movimenta dinheiro e resposta não expõe chave', options, async () => {
  const { order, checkout } = await refundFixture(), provider = mockRefund(checkout), server = app.listen(0, '127.0.0.1')
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/admin/orders/${order.id}`
  const headers = { 'Content-Type': 'application/json', Cookie: 'admin_token=' + jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!, { algorithm: 'HS256' }) }
  try {
    assert.equal((await fetch(base + '/cancel-preview')).status, 401)
    assert.equal((await fetch(base + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    const customer = { ...headers, Cookie: 'admin_token=' + jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!) }
    assert.equal((await fetch(base + '/cancel', { method: 'POST', headers: customer, body: '{}' })).status, 403)
    const preview = await fetch(base + '/cancel-preview', { headers }); assert.equal(preview.status, 200); assert.equal((await preview.json() as { total: string }).total, '115.16')
    assert.equal(provider.keys.length, 0)
    assert.equal((await fetch(base + '/cancel', { method: 'POST', headers, body: JSON.stringify({ expectedTotal: '115.16' }) })).status, 400)
    const response = await fetch(base + '/cancel', { method: 'POST', headers, body: JSON.stringify({ expectedTotal: '115.16', confirmation: 'CANCELAR' }) })
    assert.equal(response.status, 200)
    const data = await response.json() as { order: { refundRequest: Record<string, unknown> } }
    assert.equal(data.order.refundRequest.status, 'CONFIRMED'); assert.equal(data.order.refundRequest.id, undefined); assert.equal(data.order.refundRequest.sellerId, undefined)
  } finally { provider.restore(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('Financeiro/SQL: data da primeira aprovação é preservada por sincronizações repetidas', options, async () => {
 const { order } = await fixture(), checkout = await checkoutFor(order.id), value = record(checkout)
 await sync(value)
 const approvedAt = (await saved(order.id)).paymentApprovedAt
 assert.equal(approvedAt?.toISOString(), new Date(value.last_updated_date).toISOString())
 await sync({ ...value, last_updated_date: new Date(Date.parse(value.last_updated_date) + 1000).toISOString() })
 assert.equal((await saved(order.id)).paymentApprovedAt?.toISOString(), approvedAt?.toISOString())
})

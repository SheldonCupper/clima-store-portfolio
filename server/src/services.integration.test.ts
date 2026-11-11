import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { app } from './index'
import { parseServiceInput, defaultServiceDetails, serviceAreaMatches } from '../../shared/services'
import { mercadoPagoApi } from './mercadoPago'
import { createPaymentCheckout } from './payments'
import { cancelOrderWithRefund } from './orderRefunds'
import { testProviderOrder, testPaymentId } from './paymentFixtures'
const enabled = process.env.RUN_SERVICE_DB_TESTS === 'true', options = { skip: !enabled }
const original = mercadoPagoApi.request
let server: ReturnType<typeof app.listen>, base: string, admin: Record<string, string>, customer: Record<string, string>
const input = { name: 'Limpeza de split fictícia', description: 'Limpeza de um aparelho até 12000 BTUs para teste.', price: '150.00', active: true, imageUrl: null, serviceDetails: { ...defaultServiceDetails, included: 'Limpeza de uma unidade até 12000 BTUs.', excluded: 'Peças e acesso por andaime não incluídos.' } }
const address = { cep: '38401721', street: 'Rua de teste', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' }
let profile: { name: string; email: string; phone: string; cpf: string }
before(async () => {
 if (!enabled) return
 assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/)
 Object.assign(process.env, { JWT_SECRET: 'segredo-ficticio-servicos', PAYMENTS_ENABLED: 'true', MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-ficticio-servicos', MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio-servicos', APP_PUBLIC_URL: 'https://loja.example', API_PUBLIC_URL: 'https://api.example' })
 profile = { name: 'Cliente fictício', email: randomUUID().replaceAll('-', '') + '@gmail.com', phone: '34999999999', cpf: String(Math.floor(10000000000 + Math.random() * 89999999999)) }
 const account = await prisma.customerAccount.create({ data: { ...profile, cpf: randomUUID(), passwordHash: 'hash-ficticio', emailVerifiedAt: new Date() } })
 admin = { 'Content-Type': 'application/json', Cookie: 'admin_token=' + jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!) }
 customer = { 'Content-Type': 'application/json', Cookie: 'customer_session=' + jwt.sign({ role: 'CUSTOMER', version: 0 }, process.env.JWT_SECRET!, { subject: String(account.id), audience: 'customer-account', issuer: 'ecommerce-api' }) }
 server = app.listen(0, '127.0.0.1'); if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(async () => { mercadoPagoApi.request = original; if (server) await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() })
async function call(path: string, method = 'GET', body?: unknown, headers = admin) { const r = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, data: await r.json() } }
async function service() { const response = await call('/api/admin/services', 'POST', input); assert.equal(response.status, 201); return response.data }
async function buy(id: number, extra: Record<string, unknown> = {}) { return call('/api/orders', 'POST', { customer: profile, address, paymentMethod: 'CREDIT_CARD', acceptServiceTerms: true, items: [{ productId: id, quantity: 1 }], ...extra }, customer) }
test('Serviços: preço fixo, escopo e área são obrigatórios; imagens inseguras são recusadas', () => {
 assert.equal(parseServiceInput(input).price, '150.00')
 for (const changed of [{ price: '0' }, { price: '10.001' }, { imageUrl: 'javascript:alert(1)' }, { serviceDetails: { ...input.serviceDetails, excluded: '' } }, { serviceDetails: { ...input.serviceDetails, state: 'XX' } }]) assert.throws(() => parseServiceInput({ ...input, ...changed }))
 assert.equal(serviceAreaMatches(input.serviceDetails, { city: 'uberlandia', state: 'mg' }), true)
 assert.equal(serviceAreaMatches(input.serviceDetails, { city: 'São Paulo', state: 'SP' }), false)
})
test('Serviços/SQL: admin obrigatório; catálogo separado; alterações concorrentes e inativos protegidos', options, async () => {
 assert.equal((await call('/api/admin/services', 'POST', input, {})).status, 401)
 assert.equal((await call('/api/admin/services', 'POST', input, customer)).status, 401)
 const saved = await service()
 assert.equal((await call('/api/products')).data.some((p: { id: number }) => p.id === saved.id), false)
 assert.equal((await call('/api/services')).data.some((p: { id: number }) => p.id === saved.id), true)
 assert.equal((await call('/api/products/' + saved.id)).status, 404)
 assert.equal((await call('/api/admin/services/' + saved.id, 'PUT', { ...input, updatedAt: new Date(0).toISOString() })).status, 409)
 assert.equal((await call('/api/admin/services/' + saved.id, 'PUT', { ...input, active: false, updatedAt: saved.updatedAt })).status, 200)
 assert.equal((await buy(saved.id)).status, 400)
})
test('Serviços/SQL: conta, aceite, área e quantidade limitam a compra, antes de qualquer cobrança', options, async () => {
 const saved = await service()
 assert.equal((await call('/api/orders', 'POST', { items: [{ productId: saved.id, quantity: 1 }] }, {})).status, 401)
 assert.equal((await buy(saved.id, { acceptServiceTerms: false })).status, 400)
 assert.equal((await buy(saved.id, { address: { ...address, city: 'São Paulo', state: 'SP' } })).status, 400)
 assert.equal((await buy(saved.id, { items: [{ productId: saved.id, quantity: 21 }] })).status, 400)
})
test('Serviços/SQL: compra ignora preço/frete adulterados, guarda escopo e não consulta Melhor Envio nem baixa estoque', options, async () => {
 const saved = await service(), result = await buy(saved.id, { total: 1, shipping: 999, shippingOption: { serviceId: '999', price: 999 }, items: [{ productId: saved.id, quantity: 1, isService: false, price: 1 }] })
 assert.equal(result.status, 201, JSON.stringify(result.data))
 const order = await prisma.order.findUniqueOrThrow({ where: { id: result.data.orderId }, include: { items: true } })
 assert.equal(String(order.total), '150'); assert.equal(String(order.shipping), '0'); assert.equal(order.shippingServiceId, null)
 assert.equal(order.items[0].isService, true); assert.deepEqual(order.items[0].serviceDetails, input.serviceDetails)
 assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: saved.id } })).stock, saved.stock)
 const current = await prisma.product.findUniqueOrThrow({ where: { id: saved.id } })
 await call('/api/admin/services/' + saved.id, 'PUT', { ...input, description: 'Descrição atualizada depois da compra.', serviceDetails: { ...input.serviceDetails, included: 'Outro escopo.' }, updatedAt: current.updatedAt.toISOString() })
 assert.deepEqual((await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })).serviceDetails, input.serviceDetails)
 let provider: unknown, refunded = false
 const id = 'ORDTST' + randomUUID().replaceAll('-', '').toUpperCase()
 mercadoPagoApi.request = async (path, _config, body) => {
  if (path === '/users/me') return { id: 123, site_id: 'MLB', tags: ['test_user'] }
  if (path === '/v1/payment_methods') return [{ id: 'visa', status: 'active', payment_type_id: 'credit_card' }]
  if (path === '/v1/orders') { assert.equal((body as { total_amount: string }).total_amount, '150.00'); provider = testProviderOrder((body as { external_reference: string }).external_reference, id, { status: 'created', status_detail: 'created', total_amount: '150.00', total_paid_amount: '0.00', transactions: { payments: [] }, checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${id}` }); return provider }
  const checkout = await prisma.paymentCheckout.findFirstOrThrow({ where: { orderId: order.id } })
  const paid = testProviderOrder(checkout.id, id, { total_amount: '150.00', total_paid_amount: '150.00', transactions: { payments: [{ id: testPaymentId, amount: '150.00', paid_amount: '150.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'visa', type: 'credit_card' } }], ...(refunded ? { refunds: [{ id: 'REF-service', transaction_id: testPaymentId, amount: '150.00', status: 'processed' }] } : {}) }, ...(refunded ? { status: 'refunded', status_detail: 'refunded' } : {}) })
  if (path === `/v1/orders/${id}/refund`) { assert.deepEqual(body, {}); refunded = true; return { id } }
  if (path === `/v1/orders/${id}`) return paid
  throw Error('Rede não simulada')
 }
 try {
  await createPaymentCheckout(order.id)
  await cancelOrderWithRefund(order.id, '150', 'admin@example.com')
  await cancelOrderWithRefund(order.id, '150', 'admin@example.com')
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, 'REFUNDED')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: saved.id } })).stock, saved.stock)
 } finally { mercadoPagoApi.request = original }
})
test('Serviços/SQL: carrinho misto cota apenas produtos e cancelamento repõe somente estoque físico', options, async () => {
 const serviceItem = await service(), sku = randomUUID()
 const category = await prisma.category.create({ data: { name: 'Teste misto', slug: sku } })
 const physical = await prisma.product.create({ data: { name: 'Peça de teste', sku, slug: sku, categoryId: category.id, stock: 10, price: 100, weightKg: 1, heightCm: 10, widthCm: 10, lengthCm: 10 } })
 const items = [{ productId: serviceItem.id, quantity: 1 }, { productId: physical.id, quantity: 2, isService: true }]
 assert.equal((await buy(serviceItem.id, { items })).status, 400)
 Object.assign(process.env, { MELHOR_ENVIO_TOKEN: 'ficticio', STORE_POSTAL_CODE: '38401721', MELHOR_ENVIO_USER_AGENT: 'Teste (teste@example.com)', MELHOR_ENVIO_ENV: 'sandbox' })
 const originalFetch = globalThis.fetch
 let quotes = 0
 globalThis.fetch = async (resource, init) => {
  if (String(resource).startsWith('https://sandbox.melhorenvio.com.br/')) {
   quotes++; const body = JSON.parse(String(init?.body)); assert.equal(body.products.length, 1); assert.equal(body.products[0].id, String(physical.id)); assert.equal(body.products[0].quantity, 2)
   return Response.json([{ id: 1, name: 'PAC', price: '25.50', delivery_time: 5, company: { name: 'Correios' } }])
  }
  return originalFetch(resource, init)
 }
 try {
  const result = await buy(serviceItem.id, { items, shippingOption: { serviceId: '1', price: 0 } }); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(quotes, 1)
  const order = await prisma.order.findUniqueOrThrow({ where: { id: result.data.orderId } })
  assert.equal(String(order.total), '375.5'); assert.equal(String(order.shipping), '25.5')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: physical.id } })).stock, 8)
  const { changeOrderStatus } = await import('./orderStatus')
  await changeOrderStatus(order.id, 'CANCELED'); await changeOrderStatus(order.id, 'CANCELED')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: physical.id } })).stock, 10)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: serviceItem.id } })).stock, serviceItem.stock)
 } finally { globalThis.fetch = originalFetch }
})

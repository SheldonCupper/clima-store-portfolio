import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { claimCoupon } from './coupons'
import { changeOrderStatus } from './orderStatus'
import { createPaymentCheckout } from './payments'
import { mercadoPagoApi } from './mercadoPago'
import { testProviderOrder } from './paymentFixtures'
const options = { skip: process.env.RUN_COUPON_DB_TESTS !== 'true' }
const original = mercadoPagoApi.request
before(() => { if (!options.skip) assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/) })
after(async () => { mercadoPagoApi.request = original; await prisma.$disconnect() })
async function coupon() { return prisma.coupon.create({ data: { code: 'T' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase(), kind: 'FIXED', value: 5, active: true, usageLimit: 1 } }) }
async function order() {
  const discount = await coupon(), unique = randomUUID()
  const category = await prisma.category.create({ data: { name: 'Categoria fictícia', slug: unique } })
  const product = await prisma.product.create({ data: { name: 'Produto fictício', slug: unique, sku: unique, price: 100, stock: 7, categoryId: category.id } })
  const customer = await prisma.customer.create({ data: { name: 'Cliente fictício', email: unique + '@gmail.com', phone: '34999999999', cpf: unique } })
  const address = await prisma.address.create({ data: { customerId: customer.id, cep: '38401700', street: 'Rua de teste', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' } })
  const created = await prisma.$transaction(async tx => {
    const claimed = await claimCoupon(tx, discount.code, 10000)
    return tx.order.create({ data: { couponId: claimed!.id, couponCode: claimed!.code, customerId: customer.id, addressId: address.id, paymentMethod: 'PIX', subtotal: 100, shipping: 20, discount: 5, total: 115, items: { create: { productId: product.id, productName: product.name, sku: product.sku, unitPrice: 100, quantity: 1, total: 100 } } } })
  })
  return { created, product, discount }
}
test('Cupons/SQL: duas compras disputam o último uso sem ultrapassar o limite', options, async () => {
  const saved = await coupon()
  const results = await Promise.allSettled([prisma.$transaction(tx => claimCoupon(tx, saved.code, 10000)), prisma.$transaction(tx => claimCoupon(tx, saved.code, 10000))])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: saved.id } })).usedCount, 1)
})
test('Cupons/SQL: falha depois da reserva desfaz a utilização', options, async () => {
  const saved = await coupon()
  await assert.rejects(prisma.$transaction(async tx => { await claimCoupon(tx, saved.code, 10000); throw Error('Falha simulada após cupom') }), /Falha simulada/)
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: saved.id } })).usedCount, 0)
})
test('Cupons/SQL: cancelamento libera cupom e estoque uma única vez', options, async () => {
  const fixture = await order()
  await changeOrderStatus(fixture.created.id, 'CANCELED')
  await changeOrderStatus(fixture.created.id, 'CANCELED')
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: fixture.discount.id } })).usedCount, 0)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.product.id } })).stock, 8)
  assert.ok((await prisma.order.findUniqueOrThrow({ where: { id: fixture.created.id } })).couponReleasedAt)
})
test('Cupons/SQL: Mercado Pago recebe o total líquido salvo no pedido', options, async () => {
  const fixture = await order(), providerId = 'ORDTST' + randomUUID().replaceAll('-', '').toUpperCase()
  Object.assign(process.env, { PAYMENTS_ENABLED: 'true', MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-ficticio-cupons', MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio', JWT_SECRET: 'segredo-ficticio', APP_PUBLIC_URL: 'https://loja.example', API_PUBLIC_URL: 'https://api.example' })
  let creates = 0
  mercadoPagoApi.request = async (path, _config, body) => {
    if (path === '/users/me') return { id: 123, site_id: 'MLB', tags: ['test_user'] }
    if (path === '/v1/payment_methods') return [{ id: 'pix', status: 'active', payment_type_id: 'bank_transfer' }]
    if (path === '/v1/orders') {
      creates++; assert.equal((body as { total_amount: string }).total_amount, '115.00')
      return testProviderOrder((body as { external_reference: string }).external_reference, providerId, { status: 'created', status_detail: 'created', total_amount: '115.00', total_paid_amount: '0.00', transactions: { payments: [] }, checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${providerId}` })
    }
    throw Error('Rede não simulada')
  }
  await createPaymentCheckout(fixture.created.id)
  assert.equal(creates, 1)
  assert.equal(String((await prisma.paymentCheckout.findUniqueOrThrow({ where: { orderId_environment: { orderId: fixture.created.id, environment: 'sandbox' } } })).amount), '115')
  mercadoPagoApi.request = original
})

test('Boas-vindas/SQL: pedidos simultâneos reservam uma única primeira compra e cancelamento libera nova tentativa', options, async () => {
  const { welcomeCouponId, welcomeCouponCode } = await import('./coupons')
  await prisma.coupon.upsert({ where: { id: welcomeCouponId }, create: { id: welcomeCouponId, code: welcomeCouponCode, kind: 'FIXED', value: 10, active: true }, update: { active: true } })
  const unique = randomUUID()
  const account = await prisma.customerAccount.create({ data: { name: 'Cliente fictício', email: unique + '@gmail.com', phone: '34999999999', cpf: unique, passwordHash: 'hash-ficticio', emailVerifiedAt: new Date() } })
  const customer = await prisma.customer.create({ data: { name: account.name, email: account.email, phone: account.phone, cpf: account.cpf } })
  const address = await prisma.address.create({ data: { customerId: customer.id, cep: '38401721', street: 'Rua fictícia', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' } })
  async function purchase() {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CustomerAccount" WHERE "id" = ${account.id} FOR UPDATE`
      const discount = await claimCoupon(tx, welcomeCouponCode, 10000, account)
      return tx.order.create({ data: { accountId: account.id, customerId: customer.id, addressId: address.id, couponId: discount!.id, couponCode: discount!.code, paymentMethod: 'PIX', subtotal: 100, shipping: 20, discount: 10, total: 110 } })
    })
  }
  const results = await Promise.allSettled([purchase(), purchase()])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const created = results.find(result => result.status === 'fulfilled')!
  assert.ok(created.status === 'fulfilled')
  await assert.rejects(purchase(), /primeira compra/)
  await changeOrderStatus(created.value.id, 'CANCELED')
  const next = await purchase()
  assert.equal(String(next.discount), '10')
  // Trocar o valor não modifica o desconto histórico do pedido.
  await prisma.coupon.update({ where: { id: welcomeCouponId }, data: { value: 20 } })
  assert.equal(String((await prisma.order.findUniqueOrThrow({ where: { id: next.id } })).discount), '10')
})

test('Google/SQL: cria identidade verificada, preserva cadastro vinculado e recusa conta local pendente', options, async () => {
  const { googleAccount } = await import('./googleAuth')
  const unique = randomUUID(), identity = { subject: 'google-' + unique, email: unique + '@gmail.com', name: 'Cliente Google fictício' }
  const created = await googleAccount(identity)
  assert.ok(created.emailVerifiedAt); assert.equal(created.googleSubject, identity.subject)
  assert.equal(created.phone, ''); assert.equal(created.cpf, '')
  const again = await googleAccount(identity)
  assert.equal(again.id, created.id)
  const localId = randomUUID(), local = await prisma.customerAccount.create({ data: { name: 'Conta local fictícia', email: localId + '@gmail.com', phone: '34999999999', cpf: localId, passwordHash: 'hash-ficticio' } })
  const localIdentity = { subject: 'google-' + localId, email: local.email, name: 'Nome do Google' }
  await assert.rejects(googleAccount(localIdentity), /Confirme/)
  await prisma.customerAccount.update({ where: { id: local.id }, data: { emailVerifiedAt: new Date() } })
  const linked = await googleAccount(localIdentity)
  assert.equal(linked.id, local.id); assert.equal(linked.phone, local.phone); assert.equal(linked.cpf, local.cpf)
  assert.equal(linked.name, local.name); assert.equal(linked.passwordHash, local.passwordHash)
})

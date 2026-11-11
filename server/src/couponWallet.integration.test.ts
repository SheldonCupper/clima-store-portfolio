import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { claimCoupon, redeemCoupon, welcomeCouponId } from './coupons'
const options = { skip: process.env.RUN_COUPON_WALLET_DB_TESTS !== 'true' }
before(() => { if (!options.skip) assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/) })
after(async () => { await prisma.$disconnect() })
async function fixture() {
  const unique = randomUUID()
  const account = await prisma.customerAccount.create({ data: { name: 'Carteira fictícia', email: unique + '@gmail.com', phone: '34999999999', cpf: unique, passwordHash: 'hash-ficticio' } })
  const coupon = await prisma.coupon.create({ data: { code: 'T' + unique.replaceAll('-', '').slice(0, 20).toUpperCase(), kind: 'FIXED', value: 10, active: true, published: true, usageLimit: 1, minSubtotal: 200 } })
  return { account, coupon }
}
test('Carteira/SQL: resgates simultâneos são idempotentes e não consomem cota nem exigem carrinho mínimo', options, async () => {
  const { account, coupon } = await fixture()
  const results = await Promise.all(Array.from({ length: 4 }, () => redeemCoupon(coupon.id, account)))
  assert.ok(results.every(result => result.saved && result.code === coupon.code))
  assert.equal(await prisma.couponClaim.count({ where: { couponId: coupon.id, accountId: account.id } }), 1)
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount, 0)
})
test('Carteira/SQL: ocultos, pausados, futuros, vencidos e esgotados não podem ser resgatados', options, async () => {
  const { account, coupon } = await fixture()
  for (const change of [{ published: false }, { active: false }, { startsAt: new Date(Date.now() + 60000) }, { expiresAt: new Date(Date.now() - 1000) }, { usedCount: 1 }]) {
    await prisma.coupon.update({ where: { id: coupon.id }, data: { published: true, active: true, startsAt: null, expiresAt: null, usedCount: 0, ...change } })
    await assert.rejects(redeemCoupon(coupon.id, account))
  }
  assert.equal(await prisma.couponClaim.count({ where: { couponId: coupon.id } }), 0)
})
test('Carteira/SQL: guardar não garante utilização; compra revalida mínimo e cota e rollback conserva carteira', options, async () => {
  const { account, coupon } = await fixture()
  await redeemCoupon(coupon.id, account)
  await assert.rejects(prisma.$transaction(tx => claimCoupon(tx, coupon.code, 10000, account)), /pelo menos/)
  await prisma.$transaction(tx => claimCoupon(tx, coupon.code, 20000, account))
  await assert.rejects(prisma.$transaction(tx => claimCoupon(tx, coupon.code, 20000, account)), /limite/)
  assert.equal(await prisma.couponClaim.count({ where: { couponId: coupon.id, accountId: account.id } }), 1)
})
test('Carteira/SQL: contas diferentes guardam o mesmo cupom sem compartilhar suas carteiras', options, async () => {
  const first = await fixture(), second = await fixture()
  await redeemCoupon(first.coupon.id, first.account)
  await redeemCoupon(first.coupon.id, second.account)
  const claims = await prisma.couponClaim.findMany({ where: { accountId: second.account.id } })
  assert.equal(claims.length, 1); assert.equal(claims[0].accountId, second.account.id)
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: first.coupon.id } })).usedCount, 0)
})
test('Carteira/SQL: boas-vindas exige primeira compra mesmo no resgate', options, async () => {
  const { account } = await fixture()
  await prisma.coupon.upsert({ where: { id: welcomeCouponId }, create: { id: welcomeCouponId, code: 'BOASVINDAS', kind: 'FIXED', value: 10, active: true, published: true }, update: { active: true, published: true } })
  const customer = await prisma.customer.create({ data: { name: account.name, email: account.email, cpf: account.cpf, phone: account.phone } })
  const address = await prisma.address.create({ data: { customerId: customer.id, cep: '38401721', street: 'Teste', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' } })
  await prisma.order.create({ data: { accountId: account.id, customerId: customer.id, addressId: address.id, status: 'PENDING', paymentMethod: 'PIX', subtotal: 100, shipping: 0, total: 100 } })
  await assert.rejects(redeemCoupon(welcomeCouponId, account), /primeira compra/)
  assert.equal(await prisma.couponClaim.count({ where: { accountId: account.id } }), 0)
})

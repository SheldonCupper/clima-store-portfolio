import { test, after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { couponCode, couponDiscount, moneyCents, parseCouponInput } from '../../shared/coupons'
const sample = { id: 'coupon-1', code: 'CLIMA10', kind: 'PERCENT' as const, value: '10', minSubtotal: '100', maxDiscount: null, active: true, startsAt: null, expiresAt: null, usageLimit: 2, usedCount: 0 }
const restorers: (() => void)[] = []
function stub(target: object, key: PropertyKey, implementation: unknown) { const original = Reflect.get(target, key); Reflect.set(target, key, implementation); restorers.push(() => { Reflect.set(target, key, original) }) }
const server = app.listen(0, '127.0.0.1')
beforeEach(() => {
  process.env.JWT_SECRET = 'segredo-ficticio-cupons'
  for (const model of [prisma.coupon, prisma.product]) for (const method of ['findUnique', 'findMany', 'create', 'updateMany']) stub(model, method, async () => { throw Error('Acesso não simulado') })
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0 })
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect() })
async function call(method: string, path: string, body?: unknown, admin = false) {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const token = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)
  return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Cookie: `admin_token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
test('código, moeda e condições rejeitam entradas inválidas', () => {
  assert.equal(couponCode(' clima-10 '), 'CLIMA-10'); assert.equal(moneyCents('19.99'), 1999)
  for (const value of ['a', 'Clima 10', 'R'.repeat(31), {}, null]) assert.throws(() => couponCode(value))
  for (const value of ['1e3', -1, NaN, Infinity, '1.234', {}, '999999999']) assert.throws(() => moneyCents(value))
  for (const change of [{ value: 101 }, { value: 0 }, { active: 'sim' }, { usageLimit: 0 }, { usageLimit: 1.2 }, { startsAt: 'ontem' }, { startsAt: '2026-12-02T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' }]) assert.throws(() => parseCouponInput({ ...sample, ...change }))
  assert.equal(parseCouponInput({ code: 'FIXO', kind: 'FIXED', value: '25.50' }).active, false)
})
test('desconto em centavos tem arredondamento, teto e nunca abate além dos produtos', () => {
  assert.equal(couponDiscount(sample, 19999), 2000)
  assert.equal(couponDiscount({ ...sample, maxDiscount: '5' }, 19999), 500)
  assert.equal(couponDiscount({ ...sample, kind: 'FIXED', value: '200' }, 15000), 15000)
  for (const change of [{ active: false }, { startsAt: new Date(Date.now() + 100000) }, { expiresAt: new Date(Date.now() - 1) }, { usedCount: 2 }]) assert.throws(() => couponDiscount({ ...sample, ...change }, 20000))
  assert.throws(() => couponDiscount(sample, 9999), /pelo menos/)
})
test('admin é obrigatório para listar, criar ou ativar cupons', async () => {
  for (const [method, path, body] of [['GET', '/admin/coupons', undefined], ['POST', '/admin/coupons', sample], ['PATCH', '/admin/coupons/coupon-1', { active: false }]] as const) assert.equal((await call(method, path, body)).status, 401)
})
test('criação normaliza código, não aceita contagem injetada, e regras não podem ser alteradas por PATCH', async () => {
  stub(prisma.coupon, 'create', async ({ data }: { data: Record<string, unknown> }) => { assert.equal(data.code, 'CLIMA10'); assert.equal(data.usedCount, undefined); return { id: 'novo', ...data, usedCount: 0 } })
  const created = await call('POST', '/admin/coupons', { ...sample, code: 'clima10', usedCount: 999 }, true)
  assert.equal(created.status, 201); assert.equal((await created.json()).usedCount, 0)
  assert.equal((await call('PATCH', '/admin/coupons/coupon-1', { active: true, value: 99 }, true)).status, 400)
  stub(prisma.coupon, 'updateMany', async ({ data }: { data: unknown }) => { assert.deepEqual(data, { active: false }); return { count: 1 } })
  assert.equal((await call('PATCH', '/admin/coupons/coupon-1', { active: false }, true)).status, 200)
})
test('prévia usa somente preços Pix/cartão do banco, não consome utilização e informa o total dos produtos', async () => {
  stub(prisma.coupon, 'findUnique', async () => sample)
  stub(prisma.product, 'findMany', async () => [{ id: 1, stock: 10, price: '100', pixPrice: '90' }])
  for (const paymentMethod of ['PIX', 'CREDIT_CARD']) {
    const response = await call('POST', '/coupons/preview', { code: 'clima10', paymentMethod, subtotal: 1, discount: 999, items: [{ productId: 1, quantity: 2, price: 0.01 }] })
    assert.equal(response.status, 200); const data = await response.json()
    assert.equal(data.subtotal, paymentMethod === 'PIX' ? 180 : 200)
    assert.equal(data.discount, paymentMethod === 'PIX' ? 18 : 20)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
})

test('divulgação é opt-in e rejeita valores que não sejam booleanos', () => {
  assert.equal(parseCouponInput({ ...sample }).published, false)
  assert.equal(parseCouponInput({ ...sample, published: true }).published, true)
  assert.throws(() => parseCouponInput({ ...sample, published: 'true' }))
})
test('divulgação exige admin e não permite alterar regras financeiras', async () => {
  assert.equal((await call('PATCH', '/admin/coupons/coupon-1', { published: true })).status, 401)
  assert.equal((await call('PATCH', '/admin/coupons/coupon-1', { published: true, usedCount: 0 }, true)).status, 400)
  stub(prisma.coupon, 'updateMany', async ({ data }: { data: unknown }) => { assert.deepEqual(data, { published: true }); return { count: 1 } })
  assert.equal((await call('PATCH', '/admin/coupons/coupon-1', { published: true }, true)).status, 200)
})
test('ofertas públicas filtram publicação, datas e cota sem expor limites internos', async () => {
  stub(prisma.coupon, 'findMany', async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.published, true); assert.equal(where.active, true); assert.equal((where.AND as unknown[]).length, 2); return [{ ...sample, published: true }, { ...sample, id: 'exhausted', usedCount: 2 }] })
  const response = await call('GET', '/coupons/available')
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
  const data = await response.json(); assert.equal(data.coupons.length, 1)
  assert.equal(data.coupons[0].code, sample.code); assert.equal(data.coupons[0].usageLimit, undefined); assert.equal(data.coupons[0].usedCount, undefined)
})
test('carteira e resgate rejeitam visitante sem acessar resgates de clientes', async () => {
  assert.equal((await call('GET', '/customer/coupons')).status, 401)
  assert.equal((await call('POST', '/customer/coupons/coupon-1/redeem', {})).status, 401)
})
test('carteira consulta somente a conta autenticada e identifica cupom pausado', async () => {
  const account = { id: 42, name: 'Cliente fictício', email: 'cliente@example.com', cpf: '', phone: '', sessionVersion: 0, verificationRequired: false }
  stub(prisma.customerAccount, 'findUnique', async () => account)
  stub(prisma.couponClaim, 'findMany', async ({ where }: { where: unknown }) => { assert.deepEqual(where, { accountId: 42 }); return [{ coupon: { ...sample, active: false, published: false } }] })
  const token = jwt.sign({ role: 'CUSTOMER', version: 0 }, process.env.JWT_SECRET!, { subject: '42', audience: 'customer-account', issuer: 'ecommerce-api' })
  const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/customer/coupons?accountId=999`, { headers: { Cookie: `customer_session=${token}` } })
  assert.equal(response.status, 200)
  const data = await response.json(); assert.equal(data.coupons[0].saved, true); assert.match(data.coupons[0].unavailable, /pausada/)
})

test('exclusão de cupom exige admin e confirmação exata do código', async () => {
 assert.equal((await call('DELETE','/admin/coupons/coupon-1',{confirmation:'CLIMA10'})).status,401)
 assert.equal((await call('DELETE','/admin/coupons/coupon-1',{},true)).status,400)
 stub(prisma.coupon,'findUnique',async()=>sample)
 assert.equal((await call('DELETE','/admin/coupons/coupon-1',{confirmation:'OUTRO'},true)).status,400)
})
test('exclusão desativa e oculta o cupom sem apagar pedidos, regras ou resgates', async () => {
 stub(prisma.coupon,'findUnique',async()=>sample)
 stub(prisma.coupon,'updateMany',async({where,data}:{where:unknown;data:Record<string,unknown>})=>{assert.deepEqual(where,{id:'coupon-1',deletedAt:null});assert.equal(data.active,false);assert.equal(data.published,false);assert.ok(data.deletedAt instanceof Date);assert.deepEqual(Object.keys(data).sort(),['active','deletedAt','published']);return{count:1}})
 const response=await call('DELETE','/admin/coupons/coupon-1',{confirmation:'CLIMA10'},true);assert.equal(response.status,200);assert.equal((await response.json()).success,true)
})
test('cupom excluído não pode ser reativado por PATCH nem voltar na lista do admin', async () => {
 stub(prisma.coupon,'updateMany',async({where}:{where:{deletedAt:unknown}})=>{assert.equal(where.deletedAt,null);return{count:0}})
 assert.equal((await call('PATCH','/admin/coupons/coupon-1',{active:true},true)).status,404)
 stub(prisma.coupon,'findMany',async({where}:{where:unknown})=>{assert.deepEqual(where,{deletedAt:null});return[]})
 const response=await call('GET','/admin/coupons',undefined,true);assert.equal(response.status,200);assert.deepEqual(await response.json(),[])
})

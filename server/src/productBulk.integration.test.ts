import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { applyProductBulk, parseProductBulk, ProductSelectionChanged } from './productBulk'
const enabled = process.env.RUN_PRODUCT_BULK_DB_TESTS === 'true'
before(() => { if (enabled) assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/) })
after(async () => { await prisma.$disconnect() })
async function fixture() {
  const key = randomUUID()
  const category = await prisma.category.create({ data: { name: 'Categoria fictícia lote', slug: key } })
  const products = await Promise.all([1, 2, 3].map(index => prisma.product.create({ data: { name: `Produto fictício ${index}`, sku: `${key}-${index}`, slug: `${key}-${index}`, categoryId: category.id, price: 100, pixPrice: 90, stock: 10, active: index === 3 } })))
  return products
}
async function run(action: 'activate' | 'deactivate' | 'delete', products: { id: number; updatedAt: Date }[]) {
  const input = parseProductBulk({ action, products: products.map(product => ({ id: product.id, updatedAt: product.updatedAt.toISOString() })), confirmation: 'EXCLUIR' })
  return prisma.$transaction(tx => applyProductBulk(tx, input), { isolationLevel: 'Serializable' })
}
test('Lote/SQL: ativa e desativa seleção, mantém preços/estoque e não altera produto fora da seleção', { skip: !enabled }, async () => {
  const products = await fixture(), ids = products.slice(0, 2).map(product => product.id)
  assert.equal((await run('activate', products.slice(0, 2))).affected, 2)
  const activated = await prisma.product.findMany({ where: { id: { in: ids } } })
  assert.ok(activated.every(product => product.active && product.stock === 10 && String(product.price) === '100' && String(product.pixPrice) === '90'))
  assert.equal((await run('deactivate', activated)).affected, 2)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: products[2].id } })).active, true)
})
test('Lote/SQL: exclui somente produtos sem pedidos e mantém produto, pedido e item históricos', { skip: !enabled }, async () => {
  const products = await fixture(), key = randomUUID()
  const customer = await prisma.customer.create({ data: { name: 'Cliente fictício', email: key + '@gmail.com', cpf: key, phone: '34999999999' } })
  const address = await prisma.address.create({ data: { customerId: customer.id, cep: '38401721', street: 'Rua fictícia', number: '1', district: 'Teste', city: 'Uberlândia', state: 'MG' } })
  const order = await prisma.order.create({ data: { customerId: customer.id, addressId: address.id, paymentMethod: 'PIX', status: 'CANCELED', subtotal: 100, shipping: 20, discount: 0, total: 120, items: { create: { productId: products[0].id, productName: products[0].name, sku: products[0].sku, unitPrice: 100, quantity: 1, total: 100 } } } })
  const result = await run('delete', products)
  assert.equal(result.affected, 2); assert.equal(result.protectedCount, 1)
  assert.equal(await prisma.product.count({ where: { id: { in: products.map(product => product.id) } } }), 1)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).stock, 10)
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'CANCELED')
  assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1)
})
test('Lote/SQL: edição após seleção aborta todo o lote antes de excluir', { skip: !enabled }, async () => {
  const products = await fixture()
  await prisma.product.update({ where: { id: products[0].id }, data: { stock: 11, updatedAt: new Date(products[0].updatedAt.getTime() + 1000) } })
  await assert.rejects(run('delete', products), ProductSelectionChanged)
  assert.equal(await prisma.product.count({ where: { id: { in: products.map(product => product.id) } } }), 3)
})

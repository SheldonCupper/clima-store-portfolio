import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { applyProductBulk, parseProductBulk, ProductSelectionChanged } from './productBulk'
const date = new Date('2026-01-01T00:00:00.000Z')
const snapshot = { id: 1, updatedAt: date.toISOString() }
const originalEnv = { ...process.env }
const restorers: (() => void)[] = []
function stub(target: object, key: string, value: unknown) { const old = Reflect.get(target, key); Reflect.set(target, key, value); restorers.push(() => Reflect.set(target, key, old)) }
const server = app.listen(0, '127.0.0.1')
before(async () => { process.env.JWT_SECRET = 'segredo-ficticio-lote'; if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve)) })
afterEach(() => { restorers.reverse().forEach(restore => restore()); restorers.length = 0 })
after(async () => { process.env = originalEnv; await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() })
async function call(body: unknown, role = 'ADMIN') { return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/products/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { Cookie: `admin_token=${jwt.sign({ role, email: 'admin@example.com' }, process.env.JWT_SECRET!)}` } : {}) }, body: JSON.stringify(body) }) }
test('lote exige ação e lista explícita com versões válidas; exclusão exige confirmação', () => {
  for (const body of [{ action: 'delete', products: [snapshot] }, { action: 'tudo', products: [snapshot] }, { action: 'activate', all: true }, { action: 'activate', products: [] }, { action: 'activate', products: [snapshot, snapshot] }, { action: 'activate', products: [{ ...snapshot, id: '1' }] }, { action: 'activate', products: [{ id: 1, updatedAt: 'ontem' }] }, { action: 'activate', products: Array(5001).fill(snapshot) }]) assert.throws(() => parseProductBulk(body))
  assert.equal(parseProductBulk({ action: 'delete', products: [snapshot], confirmation: 'EXCLUIR', all: true }).products.length, 1)
})
test('sem sessão ou com token de cliente não é possível alterar/excluir produtos', async () => {
  for (const role of ['', 'CUSTOMER']) assert.equal((await call({ action: 'activate', products: [snapshot] }, role)).status, role ? 403 : 401)
})
test('ativação e desativação só escrevem active nos IDs selecionados', async () => {
  for (const action of ['activate', 'deactivate'] as const) {
    let update: unknown
    const tx = { product: { findMany: async () => [{ id: 1, name: 'Produto', updatedAt: date, _count: { orderItems: 2 } }], updateMany: async (args: unknown) => { update = args; return { count: 1 } } } }
    const result = await applyProductBulk(tx as never, parseProductBulk({ action, products: [snapshot], stock: 999 }))
    assert.equal(result.affected, 1); assert.deepEqual(update, { where: { id: { in: [1] }, active: action !== 'activate' }, data: { active: action === 'activate' } })
  }
})
test('produtos modificados ou ausentes abortam antes de escrever', async () => {
  for (const records of [[], [{ id: 1, updatedAt: new Date('2026-02-01'), _count: { orderItems: 0 } }]]) {
    let writes = 0
    const tx = { product: { findMany: async () => records, updateMany: async () => { writes++; return { count: 1 } }, deleteMany: async () => { writes++; return { count: 1 } } } }
    await assert.rejects(applyProductBulk(tx as never, parseProductBulk({ action: 'delete', products: [snapshot], confirmation: 'EXCLUIR' })), ProductSelectionChanged)
    assert.equal(writes, 0)
  }
})
test('exclusão preserva produtos com qualquer pedido e nunca apaga itens de pedido', async () => {
  let removed: unknown
  const tx = { product: { findMany: async () => [{ id: 1, name: 'Sem pedido', updatedAt: date, _count: { orderItems: 0 } }, { id: 2, name: 'Com pedido', updatedAt: date, _count: { orderItems: 1 } }], deleteMany: async (args: unknown) => { removed = args; return { count: 1 } } } }
  const result = await applyProductBulk(tx as never, parseProductBulk({ action: 'delete', products: [snapshot, { ...snapshot, id: 2 }], confirmation: 'EXCLUIR' }))
  assert.deepEqual(removed, { where: { id: { in: [1] }, orderItems: { none: {} } } }); assert.equal(result.affected, 1); assert.equal(result.protectedCount, 1); assert.deepEqual(result.protectedProducts, [{ id: 2, name: 'Com pedido' }])
})
test('rota responde sucesso e traduz conflito de concorrência sem vazamento de SQL', async () => {
  stub(prisma, '$transaction', async () => ({ affected: 1, protectedCount: 0, protectedProducts: [] }))
  const response = await call({ action: 'deactivate', products: [snapshot] }); assert.equal(response.status, 200); assert.equal((await response.json()).affected, 1)
  stub(prisma, '$transaction', async () => { throw Object.assign(new Error('Detalhes internos SQL'), { code: 'P2003' }) })
  const conflict = await call({ action: 'delete', products: [snapshot], confirmation: 'EXCLUIR' }); assert.equal(conflict.status, 409); assert.doesNotMatch((await conflict.json()).error, /SQL/)
})

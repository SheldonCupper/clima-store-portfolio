import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { MAX_PRODUCT_IMAGES, parseProductImages } from '../../shared/productMedia'
import { productMediaUpdate } from './productMedia'

const current = { id: 81, name: 'Produto', slug: 'produto', sku: 'P1', imageUrl: '/uploads/capa.png', imageUrls: ['/uploads/capa.png', '/uploads/lado.png'], gtin: null }
const input = { name: 'Produto', slug: 'produto', sku: 'P1', price: '40', pixPrice: '20', stock: 8, active: true, categoryId: 1, weightKg: .4, heightCm: 20, widthCm: 20, lengthCm: 20 }
const restorers: (() => void)[] = []
function stub<T extends object>(target: T, method: keyof T, implementation: (...args: never[]) => unknown) { const original = target[method]; Reflect.set(target, method, implementation); restorers.push(() => { Reflect.set(target, method, original) }) }
const server = app.listen(0, '127.0.0.1')
after(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); await prisma.$disconnect() })
beforeEach(() => {
  process.env.JWT_SECRET = 'segredo-ficticio-de-galeria'
  stub(prisma.product, 'findUnique', async (args: unknown) => (args as { where: { id?: number } }).where.id ? current : null)
  stub(prisma.category, 'findUnique', async () => ({ id: 1, name: 'Categoria' }))
  stub(prisma.product, 'update', async () => { throw Error('Escrita inesperada') })
  stub(prisma.product, 'create', async () => { throw Error('Escrita inesperada') })
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0 })
async function call(method: string, body: unknown, admin = true) {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const token = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)
  return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/products${method === 'PUT' ? '/81' : ''}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Cookie: 'admin_token=' + token } : {}) }, body: JSON.stringify(body) })
}
test('galeria mantém ordem, limita quantidade e rejeita URLs inseguras', () => {
  assert.deepEqual(parseProductImages(['/uploads/2.webp', '/uploads/1.png', '/uploads/2.webp']), ['/uploads/2.webp', '/uploads/1.png'])
  for (const value of [Array(MAX_PRODUCT_IMAGES + 1).fill('/uploads/a.png'), ['javascript:alert(1)'], ['//evil.example/a'], ['/uploads/../.env'], ['https://user:secret@example.com/a.png'], ['data:image/png,abc'], 'uma imagem']) assert.throws(() => parseProductImages(value))
})
test('clientes antigos preservam as fotos e podem trocar a capa sem perder os outros ângulos', () => {
  assert.deepEqual(productMediaUpdate({}, current), {})
  assert.deepEqual(productMediaUpdate({ imageUrl: current.imageUrl }, current), {})
  assert.deepEqual(productMediaUpdate({ imageUrl: '/uploads/nova.png' }, current), { imageUrl: '/uploads/nova.png', imageUrls: ['/uploads/nova.png', '/uploads/lado.png'] })
  assert.deepEqual(productMediaUpdate({ imageUrl: 'http://localhost:3001/uploads/antiga.png' }), { imageUrl: '/uploads/antiga.png', imageUrls: ['/uploads/antiga.png'] })
})
test('primeira foto define a principal e esvaziar galeria remove somente referências', () => {
  assert.deepEqual(productMediaUpdate({ imageUrls: ['/uploads/lado.png', '/uploads/capa.png'], imageUrl: '/uploads/ignorada.png' }, current), { imageUrl: '/uploads/lado.png', imageUrls: ['/uploads/lado.png', '/uploads/capa.png'] })
  assert.deepEqual(productMediaUpdate({ imageUrls: [] }, current), { imageUrl: null, imageUrls: [] })
})
test('API exige administrador para cadastrar e editar fotos', async () => {
  assert.equal((await call('POST', input, false)).status, 401)
  assert.equal((await call('PUT', input, false)).status, 401)
})
test('API salva múltiplas fotos na criação e ordem/principal na edição', async () => {
  const imageUrls = ['/uploads/segundo.png', '/uploads/primeiro.png']
  let writes = 0
  for (const method of ['create', 'update'] as const) stub(prisma.product, method, async (args: unknown) => {
    const data = (args as { data: Record<string, unknown> }).data
    assert.deepEqual(data.imageUrls, imageUrls); assert.equal(data.imageUrl, imageUrls[0]); assert.equal(data.gtin, '7890830766152'); writes++
    return { ...input, id: 81, ...data }
  })
  for (const method of ['POST', 'PUT']) {
    const response = await call(method, { ...input, imageUrls, gtin: '7890830766152' })
    assert.equal(response.status, method === 'POST' ? 201 : 200); assert.deepEqual((await response.json()).imageUrls, imageUrls)
  }
  assert.equal(writes, 2)
})
test('API rejeita fotos/GTIN inválidos antes de gravar', async () => {
  for (const invalid of [{ imageUrls: ['javascript:alert(1)'] }, { imageUrls: Array(13).fill('/uploads/a.png') }, { gtin: '7890830766153' }]) {
    for (const method of ['POST', 'PUT']) assert.equal((await call(method, { ...input, ...invalid })).status, 400)
  }
})
test('edição antiga sem fotos nem GTIN mantém esses campos intactos', async () => {
  stub(prisma.product, 'update', async (args: unknown) => {
    const data = (args as { data: Record<string, unknown> }).data
    assert.equal(data.imageUrl, undefined); assert.equal(data.imageUrls, undefined); assert.equal(data.gtin, undefined)
    return { ...current, ...input }
  })
  assert.equal((await call('PUT', input)).status, 200)
})

 test('capacidade da galeria exige sessão administrativa', async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/product-features`
  assert.equal((await fetch(url)).status, 401)
  const token = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)
  const response = await fetch(url, { headers: { Cookie: 'admin_token=' + token } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { gallery: true, technicalAttributes: true })
})

test('listagem administrativa exige autenticação e inclui cadastros inativos para revisão', async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/products`
  assert.equal((await fetch(url)).status, 401)
  stub(prisma.product, 'findMany', async (args: unknown) => {
    assert.deepEqual((args as { where?: unknown }).where, { isService: false })
    return [{ ...current, active: false }]
  })
  const token = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)
  const response = await fetch(url, { headers: { Cookie: 'admin_token=' + token } })
  assert.equal(response.status, 200)
  assert.equal((await response.json())[0].active, false)
})

test('ficha técnica é salva em criação/edição e não é apagada por clientes antigos', async () => {
  const technicalAttributes = { brand: 'Clima', model: 'Modelo A', voltage: '220 V', capacity: '7 CFM' }
  for (const method of ['create', 'update'] as const) stub(prisma.product, method, async (args: unknown) => {
    const data = (args as { data: Record<string, unknown> }).data
    assert.deepEqual(data.technicalAttributes, technicalAttributes)
    return { ...input, id: 81, ...data }
  })
  for (const method of ['POST', 'PUT']) {
    const response = await call(method, { ...input, technicalAttributes })
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assert.deepEqual((await response.json()).technicalAttributes, technicalAttributes)
  }
  stub(prisma.product, 'update', async (args: unknown) => {
    const data = (args as { data: Record<string, unknown> }).data
    assert.equal(data.technicalAttributes, undefined)
    return { ...current, ...input, technicalAttributes }
  })
  assert.equal((await call('PUT', input)).status, 200)
})
test('API rejeita ficha técnica inválida sem gravar', async () => {
  for (const technicalAttributes of [null, { brand: 'x'.repeat(121) }, { hidden: 'não permitido' }]) {
    for (const method of ['POST', 'PUT']) assert.equal((await call(method, { ...input, technicalAttributes })).status, 400)
  }
})

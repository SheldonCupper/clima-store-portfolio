import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { productCsvTemplate } from '../../shared/productCsv'
const enabled = process.env.RUN_PRODUCT_IMPORT_DB_TESTS === 'true'
let server: ReturnType<typeof app.listen>
before(async () => { if (enabled) { assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/clima_payments_validation_/); process.env.JWT_SECRET = 'chave-ficticia-csv-sql'; server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)) } })
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() })
async function call(path: string, csv: string, token?: string) { return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/products/import/${path}`, { method: 'POST', headers: { 'Content-Type': 'text/csv', Cookie: `admin_token=${jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)}`, ...(token ? { 'X-Import-Preview': token } : {}) }, body: csv }) }
async function fixture() {
  const id = randomUUID()
  const category = await prisma.category.create({ data: { name: 'Categoria fictícia CSV', slug: 'cat-' + randomUUID() } })
  const csv = productCsvTemplate(category.slug).replace('Produto de exemplo', `Produto ${id}`).replace('EXEMPLO-001', id)
  const [header, row] = csv.trimEnd().split('\r\n')
  const second = row.replaceAll(id, id + '-2')
  return { id, csv: [header, row, second].join('\r\n'), category }
}
test('CSV/SQL: prévia não grava, lote cria dois produtos e importações concorrentes não duplicam nem sobrescrevem', { skip: !enabled }, async () => {
  const f = await fixture()
  const previewResponse = await call('preview', f.csv), preview = await previewResponse.json()
  assert.equal(previewResponse.status, 200, JSON.stringify(preview)); assert.equal(preview.errors, 0)
  assert.equal(await prisma.product.count({ where: { sku: { startsWith: f.id } } }), 0)
  const results = await Promise.all([call('confirm', f.csv, preview.token), call('confirm', f.csv, preview.token)])
  assert.equal(results.filter(result => result.status === 201).length, 1)
  assert.equal(await prisma.product.count({ where: { sku: { startsWith: f.id } } }), 2)
  const items = await prisma.product.findMany({ where: { sku: { startsWith: f.id } } })
  assert.ok(items.every(item => !item.active && item.stock === 10 && item.weightKg === .8))
  assert.equal((await call('confirm', f.csv, preview.token)).status, 400)
  assert.equal(await prisma.product.count({ where: { sku: { startsWith: f.id } } }), 2)
})
test('CSV/SQL: erro em uma linha recusa todo o lote sem cadastrar as válidas', { skip: !enabled }, async () => {
  const f = await fixture(), invalid = f.csv.replace('"119,90"', '"-1"')
  const preview = await (await call('preview', invalid)).json()
  assert.equal(preview.errors, 1)
  assert.equal((await call('confirm', invalid, preview.token)).status, 400)
  assert.equal(await prisma.product.count({ where: { sku: { startsWith: f.id } } }), 0)
})

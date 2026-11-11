import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { app } from './index'
import prisma from './prisma'
import { CSV_MAX_PRODUCTS, csvProduct, parseProductCsv, productCsvTemplate } from '../../shared/productCsv'
import { previewProductImport } from './productImport'
const source = productCsvTemplate('ferramentas')
const category = { id: 5, name: 'Ferramentas', slug: 'ferramentas' }
const savedEnv = { ...process.env }
const restores: (() => void)[] = []
function stub(target: object, key: string, value: unknown) { const old = Reflect.get(target, key); Reflect.set(target, key, value); restores.push(() => Reflect.set(target, key, old)) }
const server = app.listen(0, '127.0.0.1')
before(() => { process.env.JWT_SECRET = 'chave-ficticia-csv' })
afterEach(() => { restores.reverse().forEach(restore => restore()); restores.length = 0 })
after(async () => { process.env = savedEnv; await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() })
async function call(path: string, csv = source, admin = true, token?: string) {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/products/import/${path}`, { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', ...(admin ? { Cookie: `admin_token=${jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)}` } : {}), ...(token ? { 'X-Import-Preview': token } : {}) }, body: csv })
}
test('CSV lê BOM, ponto e vírgula, vírgula decimal, gera slug e usa kg/cm com inativo por padrão', () => {
  const record = parseProductCsv(source)[0], data = csvProduct(record.cells)
  assert.equal(data.price, 119.9); assert.equal(data.pixPrice, 109.9); assert.equal(data.weightKg, .8)
  assert.equal(data.heightCm, 20); assert.equal(data.active, false); assert.equal(data.slug, 'produto-de-exemplo')
  assert.equal(data.sku, 'EXEMPLO-001'); assert.equal(data.gtin, null)
})
test('CSV permite vírgula delimitadora e descrição com aspas, separadores e múltiplas linhas; preserva linha física', () => {
  const text = 'nome,sku,categoria,preco,estoque,peso_kg,altura_cm,largura_cm,comprimento_cm,descricao\n"Produto, teste",S1,ferramentas,10.50,0,0.5,10,20,30,"Contém ; e ""aspas""\nna descrição"\nOutro,S2,ferramentas,10,1,1,10,20,30,Normal\n'
  const rows = parseProductCsv(text); assert.equal(rows.length, 2); assert.equal(rows[0].cells.descricao, 'Contém ; e "aspas"\nna descrição'); assert.equal(rows[1].line, 4)
  assert.equal(csvProduct(rows[0].cells).stock, 0)
})
test('CSV recusa formato inválido, cabeçalho desconhecido/duplicado, excesso de linhas e tamanho', () => {
  for (const text of ['', source.replace('"nome"','"nome_errado"'), source.replace('"sku"','"nome"'), source.replace('"tipo_gas"','"segredo"'), source + '"não fechado', source + 'a;b\n', 'x'.repeat(1024 * 1024 + 1)]) assert.throws(() => parseProductCsv(text))
  const [head, row] = source.trimEnd().split('\r\n')
  assert.throws(() => parseProductCsv([head, ...Array(CSV_MAX_PRODUCTS + 1).fill(row)].join('\n')), /200/)
})
test('CSV valida preços, estoque, medidas reais, GTIN, fotos e ficha técnica', () => {
  const cells = parseProductCsv(source)[0].cells
  const patches: Record<string, string>[] = [{ preco: '1.000,00' }, { preco: '1e3' }, { preco: '' }, { preco: '0' }, { estoque: '-1' }, { estoque: '1.5' }, { altura_cm: '1.5' }, { peso_kg: '0' }, { ativo: 'talvez' }, { imagens: 'javascript:alert(1)' }, { imagens: 'https://a.example/a|'.repeat(13) }, { gtin: '123' }, { marca: 'a'.repeat(121) }, { preco_pix: '999' }]
  for (const patch of patches) assert.throws(() => csvProduct({ ...cells, ...patch }))
  const data = csvProduct({ ...cells, ativo: 'sim', marca: 'Marca real', imagens: 'https://foto.example/1.jpg|https://foto.example/2.jpg' })
  assert.equal(data.active, true); assert.equal(data.imageUrls.length, 2); assert.equal(data.technicalAttributes.brand, 'Marca real')
})
test('prévia confere categorias e conflitos de SKU/slug sem fazer escrita', async () => {
  const db = { category: { findMany: async () => [category] }, product: { findMany: async () => [{ sku: 'EXEMPLO-001', slug: 'outro' }] } }
  assert.equal((await previewProductImport(source, db as never)).errors, 1)
  assert.equal((await previewProductImport(source.replaceAll('ferramentas', 'inexistente'), db as never)).errors, 1)
  const [header, row] = source.trimEnd().split('\r\n')
  const duplicates = await previewProductImport([header, row, row].join('\n'), { ...db, product: { findMany: async () => [] } } as never)
  assert.equal(duplicates.errors, 1); assert.match(duplicates.rows[1].error, /repetido/)
})
test('importador exige admin e não permite pular prévia ou importar lote com erro', async () => {
  assert.equal((await call('preview', source, false)).status, 401)
  assert.equal((await call('confirm', source, false)).status, 401)
  let creates = 0
  const db = { category: { findMany: async () => [category] }, product: { findMany: async () => [], createMany: async () => { creates++; return { count: 1 } } } }
  stub(prisma, '$transaction', async (fn: (tx: unknown) => unknown) => fn(db))
  assert.equal((await call('confirm')).status, 400)
  assert.equal((await call('confirm', source.replaceAll('ferramentas', 'inexistente'))).status, 400)
  assert.equal(creates, 0)
  const preview = await previewProductImport(source, db as never)
  const confirmed = await call('confirm', source, true, preview.token)
  assert.equal(confirmed.status, 201, await confirmed.text())
  assert.equal(creates, 1)
})
test('prévia HTTP não escreve; confirmação revalida catálogo alterado e conflito de concorrência', async () => {
  let creates = 0, conflicts = false
  const product = { findMany: async () => conflicts ? [{ sku: 'EXEMPLO-001', slug: 'produto-de-exemplo' }] : [], createMany: async () => { creates++; throw Object.assign(new Error('Duplicado'), { code: 'P2002' }) } }
  stub(prisma.category, 'findMany', async () => [category]); stub(prisma.product, 'findMany', product.findMany)
  const response = await call('preview'); assert.equal(response.status, 200)
  const preview = await response.json(); assert.equal(preview.errors, 0); assert.equal(creates, 0)
  stub(prisma, '$transaction', async (fn: (tx: unknown) => unknown) => fn({ category: { findMany: async () => [category] }, product }))
  const concurrent = await call('confirm', source, true, preview.token); assert.equal(concurrent.status, 409); assert.match((await concurrent.json()).error, /Nada foi importado/)
  conflicts = true; assert.equal((await call('confirm', source, true, preview.token)).status, 400)
  assert.equal(creates, 1)
})

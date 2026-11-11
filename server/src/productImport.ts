import express, { Router } from 'express'
import { createHash } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { csvProduct, parseProductCsv } from '../../shared/productCsv'
import { normalizeAttribute } from '../../shared/productAttributes'
import { catalogIssues } from '../../shared/catalogQuality'

type ImportDb = Pick<Prisma.TransactionClient, 'category' | 'product'>
export async function previewProductImport(csv: string, db: ImportDb) {
  const records = parseProductCsv(csv)
  const categories = await db.category.findMany({ where: { active: true }, select: { id: true, slug: true, name: true } })
  const seenSku = new Set<string>(), seenSlug = new Set<string>()
  const rows = records.map(record => {
    try {
      const data = csvProduct(record.cells)
      const categoryText = record.cells.categoria
      const matches = categories.filter(category => category.slug === categoryText)
      const byName = matches.length ? matches : categories.filter(category => normalizeAttribute(category.name) === normalizeAttribute(categoryText))
      if (byName.length !== 1) throw new Error('Categoria inexistente, inativa ou ambígua. Use o slug de uma categoria ativa.')
      if (seenSku.has(data.sku)) throw new Error('SKU repetido no arquivo.')
      if (seenSlug.has(data.slug)) throw new Error('Slug repetido no arquivo. Preencha slugs diferentes para variações do mesmo produto.')
      seenSku.add(data.sku); seenSlug.add(data.slug)
      const category = byName[0]
      return { line: record.line, name: data.name, sku: data.sku, category: category.name, error: '', warnings: catalogIssues({ ...data, category }), data: { ...data, categoryId: category.id } }
    } catch (error) { return { line: record.line, name: record.cells.nome || '', sku: record.cells.sku || '', category: record.cells.categoria || '', error: error instanceof Error ? error.message : 'Dados inválidos.', warnings: [], data: null } }
  })
  const prepared = rows.flatMap(row => row.data ? [row.data] : [])
  const existing = prepared.length ? await db.product.findMany({ where: { OR: [{ sku: { in: prepared.map(data => data.sku) } }, { slug: { in: prepared.map(data => data.slug) } }] }, select: { sku: true, slug: true } }) : []
  const skus = new Set(existing.map(product => product.sku)), slugs = new Set(existing.map(product => product.slug))
  for (const row of rows) if (row.data && (skus.has(row.data.sku) || slugs.has(row.data.slug))) row.error = 'SKU ou slug já cadastrado na loja. Nenhum produto existente será alterado.'
  const errors = rows.filter(row => row.error).length
  const token = createHash('sha256').update(csv.replace(/^\uFEFF/, '')).update(JSON.stringify(rows)).digest('hex')
  return { rows, errors, total: rows.length, token }
}
export const productImportRouter = Router()
productImportRouter.use(requireAdmin, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() }, express.text({ type: 'text/csv', limit: '1mb' }))
productImportRouter.post(['/preview', '/confirm'], async (req, res) => {
  if (typeof req.body !== 'string') return res.status(400).json({ error: 'Envie o arquivo como CSV UTF-8.' })
  try {
    if (req.path === '/preview') return res.json(await previewProductImport(req.body, prisma))
    const result = await prisma.$transaction(async tx => {
      const preview = await previewProductImport(req.body, tx)
      if (preview.errors) return { ...preview, imported: 0 }
      if (req.headers['x-import-preview'] !== preview.token) throw new Error('O arquivo ou o catálogo mudou. Faça a prévia novamente antes de importar.')
      // Sem skipDuplicates: qualquer conflito aborta todo o lote, inclusive em concorrência.
      const created = await tx.product.createMany({ data: preview.rows.map(row => row.data!) })
      return { imported: created.count }
    }, { isolationLevel: 'Serializable', timeout: 15000 })
    return res.status(result.imported ? 201 : 400).json(result)
  } catch (error) {
    const code = (error as { code?: string }).code
    return res.status(code === 'P2002' || code === 'P2034' ? 409 : 400).json({ error: code === 'P2002' || code === 'P2034' ? 'O catálogo mudou durante a importação. Nada foi importado. Faça a prévia novamente.' : error instanceof Error ? error.message : 'Não foi possível importar o CSV.' })
  }
})
productImportRouter.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Arquivo inválido. Use CSV UTF-8 de até 1 MB.' }))

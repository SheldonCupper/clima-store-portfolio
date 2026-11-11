import { Router } from 'express'
import type { Prisma } from '../../generated/prisma/client'
import prisma from './prisma'
import { requireAdmin } from './auth'
export const MAX_BULK_PRODUCTS = 5000
export function parseProductBulk(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Selecione os produtos e a ação desejada.')
  const { action, products, confirmation } = input as Record<string, unknown>
  if (!['activate', 'deactivate', 'delete'].includes(String(action))) throw new Error('Ação inválida.')
  if (!Array.isArray(products) || !products.length || products.length > MAX_BULK_PRODUCTS) throw new Error(`Selecione de 1 a ${MAX_BULK_PRODUCTS} produtos por operação.`)
  const seen = new Set<number>()
  const snapshots = products.map(value => {
    if (!value || typeof value !== 'object' || !Number.isInteger(value.id) || value.id <= 0 || value.id > 2147483647 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) throw new Error('Seleção desatualizada ou inválida. Atualize a lista e selecione novamente.')
    if (seen.has(value.id)) throw new Error('Há produtos repetidos na seleção.')
    seen.add(value.id)
    return { id: value.id as number, updatedAt: value.updatedAt as string }
  })
  if (action === 'delete' && confirmation !== 'EXCLUIR') throw new Error('Digite EXCLUIR para confirmar a exclusão permanente.')
  return { action: action as 'activate' | 'deactivate' | 'delete', products: snapshots }
}
export class ProductSelectionChanged extends Error {}
export async function applyProductBulk(tx: Prisma.TransactionClient, input: ReturnType<typeof parseProductBulk>) {
  const ids = input.products.map(product => product.id)
  const versions = new Map(input.products.map(product => [product.id, product.updatedAt]))
  const products = await tx.product.findMany({ where: { id: { in: ids }, isService: false }, select: { id: true, name: true, updatedAt: true, _count: { select: { orderItems: true } } } })
  if (products.length !== ids.length || products.some(product => versions.get(product.id) !== product.updatedAt.toISOString())) throw new ProductSelectionChanged('Um produto mudou ou foi excluído após a seleção. Atualize a lista e selecione novamente. Nenhuma alteração foi feita.')
  if (input.action !== 'delete') {
    const active = input.action === 'activate'
    const result = await tx.product.updateMany({ where: { id: { in: ids }, active: !active }, data: { active } })
    return { affected: result.count, protectedCount: 0, protectedProducts: [] }
  }
  // Preserva o produto referenciado por qualquer pedido, inclusive cancelado.
  const protectedProducts = products.filter(product => product._count.orderItems > 0)
  const deletable = products.filter(product => product._count.orderItems === 0).map(product => product.id)
  const result = deletable.length ? await tx.product.deleteMany({ where: { id: { in: deletable }, orderItems: { none: {} } } }) : { count: 0 }
  if (result.count !== deletable.length) throw new ProductSelectionChanged('O histórico de pedidos mudou durante a operação. Atualize a lista. Nenhuma alteração foi feita.')
  return { affected: result.count, protectedCount: protectedProducts.length, protectedProducts: protectedProducts.slice(0, 20).map(product => ({ id: product.id, name: product.name })) }
}
export const productBulkRouter = Router()
productBulkRouter.post('/', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  let input
  try { input = parseProductBulk(req.body) } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Seleção inválida.' }) }
  try {
    const result = await prisma.$transaction(tx => applyProductBulk(tx, input), { isolationLevel: 'Serializable', timeout: 15000 })
    return res.json({ action: input.action, selected: input.products.length, ...result })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (error instanceof ProductSelectionChanged || ['P2003', 'P2034', 'P2025'].includes(code || '')) return res.status(409).json({ error: error instanceof ProductSelectionChanged ? error.message : 'O catálogo ou o histórico de pedidos mudou. Nenhuma alteração foi feita. Atualize a lista e tente novamente.' })
    return res.status(500).json({ error: 'Não foi possível concluir a operação. Confira o catálogo antes de tentar novamente.' })
  }
})

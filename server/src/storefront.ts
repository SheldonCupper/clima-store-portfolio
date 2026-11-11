import { Router } from 'express'
import type { Prisma } from '../../generated/prisma/client'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { defaultStorefrontSettings, parseStorefrontSettings } from '../../shared/storefront'

async function settings() {
  const saved = await prisma.storefrontSetting.findUnique({ where: { id: 'main' } })
  return saved ? parseStorefrontSettings(saved.content) : defaultStorefrontSettings
}

export const storefrontRouter = Router()
storefrontRouter.get('/storefront', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const [content, categories, sales] = await Promise.all([
      settings(),
      prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, _count: { select: { products: { where: { active: true, isService: false } } } } } }),
      prisma.orderItem.groupBy({ by: ['productId'], where: { order: { paymentStatus: 'APPROVED', status: { notIn: ['CANCELED'] } }, product: { active: true, isService: false } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 12 }),
    ])
    return res.json({ settings: content, categories, bestSellerIds: sales.map(item => item.productId) })
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a vitrine da loja.' })
  }
})

storefrontRouter.get('/admin/storefront', requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { return res.json({ settings: await settings() }) }
  catch { return res.status(500).json({ error: 'Não foi possível carregar a personalização.' }) }
})

storefrontRouter.put('/admin/storefront', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  let content
  try { content = parseStorefrontSettings(req.body?.header === undefined ? { ...req.body, header: (await settings()).header } : req.body) }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Personalização inválida.' }) }
  try {
    const data = content as unknown as Prisma.InputJsonValue
    await prisma.storefrontSetting.upsert({ where: { id: 'main' }, create: { id: 'main', content: data }, update: { content: data } })
    return res.json({ settings: content, message: 'Sua loja foi atualizada.' })
  } catch { return res.status(500).json({ error: 'Não foi possível salvar a personalização.' }) }
})

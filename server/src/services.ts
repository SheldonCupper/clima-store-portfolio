import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { requireAdmin } from './auth'
import { parseServiceInput, SERVICE_QUANTITY_LIMIT } from '../../shared/services'
export const servicesRouter = Router()
servicesRouter.use(['/services', '/admin/services'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
const include = { category: true }
servicesRouter.get('/services', async (_req, res) => {
  try { return res.json(await prisma.product.findMany({ where: { isService: true, active: true }, include, orderBy: { createdAt: 'desc' } })) }
  catch { return res.status(503).json({ error: 'Não foi possível carregar os serviços. Tente novamente.' }) }
})
servicesRouter.get('/admin/services', requireAdmin, async (_req, res) => {
  try { return res.json(await prisma.product.findMany({ where: { isService: true }, include, orderBy: { createdAt: 'desc' } })) }
  catch { return res.status(503).json({ error: 'Não foi possível carregar seus serviços.' }) }
})
servicesRouter.post('/admin/services', requireAdmin, async (req, res) => {
  try {
    const data = parseServiceInput(req.body)
    const service = await prisma.$transaction(async tx => {
      const category = await tx.category.upsert({ where: { slug: 'clima-servicos-interno' }, create: { slug: 'clima-servicos-interno', name: 'Serviços Clima', active: false }, update: {} })
      return tx.product.create({ data: { ...data, isService: true, stock: SERVICE_QUANTITY_LIMIT, slug: `servico-${randomUUID()}`, sku: `SERV-${randomUUID()}`, categoryId: category.id }, include })
    })
    return res.status(201).json(service)
  } catch (error) { return res.status(400).json({ error: error instanceof Error && !('code' in error) ? error.message : 'Não foi possível criar o serviço.' }) }
})
servicesRouter.put('/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id), data = parseServiceInput(req.body)
    if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body.updatedAt !== 'string' || !Number.isFinite(Date.parse(req.body.updatedAt))) throw new Error('Atualize a lista e abra o serviço novamente.')
    const result = await prisma.product.updateMany({ where: { id, isService: true, updatedAt: new Date(req.body.updatedAt) }, data })
    if (!result.count) return res.status(409).json({ error: 'O serviço mudou em outra solicitação. Atualize a lista antes de editar novamente.' })
    return res.json(await prisma.product.findUniqueOrThrow({ where: { id }, include }))
  } catch (error) { return res.status(400).json({ error: error instanceof Error && !('code' in error) ? error.message : 'Não foi possível salvar o serviço.' }) }
})

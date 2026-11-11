// Reorganização pontual e reversível. Por padrão, somente mostra as alterações.
// Executar com tsx a partir da raiz, usando o .env existente do backend.
import { writeFile } from 'node:fs/promises'
import prisma from '../server/src/prisma'
import { parseStorefrontSettings } from '../shared/storefront'
import type { Prisma } from '../generated/prisma/client'

const apply = process.argv.includes('--apply')
const backup = process.argv.find(arg => arg.startsWith('--backup='))?.slice(9)
try {
  const products = await prisma.product.findMany({ include: { category: true } })
  const content = await prisma.storefrontSetting.findUnique({ where: { id: 'main' } })
  const demos = products.filter(product => /^(teste(?: produto)?|testado)$/i.test(product.name.trim()))
  const recategorize = products.filter(product => /^(Bomba de Vácuo Profissional 7 CFM|Manifold Digital para Refrigeração)$/i.test(product.name) && /^teste$/i.test(product.category.name))
  const photos = products.filter(product => [product.imageUrl, ...product.imageUrls].some(url => url && /^https:\/\/images\.unsplash\.com\//.test(url)))
  const promotion = content ? parseStorefrontSettings(content.content) : null
  const pausePromotion = Boolean(promotion?.promotion.active && (promotion.promotion.id === 'primeira-campanha' || promotion.promotion.imageUrl === '/uploads/a3234283-479e-4098-a2a6-cfcad63be959.jpeg'))
  console.log(JSON.stringify({ apply, inactivateDemoIds: demos.filter(product => product.active).map(product => product.id), moveToToolsIds: recategorize.map(product => product.id), replaceIllustrativePhotoIds: photos.map(product => product.id), pauseDefaultCampaign: pausePromotion }))
  if (apply) {
    if (!backup) throw new Error('Informe --backup=/caminho/privado/catalogo-antes.json')
    await writeFile(backup, JSON.stringify({ products, storefront: content }, null, 2), { mode: 0o600, flag: 'wx' })
    await prisma.$transaction(async tx => {
      for (const product of products) {
        const data: Prisma.ProductUncheckedUpdateManyInput = {}
        if (product.active && demos.some(item => item.id === product.id)) data.active = false
        if (photos.some(item => item.id === product.id)) {
          const real = [...new Set([product.imageUrl, ...product.imageUrls].filter((url): url is string => Boolean(url) && !/^https:\/\/images\.unsplash\.com\//.test(url!)))]
          data.imageUrls = real; data.imageUrl = real[0] || null
        }
        if (recategorize.some(item => item.id === product.id)) {
          const category = await tx.category.upsert({ where: { slug: 'ferramentas-e-instrumentos' }, create: { name: 'Ferramentas e instrumentos', slug: 'ferramentas-e-instrumentos', active: true }, update: {} })
          if (!category.active) throw new Error('A categoria de ferramentas está inativa; revise antes de publicar.')
          data.categoryId = category.id
        }
        if (Object.keys(data).length) {
          const result = await tx.product.updateMany({ where: { id: product.id, updatedAt: product.updatedAt }, data })
          if (result.count !== 1) throw new Error('Cadastro alterado durante a revisão. Nenhuma alteração desta transação foi aplicada.')
        }
      }
      if (content && promotion && pausePromotion) {
        promotion.promotion.active = false
        const result = await tx.storefrontSetting.updateMany({ where: { id: 'main', updatedAt: content.updatedAt }, data: { content: promotion as unknown as Prisma.InputJsonValue } })
        if (result.count !== 1) throw new Error('Personalização alterada durante a revisão.')
      }
    })
    console.log('Catálogo preparado. Preços, estoques, medidas, pedidos e arquivos de fotos foram preservados. Backup privado gravado.')
  }
} finally { await prisma.$disconnect() }

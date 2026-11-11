import { salesReportsRouter } from './salesReports'
import { productReviewsRouter } from './productReviews'
import { servicesRouter } from './services'
import { parseServiceDetails, serviceAreaMatches, SERVICE_QUANTITY_LIMIT } from '../../shared/services'
import { orderRefundsRouter } from './orderRefunds'
import { productBulkRouter } from './productBulk'
import { productImportRouter } from './productImport'
import { googleAuthRouter } from './googleAuth'
import { couponsRouter, claimCoupon } from './coupons'
import { moneyCents } from '../../shared/coupons'
import { parseProductAttributes } from '../../shared/productAttributes'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import prisma from './prisma'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import { checkoutCustomerErrors, normalizeCheckoutCustomer } from '../../shared/checkoutCustomer'

import { requireAdmin } from './auth'
import { clearAdminSession, signInAdmin } from './adminAuth'
import { paymentsRouter } from './payments'
import { authAttemptLimit, customerAuthRouter, readCustomerSession } from './customerAuth'
import { storefrontRouter } from './storefront'
import { productLookupRouter } from './productLookup'
import { parseProductGtin } from '../../shared/productMedia'
import { productMediaUpdate } from './productMedia'
import { changeOrderStatus, OrderStatusError } from './orderStatus'
import type { OrderStatus } from '../../generated/prisma/client'
import { getMelhorEnvioQuotes, validateShippingItems, validShippingMeasurements } from './shipping'
import { requireOrderAccess } from './orderAccess'


dotenv.config()

const uploadsDirectory = process.env.UPLOADS_DIRECTORY
  ? resolve(process.env.UPLOADS_DIRECTORY)
  : resolve(import.meta.dirname, '../uploads')

mkdirSync(uploadsDirectory, {
  recursive: true,
})

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDirectory)
  },

  filename: (_req, file, callback) => {
    const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } as Record<string, string>)[file.mimetype] || '.img'
    callback(null, `${randomUUID()}${extension}`)
  },
})

const upload = multer({
  storage: uploadStorage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.mimetype)) {
      callback(
        new Error(
          'Formato inválido. Envie JPG, PNG ou WEBP.'
        )
      )
      return
    }

    callback(null, true)
  },
})

export const app = express()

// Apenas o proxy local pode informar o IP de origem em produção.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 'loopback')

app.use(
  cors({
    origin: process.env.APP_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:5173',
    credentials: true,
  })
)

app.use(cookieParser())
app.use('/api/admin/products/bulk', requireAdmin, express.json({ limit: '512kb' }), productBulkRouter)
app.use(express.json())
app.use('/api/admin/products/import', productImportRouter)
app.use('/api/customer', customerAuthRouter)
app.use('/api/customer/google', googleAuthRouter)
app.use('/api', paymentsRouter)
app.use('/api', orderRefundsRouter)
app.use('/api', storefrontRouter)
app.use('/api', productLookupRouter)
app.use('/api', couponsRouter)
app.use('/api', servicesRouter)
app.use('/api', salesReportsRouter)
app.use('/api', productReviewsRouter)
app.get('/api/admin/product-features', requireAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  return res.json({ gallery: true, technicalAttributes: true })
})
app.use(['/api/orders', '/api/admin/orders'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use(
  '/uploads',
  express.static(uploadsDirectory)
)

app.post(
  '/api/admin/upload',
  requireAdmin,
  (req, res) => {
    upload.single('image')(req, res, (error) => {
      if (error) {
        const message =
          error instanceof multer.MulterError &&
          error.code === 'LIMIT_FILE_SIZE'
            ? 'A imagem deve ter no máximo 5 MB.'
            : error instanceof Error
              ? error.message
              : 'Erro ao enviar imagem'

        return res.status(400).json({
          error: message,
        })
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Selecione uma imagem.',
        })
      }

      const imageUrl = `/uploads/${req.file.filename}`

      return res.status(201).json({
        success: true,
        imageUrl,
      })
    })
  }
)

app.get('/api/cep/:cep', async (req, res) => {
  try {
    const cep = String(req.params.cep || '').replace(/\D/g, '')

    if (cep.length !== 8) {
      return res.status(400).json({
        error: 'CEP inválido',
      })
    }

    const response = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`
    )

    if (!response.ok) {
      return res.status(502).json({
        error: 'Não foi possível consultar o CEP',
      })
    }

    const data = await response.json()

    if (data.erro) {
      return res.status(404).json({
        error: 'CEP não encontrado',
      })
    }

    return res.json({
      cep: data.cep,
      street: data.logradouro || '',
      district: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
      complement: data.complemento || '',
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao consultar CEP',
    })
  }
})

app.post('/api/shipping/calculate', async (req, res) => {
  try {
    const {
      cep,
      paymentMethod,
      items,
    } = req.body

    if (
      paymentMethod !== 'PIX' &&
      paymentMethod !== 'CREDIT_CARD'
    ) {
      return res.status(400).json({
        error: 'Forma de pagamento inválida',
      })
    }

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: 'O carrinho está vazio',
      })
    }

    const shippingItems = validateShippingItems(items)
    const products = await prisma.product.findMany({
      where: {
        id: { in: shippingItems.map((item) => item.productId) },
        active: true,
      },
    })

    if (products.length !== shippingItems.length) throw new Error('Há itens indisponíveis no carrinho.')
    const physicalItems = shippingItems.filter(item => !products.find(product => product.id === item.productId)?.isService)
    if (!physicalItems.length) return res.json({ quotes: [], requiresShipping: false })
    const quotes =
      await getMelhorEnvioQuotes({
        destinationCep:
          String(cep || ''),
        paymentMethod,
        items: physicalItems,
        products,
      })

    return res.json({
      quotes,
    })
  } catch (error) {
    console.error(error)

    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao calcular frete'

    return res.status(400).json({
      error: message,
    })
  }
})

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API do e-commerce funcionando',
  })
})

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    res.json(categories)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Erro ao buscar categorias',
    })
  }
})

// O painel precisa manter acesso aos cadastros inativos e ao histórico.
app.get('/api/admin/products', requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    return res.json(await prisma.product.findMany({ where: { isService: false }, include: { category: true }, orderBy: { createdAt: 'desc' } }))
  } catch { return res.status(500).json({ error: 'Não foi possível carregar os produtos do painel.' }) }
})

app.get('/api/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        active: true, isService: false,
      },
      include: {
        category: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(products)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Erro ao buscar produtos',
    })
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const account = await readCustomerSession(req)
    if (!account) return res.status(401).json({ error: 'Entre ou crie uma conta para finalizar a compra.', requiresLogin: true })
    const {
      customer,
      address,
      paymentMethod,
      shippingOption,
      items,
    } = req.body

    const customerErrors = checkoutCustomerErrors(customer)
    if (Object.keys(customerErrors).length > 0) {
      return res.status(400).json({
        error: Object.values(customerErrors)[0],
        fieldErrors: customerErrors,
      })
    }
    const validatedCustomer = normalizeCheckoutCustomer(customer)
    if (account && account.email !== validatedCustomer.email) {
      return res.status(400).json({ error: 'Use o e-mail da conta conectada para finalizar o pedido.' })
    }

    if (
      !address?.cep ||
      !address?.street ||
      !address?.number ||
      !address?.district ||
      !address?.city ||
      !address?.state
    ) {
      return res.status(400).json({
        error: 'Endereço incompleto',
      })
    }

    if (
      paymentMethod !== 'PIX' &&
      paymentMethod !== 'CREDIT_CARD'
    ) {
      return res.status(400).json({
        error: 'Forma de pagamento inválida',
      })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'O pedido não possui produtos',
      })
    }

    const shippingItems = validateShippingItems(items)
    const productIds = shippingItems.map((item) => item.productId)
    const quotedProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
    })

    if (quotedProducts.length !== productIds.length) throw new Error('Há itens indisponíveis no carrinho.')
    const physicalItems = shippingItems.filter(item => !quotedProducts.find(product => product.id === item.productId)?.isService)
    if (physicalItems.length && (!shippingOption || typeof shippingOption.serviceId !== 'string' || !/^\d+$/.test(shippingOption.serviceId))) throw new Error('Selecione uma opção de frete')
    const serviceProducts = quotedProducts.filter(product => product.isService)
    if (serviceProducts.length && req.body.acceptServiceTerms !== true) throw new Error('Confirme as condições e o agendamento dos serviços.')
    for (const service of serviceProducts) {
      if (!serviceAreaMatches(parseServiceDetails(service.serviceDetails), address)) throw new Error(`O serviço "${service.name}" não atende esta cidade/estado. Confira a área atendida antes de pagar.`)
    }
    const quotes = physicalItems.length ? await getMelhorEnvioQuotes({ destinationCep: String(address.cep), paymentMethod, items: physicalItems, products: quotedProducts }) : []
    const selectedQuote = physicalItems.length ? quotes.find(quote => quote.id === shippingOption.serviceId) : null
    if (physicalItems.length && !selectedQuote) throw new Error('A opção de frete não está mais disponível. Calcule novamente.')

    const result = await prisma.$transaction(async (tx) => {
      // Serializa pedidos da mesma conta para conferir a primeira compra.
      await tx.$queryRaw`SELECT "id" FROM "CustomerAccount" WHERE "id" = ${account.id} FOR UPDATE`
      if (!account.phone || !account.cpf) {
        await tx.customerAccount.update({ where: { id: account.id }, data: { name: validatedCustomer.name, phone: validatedCustomer.phone, cpf: validatedCustomer.cpf } })
      }
      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
          active: true,
        },
      })

      if (products.length !== productIds.length) {
        throw new Error(
          'Um ou mais produtos não foram encontrados'
        )
      }

      let subtotalCents = 0

      const validatedItems = shippingItems.map(
        (item: {
          productId: number
          quantity: number
        }) => {
          const product = products.find(
            (p) => p.id === item.productId
          )

          if (!product) {
            throw new Error(
              'Produto não encontrado'
            )
          }

          if (
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0
          ) {
            throw new Error(
              `Quantidade inválida para ${product.name}`
            )
          }

          if ((!product.isService && product.stock < item.quantity) || (product.isService && item.quantity > SERVICE_QUANTITY_LIMIT)) {
            throw new Error(
              `Estoque insuficiente para ${product.name}`
            )
          }

          const quotedProduct = quotedProducts.find((p) => p.id === product.id)!
          if (
            product.isService !== quotedProduct.isService ||
            (product.isService && JSON.stringify(product.serviceDetails) !== JSON.stringify(quotedProduct.serviceDetails)) ||
            String(product.price) !== String(quotedProduct.price) ||
            String(product.pixPrice) !== String(quotedProduct.pixPrice) ||
            product.weightKg !== quotedProduct.weightKg ||
            product.heightCm !== quotedProduct.heightCm ||
            product.widthCm !== quotedProduct.widthCm ||
            product.lengthCm !== quotedProduct.lengthCm
          ) {
            throw new Error('Os produtos foram atualizados durante a cotação. Calcule o frete novamente.')
          }

          const unitCents = moneyCents(String(paymentMethod === 'PIX' && product.pixPrice != null ? product.pixPrice : product.price))
          const itemCents = unitCents * item.quantity
          subtotalCents += itemCents
          if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 9999999999) throw new Error('O valor do carrinho excede o limite permitido.')
          const unitPrice = unitCents / 100
          const total = itemCents / 100

          return {
            product,
            quantity: item.quantity,
            unitPrice,
            total,
          }
        }
      )

      const subtotal = subtotalCents / 100

      let customerRecord =
        await tx.customer.findUnique({
          where: {
            email: validatedCustomer.email,
          },
        })

      if (!customerRecord) {
        customerRecord =
          await tx.customer.create({
            data: {
              name: validatedCustomer.name,
              email: validatedCustomer.email,
              phone: validatedCustomer.phone,
              cpf: validatedCustomer.cpf,
            },
          })
      } else {
        customerRecord =
          await tx.customer.update({
            where: {
              id: customerRecord.id,
            },
            data: {
              name: validatedCustomer.name,
              phone: validatedCustomer.phone,
              cpf: validatedCustomer.cpf,
            },
          })
      }

      const addressRecord =
        await tx.address.create({
          data: {
            customerId: customerRecord.id,
            cep: address.cep,
            street: address.street,
            number: address.number,
            district: address.district,
            city: address.city,
            state: address.state,
            complement:
              address.complement || null,
          },
        })

      const shipping =
        selectedQuote?.price ?? 0

      const coupon = await claimCoupon(tx, req.body.couponCode, subtotalCents, { id: account.id, email: account.email, cpf: validatedCustomer.cpf })
      const discount = (coupon?.discountCents ?? 0) / 100
      const total = (subtotalCents + moneyCents(String(shipping)) - (coupon?.discountCents ?? 0)) / 100
      if (total < 1) throw new Error('O total após o desconto deve ser de pelo menos R$ 1,00. Remova o cupom ou ajuste o carrinho.')

      const order = await tx.order.create({
        data: {
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          accountId: account.id,
          customerId: customerRecord.id,
          addressId: addressRecord.id,
          paymentMethod,
          subtotal,
          shipping,
          discount,
          total,
          shippingServiceId:
            selectedQuote?.id ?? null,
          shippingServiceName:
            selectedQuote?.name ?? null,
          shippingCompany:
            selectedQuote?.company ?? null,
          shippingDeliveryTime:
            selectedQuote?.deliveryTime ?? null,
        },
      })

      for (const item of validatedItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.product.id,
            productName: item.product.name,
            isService: item.product.isService,
            serviceDetails: item.product.isService ? parseServiceDetails(item.product.serviceDetails) : {},
            sku: item.product.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: item.total,
          },
        })

        const reserved = await tx.product.updateMany({
          where: {
            id: item.product.id,
            active: true,
            ...(item.product.isService ? {} : { stock: { gte: item.quantity } }),
            updatedAt: item.product.updatedAt,
          },
          data: item.product.isService ? { updatedAt: new Date() } : { stock: { decrement: item.quantity } },
        })

        if (reserved.count !== 1) {
          throw new Error(`O produto "${item.product.name}" foi atualizado. Confira o carrinho e calcule o frete novamente.`)
        }
      }

      return { order }
    })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(201).json({
      success: true,
      orderId: result.order.id,
      message: 'Pedido criado com sucesso',
    })
  } catch (error) {
    console.error(error)

    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao criar pedido'

    return res.status(400).json({
      error: message,
    })
  }
})


app.get('/api/orders/:id', requireOrderAccess, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentReviewRequired: true,
        subtotal: true,
        shipping: true,
        shippingServiceName: true,
        shippingCompany: true,
        shippingDeliveryTime: true,
        discount: true,
        couponCode: true,
        total: true,
        createdAt: true,
        address: {
          select: {
            cep: true, street: true, number: true, district: true,
            city: true, state: true, complement: true,
          },
        },
        items: {
          select: {
            id: true, productName: true,
            isService: true, serviceDetails: true, sku: true, unitPrice: true,
            quantity: true, total: true,
          },
        },
      },
    })

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' })
    }
    return res.json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao buscar pedido' })
  }
})

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const orderId = Number(req.params.id)

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        error: 'Número do pedido inválido',
      })
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        customer: true,
        address: true,
        items: true,
        refundRequest: { select: { status: true, amount: true, environment: true, createdAt: true, confirmedAt: true } },
        paymentCheckouts: { select: { environment: true, preferenceId: true, expiresAt: true, lastSyncedAt: true } },
      },
    })

    if (!order) {
      return res.status(404).json({
        error: 'Pedido não encontrado',
      })
    }

    return res.json(order)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao buscar pedido',
    })
  }
})


app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      sku,
      price,
      pixPrice,
      stock,
      active,
      imageUrl,
      imageUrls,
      gtin,
      categoryId,
      weightKg,
      heightCm,
      widthCm,
      lengthCm,
    } = req.body
    let technicalAttributes
    try { technicalAttributes = parseProductAttributes(req.body.technicalAttributes) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Ficha técnica inválida.' }) }
    let productGtin
    try { productGtin = parseProductGtin(gtin) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Código de barras inválido.' }) }

    if (
      !name ||
      !slug ||
      !sku ||
      !categoryId ||
      !validShippingMeasurements({ weightKg, heightCm, widthCm, lengthCm })
    ) {
      return res.status(400).json({
        error:
          'Informe nome, slug, SKU, categoria, peso positivo em kg e dimensões inteiras positivas em cm',
      })
    }

    if (Number(price) <= 0) {
      return res.status(400).json({
        error: 'Preço inválido',
      })
    }

    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({
        error: 'Estoque inválido',
      })
    }

    const category = await prisma.category.findUnique({
      where: {
        id: Number(categoryId),
      },
    })

    if (!category) {
      return res.status(400).json({
        error: 'Categoria não encontrada',
      })
    }

    const existingSku = await prisma.product.findUnique({
      where: {
        sku,
      },
    })

    if (existingSku) {
      return res.status(409).json({
        error: 'Já existe um produto com esse SKU',
      })
    }

    const existingSlug = await prisma.product.findUnique({
      where: {
        slug,
      },
    })

    if (existingSlug) {
      return res.status(409).json({
        error: 'Já existe um produto com esse slug',
      })
    }

    let media
    try { media = productMediaUpdate({ imageUrl, imageUrls }) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Fotos inválidas.' }) }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description: description || null,
        sku,
        price: Number(price),
        pixPrice:
          pixPrice !== '' && pixPrice != null
            ? Number(pixPrice)
            : null,
        stock: Number(stock),
        active: active ?? true,
        ...media,
        gtin: productGtin,
        technicalAttributes,
        categoryId: Number(categoryId),
        weightKg: Number(weightKg),
        heightCm: Number(heightCm),
        widthCm: Number(widthCm),
        lengthCm: Number(lengthCm),
      },
      include: {
        category: true,
      },
    })

    return res.status(201).json(product)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao cadastrar produto',
    })
  }
})


app.get('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID do produto inválido',
      })
    }

    const product = await prisma.product.findUnique({
      where: { id, isService: false },
      include: {
        category: true,
      },
    })

    if (!product) {
      return res.status(404).json({
        error: 'Produto não encontrado',
      })
    }

    return res.json(product)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao buscar produto',
    })
  }
})

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID do produto inválido',
      })
    }

    const {
      name,
      slug,
      description,
      sku,
      price,
      pixPrice,
      stock,
      active,
      imageUrl,
      imageUrls,
      gtin,
      categoryId,
      weightKg,
      heightCm,
      widthCm,
      lengthCm,
    } = req.body
    let technicalAttributes
    try { technicalAttributes = parseProductAttributes(req.body.technicalAttributes) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Ficha técnica inválida.' }) }
    let productGtin
    try { productGtin = parseProductGtin(gtin) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Código de barras inválido.' }) }

    if (
      !name ||
      !slug ||
      !sku ||
      !categoryId ||
      !validShippingMeasurements({ weightKg, heightCm, widthCm, lengthCm })
    ) {
      return res.status(400).json({
        error:
          'Informe nome, slug, SKU, categoria, peso positivo em kg e dimensões inteiras positivas em cm',
      })
    }

    if (Number(price) <= 0) {
      return res.status(400).json({
        error: 'Preço inválido',
      })
    }

    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({
        error: 'Estoque inválido',
      })
    }

    const currentProduct = await prisma.product.findUnique({
      where: { id, isService: false },
    })

    if (!currentProduct) {
      return res.status(404).json({
        error: 'Produto não encontrado',
      })
    }

    const category = await prisma.category.findUnique({
      where: {
        id: Number(categoryId),
      },
    })

    if (!category) {
      return res.status(400).json({
        error: 'Categoria não encontrada',
      })
    }

    const existingSku = await prisma.product.findUnique({
      where: { sku },
    })

    if (existingSku && existingSku.id !== id) {
      return res.status(409).json({
        error: 'Já existe outro produto com esse SKU',
      })
    }

    const existingSlug = await prisma.product.findUnique({
      where: { slug },
    })

    if (existingSlug && existingSlug.id !== id) {
      return res.status(409).json({
        error: 'Já existe outro produto com esse slug',
      })
    }

    let media
    try { media = productMediaUpdate({ imageUrl, imageUrls }, currentProduct) }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Fotos inválidas.' }) }

    const product = await prisma.product.update({
      where: { id, isService: false },
      data: {
        name,
        slug,
        description: description || null,
        sku,
        price: Number(price),
        pixPrice:
          pixPrice !== '' && pixPrice != null
            ? Number(pixPrice)
            : null,
        stock: Number(stock),
        active: active ?? true,
        ...media,
        gtin: productGtin,
        technicalAttributes,
        categoryId: Number(categoryId),
        weightKg: Number(weightKg),
        heightCm: Number(heightCm),
        widthCm: Number(widthCm),
        lengthCm: Number(lengthCm),
      },
      include: {
        category: true,
      },
    })

    return res.json(product)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao editar produto',
    })
  }
})


app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID do produto inválido',
      })
    }

    const product = await prisma.product.findUnique({
      where: { id, isService: false },
    })

    if (!product) {
      return res.status(404).json({
        error: 'Produto não encontrado',
      })
    }

    const updatedProduct = await prisma.product.update({
      where: { id, isService: false },
      data: {
        active: false,
      },
    })

    return res.json({
      success: true,
      message: 'Produto inativado com sucesso',
      product: updatedProduct,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao inativar produto',
    })
  }
})

app.get('/api/orders', requireAdmin, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        refundRequest: { select: { status: true, amount: true, environment: true, createdAt: true, confirmedAt: true } },
        customer: true,
        items: true,
      },
    })

    return res.json(orders)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao carregar pedidos',
    })
  }
})


app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { status } = req.body

    const validStatuses = [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELED',
    ]

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID do pedido inválido',
      })
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Status inválido',
      })
    }

    const updatedOrder = await changeOrderStatus(id, status as OrderStatus)

    return res.json(updatedOrder)
  } catch (error) {
    if (error instanceof OrderStatusError) return res.status(error.statusCode).json({ error: error.message })
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao atualizar status do pedido',
    })
  }
})


app.post('/api/admin/login', authAttemptLimit(), signInAdmin)

app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  clearAdminSession(res)
  return res.json({ success: true })
})

app.get('/api/admin/me', requireAdmin, (_req, res) => {
  return res.json({
    authenticated: true,
    email: process.env.ADMIN_EMAIL,
  })
})

app.get('/api/admin/categories', requireAdmin, async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { slug: { not: 'clima-servicos-interno' } },
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    })

    return res.json(categories)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao carregar categorias',
    })
  }
})

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  try {
    const { name, slug } = req.body

    if (!name?.trim() || !slug?.trim()) {
      return res.status(400).json({
        error: 'Nome e slug são obrigatórios',
      })
    }

    const existing = await prisma.category.findUnique({
      where: {
        slug: slug.trim(),
      },
    })

    if (existing) {
      return res.status(409).json({
        error: 'Já existe uma categoria com esse slug',
      })
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug: slug.trim(),
        active: true,
      },
    })

    return res.status(201).json(category)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao cadastrar categoria',
    })
  }
})

app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, slug, active } = req.body

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID inválido',
      })
    }

    if (!name?.trim() || !slug?.trim()) {
      return res.status(400).json({
        error: 'Nome e slug são obrigatórios',
      })
    }

    const current = await prisma.category.findUnique({
      where: { id },
    })

    if (!current) {
      return res.status(404).json({
        error: 'Categoria não encontrada',
      })
    }

    const categoryWithSlug = await prisma.category.findUnique({
      where: {
        slug: slug.trim(),
      },
    })

    if (categoryWithSlug && categoryWithSlug.id !== id) {
      return res.status(409).json({
        error: 'Já existe outra categoria com esse slug',
      })
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: name.trim(),
        slug: slug.trim(),
        active: active ?? true,
      },
    })

    return res.json(category)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao editar categoria',
    })
  }
})

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID inválido',
      })
    }

    const category = await prisma.category.findUnique({
      where: { id },
    })

    if (!category) {
      return res.status(404).json({
        error: 'Categoria não encontrada',
      })
    }

    await prisma.category.update({
      where: { id },
      data: {
        active: false,
      },
    })

    return res.json({
      success: true,
      message: 'Categoria inativada',
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao inativar categoria',
    })
  }
})

app.get('/api/admin/customers', requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const [buyers, accounts] = await Promise.all([
      prisma.customer.findMany({ include: { _count: { select: { orders: true } } } }),
      prisma.customerAccount.findMany({ select: { id: true, name: true, email: true, phone: true, cpf: true, createdAt: true, _count: { select: { orders: true } } } }),
    ])
    const byEmail = new Map(buyers.map(buyer => [buyer.email.toLowerCase(), buyer]))
    const customers = accounts.map(account => {
      const buyer = byEmail.get(account.email.toLowerCase())
      byEmail.delete(account.email.toLowerCase())
      return { id: `account-${account.id}`, name: account.name, email: account.email, phone: account.phone || buyer?.phone || '', cpf: account.cpf || buyer?.cpf || '', createdAt: account.createdAt, _count: { orders: Math.max(account._count.orders, buyer?._count.orders || 0) } }
    })
    customers.push(...[...byEmail.values()].map(buyer => ({ id: `customer-${buyer.id}`, name: buyer.name, email: buyer.email, phone: buyer.phone, cpf: buyer.cpf, createdAt: buyer.createdAt, _count: buyer._count })))
    customers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return res.json(customers)
  } catch { return res.status(500).json({ error: 'Erro ao carregar clientes' }) }
})


app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    const [
      totalProducts,
      totalOrders,
      totalCustomers,
      pendingOrders,
      lowStockProducts,
      salesTotal,
      recentOrders,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          active: true, isService: false,
        },
      }),

      prisma.order.count(),

      prisma.customer.count(),

      prisma.order.count({
        where: {
          status: 'PENDING',
        },
      }),

      prisma.product.count({
        where: {
          active: true, isService: false,
          stock: {
            lte: 5,
          },
        },
      }),

      prisma.order.aggregate({
        where: {
          status: {
            not: 'CANCELED',
          },
        },
        _sum: {
          total: true,
        },
      }),

      prisma.order.findMany({
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          customer: true,
        },
      }),
    ])

    return res.json({
      totalProducts,
      totalOrders,
      totalCustomers,
      pendingOrders,
      lowStockProducts,

      totalSales: Number(
        salesTotal._sum.total ?? 0
      ),

      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        total: Number(order.total),
        createdAt: order.createdAt,

        customer: {
          id: order.customer.id,
          name: order.customer.name,
          email: order.customer.email,
        },
      })),
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro ao carregar dashboard',
    })
  }
})


const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0')

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`)
  })
}

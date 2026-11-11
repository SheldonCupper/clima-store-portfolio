import type { Product } from '../../generated/prisma/client'

export type ShippingItem = {
  productId: number
  quantity: number
}

export type MelhorEnvioQuote = {
  id: string
  name: string
  price: number
  deliveryTime: number | null
  company: string
  companyPicture: string | null
}

export function validateShippingItems(value: unknown): ShippingItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('O carrinho está vazio')
  }

  const productIds = new Set<number>()

  return value.map((item) => {
    if (
      !item ||
      !Number.isSafeInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 2147483647
    ) {
      throw new Error('Produto ou quantidade inválidos no carrinho')
    }

    if (productIds.has(item.productId)) {
      throw new Error('O carrinho possui produtos duplicados')
    }

    productIds.add(item.productId)
    return { productId: item.productId, quantity: item.quantity }
  })
}

function positiveNumber(value: unknown) {
  return (
    (typeof value === 'number' ||
      (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  )
}

export function validShippingMeasurements(values: {
  weightKg?: unknown
  heightCm?: unknown
  widthCm?: unknown
  lengthCm?: unknown
}) {
  return (
    positiveNumber(values.weightKg) &&
    [values.heightCm, values.widthCm, values.lengthCm].every(
      (value) => positiveNumber(value) &&
        Number.isInteger(Number(value)) && Number(value) <= 2147483647
    )
  )
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function apiNumber(value: unknown): number | null {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    String(value).trim() === ''
  ) return null

  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export async function getMelhorEnvioQuotes(params: {
  destinationCep: string
  paymentMethod: 'PIX' | 'CREDIT_CARD'
  items: ShippingItem[]
  products: Product[]
}): Promise<MelhorEnvioQuote[]> {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim()
  const originCep = (process.env.STORE_POSTAL_CODE || '').replace(/\D/g, '')
  const userAgent = process.env.MELHOR_ENVIO_USER_AGENT?.trim()
  const environment = process.env.MELHOR_ENVIO_ENV || 'sandbox'

  if (!token) {
    throw new Error('MELHOR_ENVIO_TOKEN não configurado no .env')
  }
  if (originCep.length !== 8) {
    throw new Error('STORE_POSTAL_CODE não configurado corretamente no .env')
  }
  if (!userAgent || !/\S+@\S+\.\S+/.test(userAgent)) {
    throw new Error('Configure MELHOR_ENVIO_USER_AGENT com o nome da loja e e-mail de contato no .env')
  }
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('MELHOR_ENVIO_ENV deve ser sandbox ou production')
  }

  const destinationCep = params.destinationCep.replace(/\D/g, '')
  if (destinationCep.length !== 8) {
    throw new Error('CEP de destino inválido')
  }

  const items = validateShippingItems(params.items)
  const apiProducts = items.map((item) => {
    const product = params.products.find((current) => current.id === item.productId)
    if (!product?.active) {
      throw new Error('Um ou mais produtos não foram encontrados')
    }
    if (product.stock < item.quantity) {
      throw new Error(`Estoque insuficiente para ${product.name}`)
    }
    if (!validShippingMeasurements(product)) {
      throw new Error(`Cadastre peso e dimensões do produto "${product.name}" antes de calcular o frete.`)
    }

    const unitPrice = Number(
      params.paymentMethod === 'PIX' && product.pixPrice != null
        ? product.pixPrice
        : product.price
    )

    return {
      id: String(product.id),
      width: product.widthCm,
      height: product.heightCm,
      length: product.lengthCm,
      weight: product.weightKg,
      insurance_value: unitPrice,
      quantity: item.quantity,
    }
  })

  const baseUrl = environment === 'production'
    ? 'https://melhorenvio.com.br'
    : 'https://sandbox.melhorenvio.com.br'

  let data: unknown
  try {
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent,
      },
      body: JSON.stringify({
        from: { postal_code: originCep },
        to: { postal_code: destinationCep },
        products: apiProducts,
        options: { receipt: false, own_hand: false },
      }),
      signal: AbortSignal.timeout(15000),
    })

    // Nunca devolva ao cliente o corpo bruto de erros da API externa.
    if (!response.ok) {
      throw new Error('Melhor Envio indisponível. Tente calcular o frete novamente.')
    }
    data = await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('A consulta ao Melhor Envio demorou demais. Tente novamente.', { cause: error })
    }
    throw new Error('Não foi possível consultar o Melhor Envio. Tente calcular o frete novamente.', { cause: error })
  }

  if (!Array.isArray(data)) {
    throw new Error('Resposta inválida do Melhor Envio')
  }

  const quotes: MelhorEnvioQuote[] = []
  for (const item of data) {
    if (!record(item) || item.error) continue
    const price = apiNumber(item.custom_price ?? item.price)
    const deliveryTime = apiNumber(item.custom_delivery_time ?? item.delivery_time)
    const serviceId = apiNumber(item.id)
    if (
      price === null || price > 99999999.99 ||
      serviceId === null || !Number.isSafeInteger(serviceId) || serviceId <= 0 ||
      typeof item.name !== 'string' || !item.name.trim() ||
      !record(item.company) ||
      typeof item.company.name !== 'string' || !item.company.name.trim()
    ) continue

    quotes.push({
      id: String(serviceId),
      name: item.name,
      price: Math.round(price * 100) / 100,
      deliveryTime: deliveryTime !== null && Number.isInteger(deliveryTime) &&
        deliveryTime <= 2147483647 ? deliveryTime : null,
      company: item.company.name,
      companyPicture: typeof item.company.picture === 'string' &&
        item.company.picture.startsWith('https://') ? item.company.picture : null,
    })
  }

  if (quotes.length === 0) {
    throw new Error('Nenhuma opção de frete disponível para este CEP.')
  }
  return quotes.sort((a, b) => a.price - b.price)
}

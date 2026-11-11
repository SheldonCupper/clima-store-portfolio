import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { request, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { Prisma, type Product } from '../../generated/prisma/client'
import prisma from './prisma'
import { app } from './index'
import { getMelhorEnvioQuotes, validShippingMeasurements } from './shipping'
import { createOrderAccessToken, orderAccessCookieName, orderAccessCookieOptions } from './orderAccess'
import { cpfDigits, formatPhone } from '../../shared/checkoutCustomer'

const product: Product = {
  isService: false, serviceDetails: {},
  id: 1, name: 'Produto de teste', slug: 'teste', sku: 'TESTE',
  description: null, price: new Prisma.Decimal('100'),
  pixPrice: new Prisma.Decimal('90'), stock: 10, active: true,
  imageUrl: null,
  imageUrls: [],
  technicalAttributes: {},
  gtin: null, categoryId: 1, weightKg: 0.75,
  heightCm: 10, widthCm: 15, lengthCm: 20,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
}
const apiQuote = {
  id: 1, name: 'PAC', price: '20.00', custom_price: '25.50',
  delivery_time: 3, custom_delivery_time: 5,
  company: { name: 'Correios', picture: 'https://example.com/correios.png' },
}
const quoteParams = {
  destinationCep: '01001-000', paymentMethod: 'PIX' as const,
  items: [{ productId: 1, quantity: 2 }], products: [product],
}
const orderBody = {
  customer: { name: 'Cliente', email: 'cliente@gmail.com', phone: '11999999999', cpf: '12345678900' },
  address: { cep: '01001-000', street: 'Rua Teste', number: '1', district: 'Centro', city: 'São Paulo', state: 'SP' },
  paymentMethod: 'PIX', shippingOption: { serviceId: '1' },
  items: [{ productId: 1, quantity: 2 }],
}

// Todos os acessos de dados e à API externa são simulados. Nenhum teste grava no banco.
const restorers: (() => void)[] = []
function stubMethod<T extends object>(target: T, method: keyof T, implementation: (...args: never[]) => unknown) {
  const original = target[method]
  Reflect.set(target, method, implementation)
  restorers.push(() => { Reflect.set(target, method, original) })
}

const server = app.listen(0, '127.0.0.1')
before(async () => {
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve))
})
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await prisma.$disconnect()
})
beforeEach(() => {
  process.env.MELHOR_ENVIO_TOKEN = 'token-ficticio-de-teste'
  process.env.MELHOR_ENVIO_ENV = 'sandbox'
  process.env.STORE_POSTAL_CODE = '30140071'
  process.env.MELHOR_ENVIO_USER_AGENT = 'Loja Teste (dev@example.com)'
  process.env.JWT_SECRET = 'segredo-ficticio-de-teste'
  mock.method(console, 'error', () => {})
  stubMethod(prisma.customerAccount, 'findUnique', async () => ({ id: 7, sessionVersion: 0, verificationRequired: false, emailVerifiedAt: null, ...orderBody.customer }))
  stubMethod(prisma.product, 'findMany', async () => [product])
  stubMethod(prisma.order, 'findUnique', async () => { throw new Error('Leitura de pedido inesperada no teste') })
  mock.method(globalThis, 'fetch', async () => Response.json([apiQuote]))
  // Falha imediatamente caso um cenário esqueça de simular uma escrita.
  stubMethod(prisma, '$transaction', async () => { throw new Error('Transação inesperada no teste') })
})
afterEach(() => {
  for (const restore of restorers.reverse()) restore()
  restorers.length = 0
  mock.restoreAll()
})

function httpRequest(method: string, path: string, body?: unknown, cookie = '') {
  return new Promise<{ status: number; data: Record<string, unknown>; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port: (server.address() as AddressInfo).port,
      path, method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(raw), headers: res.headers }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

function post(path: string, body: unknown, admin = false) {
  const token = admin ? jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!) : ''
  const customerToken = path === '/api/orders' && process.env.JWT_SECRET ? jwt.sign({ role: 'CUSTOMER', version: 0 }, process.env.JWT_SECRET, { subject: '7', audience: 'customer-account', issuer: 'ecommerce-api' }) : ''
  return httpRequest(path.includes('/products/1') ? 'PUT' : 'POST', path, body, `admin_token=${token}; customer_session=${customerToken}`)
}

test('cotação usa sandbox, kg, cm, quantidade e preço Pix do banco; prioriza valores customizados', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    assert.equal(url, 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-ficticio-de-teste')
    assert.equal(new Headers(init?.headers).get('User-Agent'), 'Loja Teste (dev@example.com)')
    assert.ok(init?.signal)
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.products, [{
      id: '1', width: 15, height: 10, length: 20, weight: 0.75,
      insurance_value: 90, quantity: 2,
    }])
    assert.equal(body.from.postal_code, '30140071')
    assert.equal(body.to.postal_code, '01001000')
    return Response.json([apiQuote])
  })
  const quotes = await getMelhorEnvioQuotes(quoteParams)
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(quotes[0].price, 25.5)
  assert.equal(quotes[0].deliveryTime, 5)
  assert.equal(quotes[0].company, 'Correios')
})

test('cartão usa preço normal e sandbox é o ambiente padrão', async () => {
  delete process.env.MELHOR_ENVIO_ENV
  mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    assert.match(String(url), /^https:\/\/sandbox\./)
    assert.equal(JSON.parse(String(init?.body)).products[0].insurance_value, 100)
    return Response.json([apiQuote])
  })
  await getMelhorEnvioQuotes({ ...quoteParams, paymentMethod: 'CREDIT_CARD' })
})

test('cotação ignora serviços com erro, preços negativos, vazios e não numéricos', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json([
    { ...apiQuote, error: 'Indisponível' },
    ...[-1, '', 'NaN', true].map((custom_price) => ({ ...apiQuote, custom_price })),
    { ...apiQuote, id: 2, custom_price: '0.00', custom_delivery_time: 0 },
    apiQuote,
  ]))
  const quotes = await getMelhorEnvioQuotes(quoteParams)
  assert.deepEqual(quotes.map((quote) => [quote.id, quote.price]), [['2', 0], ['1', 25.5]])
  assert.equal(quotes[0].deliveryTime, 0)
})

test('usa os campos básicos quando os customizados não existem e preserva prazo desconhecido', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json([
    { ...apiQuote, custom_price: null, custom_delivery_time: null, delivery_time: null },
  ]))
  const [quote] = await getMelhorEnvioQuotes(quoteParams)
  assert.equal(quote.price, 20)
  assert.equal(quote.deliveryTime, null)
})

test('erros HTTP e JSON inválido não expõem corpo externo nem token', async () => {
  for (const response of [
    Response.json({ error: 'token-ficticio-de-teste' }, { status: 401 }),
    new Response('<html>Falha externa</html>'),
    Response.json({ resultado: [] }),
    Response.json([]),
  ]) {
    mock.method(globalThis, 'fetch', async () => response)
    const result = await post('/api/shipping/calculate', { ...quoteParams, cep: '01001000' })
    assert.equal(result.status, 400)
    assert.doesNotMatch(String(result.data.error), /token-ficticio|html|Falha externa/)
  }
})

test('timeout da transportadora é tratado sem permitir pedido sem cotação', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new DOMException('Timeout', 'TimeoutError') })
  const result = await post('/api/orders', orderBody)
  assert.equal(result.status, 400)
  assert.match(String(result.data.error), /demorou demais/)
})

test('itens inválidos e duplicados são recusados antes de consultar transportadoras', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria chamar a API') })
  for (const items of [
    [], [null], [{ productId: '1', quantity: 1 }],
    [{ productId: 1, quantity: 0 }], [{ productId: 1, quantity: 1.5 }],
    [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }],
  ]) {
    for (const path of ['/api/shipping/calculate', '/api/orders']) {
      const result = await post(path, { ...orderBody, cep: '01001000', items })
      assert.equal(result.status, 400)
    }
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('produto sem medidas, inativo, inexistente ou sem estoque não gera cotação', async () => {
  for (const products of [[], [{ ...product, active: false }], [{ ...product, stock: 0 }], [{ ...product, weightKg: null }]]) {
    stubMethod(prisma.product, 'findMany', async () => products)
    const result = await post('/api/shipping/calculate', { cep: '01001000', ...quoteParams })
    assert.equal(result.status, 400)
  }
})

test('configuração ausente, ambiente inválido e CEP inválido impedem a consulta', async () => {
  for (const key of ['MELHOR_ENVIO_TOKEN', 'STORE_POSTAL_CODE', 'MELHOR_ENVIO_USER_AGENT']) {
    const value = process.env[key]
    delete process.env[key]
    await assert.rejects(getMelhorEnvioQuotes(quoteParams), new RegExp(key))
    process.env[key] = value
  }
  process.env.MELHOR_ENVIO_ENV = 'producao'
  await assert.rejects(getMelhorEnvioQuotes(quoteParams), /MELHOR_ENVIO_ENV/)
  process.env.MELHOR_ENVIO_ENV = 'sandbox'
  await assert.rejects(getMelhorEnvioQuotes({ ...quoteParams, destinationCep: '123' }), /CEP de destino/)
})

test('cadastro e edição recusam medidas ausentes, zero, negativas, decimais em cm e não numéricas', async () => {
  assert.equal(validShippingMeasurements({ weightKg: '0.75', heightCm: '10', widthCm: 15, lengthCm: 20 }), true)
  for (const measurements of [
    {}, { weightKg: 0 }, { weightKg: 'abc' }, { weightKg: true },
    { heightCm: null }, { heightCm: -1 }, { heightCm: 0.2 }, { widthCm: 'abc' },
  ]) {
    for (const path of ['/api/products', '/api/products/1']) {
      const result = await post(path, {
        name: 'Teste', slug: 'teste', sku: 'teste', categoryId: 1,
        price: 100, stock: 10,
        ...(Object.keys(measurements).length ? { weightKg: 1, heightCm: 10, widthCm: 15, lengthCm: 20 } : {}),
        ...measurements,
      }, true)
      assert.equal(result.status, 400)
      assert.match(String(result.data.error), /peso positivo/)
    }
  }
})

function mockOrderTransaction(options: { changedProduct?: Partial<Product>; reserved?: number; coupon?: Record<string, unknown>; couponClaimed?: number } = {}) {
  const calls = {
    orders: [] as Prisma.OrderUncheckedCreateInput[], reserves: [] as unknown[],
    customers: [] as Prisma.CustomerUncheckedCreateInput[],
    customerLookups: [] as unknown[],
    couponClaims: [] as unknown[],
  }
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    coupon: { findUnique: async () => options.coupon || null, updateMany: async (args: unknown) => { calls.couponClaims.push(args); return { count: options.couponClaimed ?? 1 } } },
    product: {
      findMany: async () => [{ ...product, ...options.changedProduct }],
      updateMany: async (args: unknown) => { calls.reserves.push(args); return { count: options.reserved ?? 1 } },
    },
    customer: {
      findUnique: async (args: unknown) => { calls.customerLookups.push(args); return null },
      create: async ({ data }: { data: Prisma.CustomerUncheckedCreateInput }) => {
        calls.customers.push(data)
        return { id: 7 }
      },
    },
    address: { create: async () => ({ id: 8 }) },
    order: { create: async ({ data }: { data: Prisma.OrderUncheckedCreateInput }) => { calls.orders.push(data); return { id: 42 } } },
    orderItem: { create: async () => ({ id: 9 }) },
  }
  stubMethod(prisma, '$transaction', async (callback: unknown) => {
    assert.equal(typeof callback, 'function')
    return (callback as (client: typeof tx) => Promise<unknown>)(tx)
  })
  return calls
}

test('CPF e telefone descartam letras, limitam dígitos e formatam sem perder zero inicial', () => {
  assert.equal(cpfDigits('012.345.678-90'), '01234567890')
  assert.equal(cpfDigits('abc01234567890123456789'), '01234567890')
  assert.equal(formatPhone('11 00000 - 0000'), '11 00000-0000')
  assert.equal(formatPhone('(11) 0000-0000'), '11 0000-0000')
  assert.equal(formatPhone('110000000001234567'), '11 00000-0000')
})

test('CPF, telefone e Gmail inválidos são recusados antes de cotar ou gravar', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('Não deve cotar') })
  const invalidCustomers = [
    ...['', '1234567890', '123456789012', '1234567890a', '123.456.789-00', 12345678900, null].map(cpf => ({ cpf })),
    ...['', '110000000', '110000000001', '11abc000000000', 11000000000, null].map(phone => ({ phone })),
    ...['cliente ficticio', 'cliente@hotmail.com', 'cliente@gmail.com.br', 'cliente@gmail.com.evil',
      'cliente@@gmail.com', 'cliente gmail@gmail.com', '.cliente@gmail.com', 'cliente..teste@gmail.com',
      '@gmail.com', 'cliente@gmail.com\n.evil', null, {}].map(email => ({ email })),
  ]
  for (const invalid of invalidCustomers) {
    const field = Object.keys(invalid)[0]
    const result = await post('/api/orders', { ...orderBody, customer: { ...orderBody.customer, ...invalid } })
    assert.equal(result.status, 400)
    assert.ok((result.data.fieldErrors as Record<string, string>)[field])
    assert.equal(result.headers['set-cookie'], undefined)
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('dados válidos são normalizados antes da busca e gravação do cliente', async () => {
  stubMethod(prisma.customerAccount, 'findUnique', async () => ({ id: 7, sessionVersion: 0, verificationRequired: false, emailVerifiedAt: null, ...orderBody.customer, email: 'cliente.teste+loja@gmail.com' }))
  for (const phone of ['11 00000 - 0000', '(11) 0000-0000']) {
    const calls = mockOrderTransaction()
    const result = await post('/api/orders', {
      ...orderBody,
      customer: { name: '  Cliente Teste  ', email: '  Cliente.Teste+loja@GMAIL.COM  ', phone, cpf: '01234567890' },
    })
    assert.equal(result.status, 201)
    assert.deepEqual(calls.customerLookups, [{ where: { email: 'cliente.teste+loja@gmail.com' } }])
    assert.deepEqual(calls.customers, [{
      name: 'Cliente Teste', email: 'cliente.teste+loja@gmail.com',
      phone: phone.replace(/\D/g, ''), cpf: '01234567890',
    }])
  }
})

test('pedido recalcula frete, ignora preço adulterado e salva transportadora, serviço, valor e prazo', async () => {
  const calls = mockOrderTransaction()
  let calculations = 0
  mock.method(globalThis, 'fetch', async () => {
    assert.equal(calls.orders.length, 0)
    calculations++
    return Response.json([{ ...apiQuote, custom_price: calculations === 1 ? '10.00' : '32.75' }])
  })
  const quote = await post('/api/shipping/calculate', { cep: '01001000', ...quoteParams })
  assert.equal(quote.status, 200)
  const result = await post('/api/orders', {
    ...orderBody, shipping: 0.01, total: 0.01,
    shippingOption: { serviceId: '1', price: 0.01, company: 'Falsa', deliveryTime: 0 },
  })
  assert.equal(result.status, 201)
  assert.equal(result.data.orderId, 42)
  assert.equal(calculations, 2)
  assert.equal(calls.orders[0].subtotal, 180)
  assert.equal(calls.orders[0].shipping, 32.75)
  assert.equal(calls.orders[0].total, 212.75)
  assert.equal(calls.orders[0].shippingServiceId, '1')
  assert.equal(calls.orders[0].shippingServiceName, 'PAC')
  assert.equal(calls.orders[0].shippingCompany, 'Correios')
  assert.equal(calls.orders[0].shippingDeliveryTime, 5)
  assert.equal(calls.reserves.length, 1)
  assert.equal(result.headers['cache-control'], 'no-store')
  assert.equal(result.headers['set-cookie'], undefined)
  assert.doesNotMatch(JSON.stringify(result.data), /accessToken|order_access_|eyJ/)
})

test('pedido de conta usa o dono da sessão e não emite credencial de compra avulsa', async () => {
  const calls = mockOrderTransaction()
  stubMethod(prisma.customerAccount, 'findUnique', async () => ({ id: 7, sessionVersion: 0, verificationRequired: false, emailVerifiedAt: null, ...orderBody.customer }))
  const token = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, {
    subject: '7', audience: 'customer-account', issuer: 'ecommerce-api', expiresIn: '1h',
  })
  const result = await httpRequest('POST', '/api/orders', { ...orderBody, accountId: 999 }, `customer_session=${token}`)
  assert.equal(result.status, 201)
  assert.equal(calls.orders[0].accountId, 7)
  assert.equal(result.headers['set-cookie'], undefined)
})

test('sessão inválida e e-mail diferente da conta impedem criar pedido', async () => {
  const invalid = await httpRequest('POST', '/api/orders', orderBody, 'customer_session=adulterado')
  assert.equal(invalid.status, 401)
  stubMethod(prisma.customerAccount, 'findUnique', async () => ({ id: 7, sessionVersion: 0, verificationRequired: false, emailVerifiedAt: null, ...orderBody.customer, email: 'outra@gmail.com' }))
  const token = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, {
    subject: '7', audience: 'customer-account', issuer: 'ecommerce-api', expiresIn: '1h',
  })
  const mismatch = await httpRequest('POST', '/api/orders', orderBody, `customer_session=${token}`)
  assert.equal(mismatch.status, 400)
  assert.match(String(mismatch.data.error), /e-mail da conta/)
})

test('configuração JWT ausente impede criar pedido antes de cotar ou gravar', async () => {
  delete process.env.JWT_SECRET
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('Não deve cotar') })
  const result = await post('/api/orders', orderBody)
  assert.equal(result.status, 401)
  assert.equal(fetchMock.mock.callCount(), 0)
  assert.equal(result.headers['set-cookie'], undefined)
})

test('consulta anônima não revela existência nem dados de pedidos', async () => {
  for (const id of [42, 999]) {
    const result = await httpRequest('GET', `/api/orders/${id}`)
    assert.equal(result.status, 401)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.deepEqual(Object.keys(result.data), ['error'])
  }
})

test('cookie histórico de compra avulsa permite consultar e recarregar somente aquele pedido', async () => {
  mockOrderTransaction()
  const cookie = `${orderAccessCookieName(42)}=${createOrderAccessToken(42, process.env.JWT_SECRET!)}`
  stubMethod(prisma.order, 'findUnique', async (args: unknown) => {
    const query = args as { where: { id: number }; select: Record<string, unknown> }
    assert.equal(query.where.id, 42)
    assert.equal(query.select.customer, undefined)
    assert.equal(query.select.customerId, undefined)
    assert.equal(query.select.addressId, undefined)
    assert.deepEqual(query.select.address, { select: {
      cep: true, street: true, number: true, district: true,
      city: true, state: true, complement: true,
    } })
    return { id: 42, shipping: '32.75', shippingCompany: 'Correios', shippingServiceName: 'PAC' }
  })
  for (let reload = 0; reload < 2; reload++) {
    const result = await httpRequest('GET', '/api/orders/42', undefined, cookie)
    assert.equal(result.status, 200)
    assert.equal(result.data.id, 42)
    assert.equal(result.data.customer, undefined)
  }
  const forbidden = await httpRequest('GET', '/api/orders/43', undefined, cookie)
  assert.equal(forbidden.status, 401)
})

test('credencial de outro pedido, assinatura adulterada e token expirado são recusados', async () => {
  const valid = createOrderAccessToken(42, process.env.JWT_SECRET!)
  const expired = jwt.sign({ purpose: 'ORDER_VIEW' }, process.env.JWT_SECRET!, {
    algorithm: 'HS256', subject: '42', audience: 'order-confirmation', issuer: 'ecommerce-api', expiresIn: -1,
  })
  const wrongPurpose = jwt.sign({ purpose: 'ADMIN' }, process.env.JWT_SECRET!, {
    subject: '42', audience: 'order-confirmation', issuer: 'ecommerce-api', expiresIn: '1h',
  })
  const wrongAlgorithm = jwt.sign({ purpose: 'ORDER_VIEW' }, process.env.JWT_SECRET!, {
    algorithm: 'HS512', subject: '42', audience: 'order-confirmation', issuer: 'ecommerce-api', expiresIn: '1h',
  })
  const wrongAudience = jwt.sign({ purpose: 'ORDER_VIEW' }, process.env.JWT_SECRET!, {
    subject: '42', audience: 'other-app', issuer: 'ecommerce-api', expiresIn: '1h',
  })
  for (const token of [
    createOrderAccessToken(43, process.env.JWT_SECRET!),
    `${valid.slice(0, valid.lastIndexOf('.') + 1)}assinatura-invalida`,
    expired, wrongPurpose, wrongAlgorithm, wrongAudience,
  ]) {
    const result = await httpRequest('GET', '/api/orders/42', undefined, `${orderAccessCookieName(42)}=${token}`)
    assert.equal(result.status, 401)
    assert.deepEqual(Object.keys(result.data), ['error'])
  }
})

test('admin autenticado mantém acesso completo; token de pedido não concede acesso administrativo', async () => {
  const guest = createOrderAccessToken(42, process.env.JWT_SECRET!)
  for (const cookie of ['', `admin_token=${guest}`, `${orderAccessCookieName(42)}=${guest}`]) {
    const result = await httpRequest('GET', '/api/admin/orders/42', undefined, cookie)
    assert.ok(result.status === 401 || result.status === 403)
  }
  stubMethod(prisma.order, 'findUnique', async () => ({ id: 42, customer: { name: 'Cliente' }, address: {}, items: [] }))
  const admin = jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!, { expiresIn: '1h' })
  const result = await httpRequest('GET', '/api/admin/orders/42', undefined, `admin_token=${admin}`)
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.customer, { name: 'Cliente' })
  assert.equal(result.headers['cache-control'], 'no-store')
})

test('pedido autorizado inexistente retorna 404 e ID inválido retorna 400', async () => {
  stubMethod(prisma.order, 'findUnique', async () => null)
  const cookie = `${orderAccessCookieName(42)}=${createOrderAccessToken(42, process.env.JWT_SECRET!)}`
  const missing = await httpRequest('GET', '/api/orders/42', undefined, cookie)
  assert.equal(missing.status, 404)
  const invalid = await httpRequest('GET', '/api/orders/abc')
  assert.equal(invalid.status, 400)
})

test('cookie de acesso usa Secure em produção e expira em 30 dias', () => {
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const options = orderAccessCookieOptions(42)
    assert.equal(options.secure, true)
    assert.equal(options.httpOnly, true)
    assert.equal(options.maxAge, 30 * 24 * 60 * 60 * 1000)
    assert.equal(options.path, '/api/orders/42')
  } finally {
    process.env.NODE_ENV = previous
  }
})

test('serviço removido ou não selecionado impede a criação do pedido', async () => {
  for (const shippingOption of [undefined, {}, { serviceId: '999' }]) {
    const result = await post('/api/orders', { ...orderBody, shippingOption })
    assert.equal(result.status, 400)
    assert.match(String(result.data.error), /frete/)
  }
})

test('alteração de preço ou dimensões durante a cotação impede a gravação', async () => {
  for (const changedProduct of [{ price: new Prisma.Decimal(101) }, { weightKg: 1.5 }]) {
    const calls = mockOrderTransaction({ changedProduct })
    const result = await post('/api/orders', orderBody)
    assert.equal(result.status, 400)
    assert.match(String(result.data.error), /atualizados durante a cotação/)
    assert.equal(calls.orders.length, 0)
  }
})

test('alteração concorrente do estoque aborta a transação do pedido', async () => {
  mockOrderTransaction({ reserved: 0 })
  const result = await post('/api/orders', orderBody)
  assert.equal(result.status, 400)
  assert.match(String(result.data.error), /Confira o carrinho/)
})

const couponFixture = { id: 'coupon-1', code: 'CLIMA10', kind: 'PERCENT', value: '10', minSubtotal: '100', maxDiscount: null, active: true, startsAt: null, expiresAt: null, usageLimit: 1, usedCount: 0 }
test('pedido aplica cupom sobre produtos e ignora desconto/total adulterados', async () => {
  const calls = mockOrderTransaction({ coupon: couponFixture })
  const result = await post('/api/orders', { ...orderBody, couponCode: 'clima10', discount: 99999, total: 0.01 })
  assert.equal(result.status, 201)
  assert.equal(calls.orders[0].subtotal, 180); assert.equal(calls.orders[0].shipping, 25.5)
  assert.equal(calls.orders[0].discount, 18); assert.equal(calls.orders[0].total, 187.5)
  assert.equal(calls.orders[0].couponId, 'coupon-1'); assert.equal(calls.orders[0].couponCode, 'CLIMA10')
  assert.equal(calls.couponClaims.length, 1)
})
test('cupom inválido após prévia ou sem utilização restante impede criar pedido e reservar estoque', async () => {
  for (const options of [{ coupon: { ...couponFixture, active: false } }, { coupon: couponFixture, couponClaimed: 0 }]) {
    const calls = mockOrderTransaction(options)
    const result = await post('/api/orders', { ...orderBody, couponCode: 'CLIMA10' })
    assert.equal(result.status, 400); assert.equal(calls.orders.length, 0); assert.equal(calls.reserves.length, 0)
  }
})

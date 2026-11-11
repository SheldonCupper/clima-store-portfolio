import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { defaultStorefrontSettings, parseStorefrontSettings, parseStorefrontSaveResponse, safeStorefrontLink } from '../../shared/storefront'

const server = app.listen(0, '127.0.0.1')
const restorers: (() => void)[] = []
function stub<T extends object>(target: T, method: keyof T, implementation: (...args: never[]) => unknown) {
  const original = target[method]
  Reflect.set(target, method, implementation)
  restorers.push(() => { Reflect.set(target, method, original) })
}
before(async () => { if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve)) })
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect() })
beforeEach(() => {
  process.env.JWT_SECRET = 'segredo-ficticio-para-teste-de-vitrine'
  stub(prisma.storefrontSetting, 'findUnique', async () => null)
  stub(prisma.storefrontSetting, 'upsert', async () => { throw new Error('Escrita inesperada no teste') })
  stub(prisma.category, 'findMany', async () => [{ id: 1, name: 'Ferramentas', slug: 'ferramentas', _count: { products: 2 } }])
  stub(prisma.orderItem, 'groupBy', async () => [])
})
afterEach(() => { for (const restore of restorers.reverse()) restore(); restorers.length = 0 })

function call(method: string, path: string, body?: unknown, admin = false) {
  const token = admin ? jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!, { expiresIn: '1h' }) : ''
  return new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method, headers: { 'Content-Type': 'application/json', Cookie: `admin_token=${token}` } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => { data += chunk }); res.on('end', () => { try { resolve({ status: res.statusCode!, data: JSON.parse(data) }) } catch (error) { reject(error) } })
    })
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

test('vitrine pública usa configuração padrão sem criar registros e sem expor pedidos', async () => {
  const result = await call('GET', '/api/storefront')
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.settings, defaultStorefrontSettings)
  assert.deepEqual(Object.keys(result.data).sort(), ['bestSellerIds', 'categories', 'settings'])
})

test('mais vendidos considera somente produtos ativos em vendas aprovadas não canceladas', async () => {
  stub(prisma.orderItem, 'groupBy', async (args: unknown) => {
    const query = args as { where: unknown; orderBy: unknown }
    assert.deepEqual(query.where, { order: { paymentStatus: 'APPROVED', status: { notIn: ['CANCELED'] } }, product: { active: true, isService: false } })
    assert.deepEqual(query.orderBy, { _sum: { quantity: 'desc' } })
    return [{ productId: 7, _sum: { quantity: 3 } }]
  })
  assert.deepEqual((await call('GET', '/api/storefront')).data.bestSellerIds, [7])
})

test('leitura administrativa e edição da vitrine exigem administrador', async () => {
  assert.equal((await call('GET', '/api/admin/storefront')).status, 401)
  assert.equal((await call('PUT', '/api/admin/storefront', defaultStorefrontSettings)).status, 401)
})

test('personalização é validada e salva somente na configuração principal', async () => {
  const content = structuredClone(defaultStorefrontSettings)
  content.primaryColor = '#123456'
  content.banners[0].title = 'Minha vitrine Clima'
  content.showcases[0].mode = 'manual'
  content.showcases[0].productIds = [7, 3, 7]
  let saved: unknown
  stub(prisma.storefrontSetting, 'upsert', async (args: unknown) => { saved = args; return {} })
  const result = await call('PUT', '/api/admin/storefront', content, true)
  assert.equal(result.status, 200)
  const validated = parseStorefrontSettings(content)
  assert.deepEqual(saved, { where: { id: 'main' }, create: { id: 'main', content: validated }, update: { content: validated } })
  assert.deepEqual(validated.showcases[0].productIds, [7, 3])
})

test('links inseguros, cor inválida, blocos duplicados e tipos incorretos não são salvos', async () => {
  const bad = []
  for (const link of ['javascript:alert(1)', '//outro-site.com', '/\n/outro-site.com', 'https://user:password@example.com', 'data:text/html,teste']) {
    const content = structuredClone(defaultStorefrontSettings); content.banners[0].link = link; bad.push(content)
  }
  const color = structuredClone(defaultStorefrontSettings); color.primaryColor = 'red'; bad.push(color)
  const duplicated = structuredClone(defaultStorefrontSettings); duplicated.banners.push(duplicated.banners[0]); bad.push(duplicated)
  for (const content of bad) assert.equal((await call('PUT', '/api/admin/storefront', content, true)).status, 400)
  assert.throws(() => parseStorefrontSettings({ ...defaultStorefrontSettings, autoplay: 'true' }))
  assert.throws(() => parseStorefrontSettings({ ...defaultStorefrontSettings, slideSeconds: 1 }))
  assert.throws(() => parseStorefrontSettings({ ...defaultStorefrontSettings, showcases: [{ ...defaultStorefrontSettings.showcases[0], mode: ['manual'] }] }))
  assert.equal(safeStorefrontLink('/uploads/banner.webp', true), true)
  assert.equal(safeStorefrontLink('https://example.com/banner.webp', true), true)
})

test('vitrine pública reflete o conteúdo persistido na próxima consulta', async () => {
  const content = structuredClone(defaultStorefrontSettings); content.announcement = 'Uma nova mensagem da Clima'
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content }))
  const result = await call('GET', '/api/storefront')
  assert.equal((result.data.settings as typeof content).announcement, content.announcement)
})

test('configuração antiga mantém a loja e recebe pop-up desativado sem gravar no banco', async () => {
  const { promotion: _promotion, ...legacy } = structuredClone(defaultStorefrontSettings)
  legacy.primaryColor = '#112233'
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content: legacy }))
  const result = await call('GET', '/api/storefront')
  assert.equal(result.status, 200)
  const settings = result.data.settings as typeof defaultStorefrontSettings
  assert.equal(settings.primaryColor, '#112233')
  assert.deepEqual(settings.banners, legacy.banners)
  assert.deepEqual(settings.promotion, defaultStorefrontSettings.promotion)
})

test('administrador salva campanha e a leitura pública entrega a mesma configuração', async () => {
  const content = structuredClone(defaultStorefrontSettings)
  content.promotion = { id: 'campanha-teste', active: true, title: 'Seleção Clima', description: 'Confira os produtos.', imageUrl: '/uploads/campanha.webp', buttonText: 'Ver seleção', link: '/catalogo?pix=1', dismissText: 'Depois', frequency: 'weekly', delaySeconds: 5 }
  stub(prisma.storefrontSetting, 'upsert', async (args: unknown) => {
    assert.deepEqual((args as { update: { content: unknown } }).update.content, content)
    return {}
  })
  const result = await call('PUT', '/api/admin/storefront', content, true)
  assert.equal(result.status, 200)
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content: result.data.settings }))
  assert.deepEqual(((await call('GET', '/api/storefront')).data.settings as typeof content).promotion, content.promotion)
})

test('campanhas com links inseguros, textos vazios ou frequência e espera inválidas são rejeitadas', async () => {
  for (const change of [{ link: 'javascript:alert(1)' }, { imageUrl: '//example.com/x.png' }, { title: '' }, { dismissText: '' }, { buttonText: '' }, { frequency: ['daily'] }, { frequency: 'always' }, { active: 'true' }, { delaySeconds: -1 }, { delaySeconds: 61 }, { delaySeconds: 1.5 }, { description: 'x'.repeat(401) }]) {
    const content = structuredClone(defaultStorefrontSettings)
    Object.assign(content.promotion, change)
    assert.equal((await call('PUT', '/api/admin/storefront', content, true)).status, 400)
  }
})

test('confirmação de salvamento rejeita backend antigo e respostas incompletas antes de substituir a edição', () => {
  const { promotion: _promotion, ...oldSettings } = structuredClone(defaultStorefrontSettings)
  for (const response of [null, {}, { settings: null }, { settings: oldSettings }]) {
    assert.throws(() => parseStorefrontSaveResponse(response), /não confirmou os dados do pop-up/)
  }
  assert.throws(() => parseStorefrontSaveResponse({ settings: { ...defaultStorefrontSettings, promotion: { active: true } } }))
  const draft = structuredClone(defaultStorefrontSettings)
  draft.promotion.title = 'Campanha preservada'
  draft.promotion.active = true
  assert.deepEqual(parseStorefrontSaveResponse({ settings: draft }), draft)
})

test('cabeçalho antigo recebe cores compatíveis e menu padrão sem sobrescrever vitrines', async () => {
  const { header: _header, ...legacy } = structuredClone(defaultStorefrontSettings)
  legacy.primaryColor = '#551199'; legacy.secondaryColor = '#117755'
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content: legacy }))
  const result = await call('GET', '/api/storefront')
  assert.equal(result.status, 200)
  const settings = result.data.settings as typeof defaultStorefrontSettings
  assert.equal(settings.header.accentColor, '#551199'); assert.equal(settings.header.navAccentColor, '#117755')
  assert.deepEqual(settings.banners, legacy.banners); assert.deepEqual(settings.promotion, legacy.promotion)
  assert.equal(settings.header.links.find(link => link.link === '/servicos')?.active, true)
})
test('cabeçalho personalizado persiste as duas faixas e links sem alterar campanhas', async () => {
  const content = structuredClone(defaultStorefrontSettings)
  content.header.background = '#112233'; content.header.navBackground = '#994411'; content.header.textColor = '#ffffff'
  content.header.links = [{ id: 'servicos', label: 'Instalação e limpeza', link: '/servicos', active: true }]
  let saved: unknown
  stub(prisma.storefrontSetting, 'upsert', async (args: { update: { content: unknown } }) => { saved = args.update.content; return {} })
  const result = await call('PUT', '/api/admin/storefront', content, true)
  assert.equal(result.status, 200); assert.deepEqual(saved, content)
  assert.deepEqual(parseStorefrontSaveResponse(result.data).header, content.header)
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content: saved }))
  const publicSettings = (await call('GET', '/api/storefront')).data.settings as typeof content
  assert.deepEqual(publicSettings.header, content.header); assert.deepEqual(publicSettings.promotion, content.promotion)
})
test('cores injetadas, links inseguros, menus duplicados e limites do cabeçalho são recusados', async () => {
  const bad: Record<string, unknown>[] = [
    { background: 'red' }, { navBackground: '#ffffff;background:red' }, { showHelp: 'true' }, { accountLabel: '' },
    { helpLink: 'javascript:alert(1)' }, { links: [{ id: 'x', label: 'Teste', link: '//example.com', active: true }] },
    { links: Array(11).fill(defaultStorefrontSettings.header.links[0]) }, { links: Array(2).fill(defaultStorefrontSettings.header.links[0]) },
  ]
  for (const change of bad) {
    const content = structuredClone(defaultStorefrontSettings); Object.assign(content.header, change)
    assert.equal((await call('PUT', '/api/admin/storefront', content, true)).status, 400)
  }
})
test('cliente antigo que salva vitrine preserva o cabeçalho existente; resposta antiga não apaga rascunho novo', async () => {
  const content = structuredClone(defaultStorefrontSettings); content.header.background = '#881122'
  stub(prisma.storefrontSetting, 'findUnique', async () => ({ id: 'main', content }))
  stub(prisma.storefrontSetting, 'upsert', async () => ({}))
  const { header: _header, ...legacy } = content
  legacy.banners[0].title = 'Banner atualizado'
  const result = await call('PUT', '/api/admin/storefront', legacy, true)
  assert.equal(result.status, 200); assert.deepEqual((result.data.settings as typeof content).header, content.header)
  assert.throws(() => parseStorefrontSaveResponse({ settings: legacy }), /não confirmou o cabeçalho/)
})

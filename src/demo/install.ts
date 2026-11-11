import { defaultStorefrontSettings } from '../../shared/storefront'
import type { Product } from '../context/cart'

const categories = [
  { id: 1, name: 'Ferramentas', slug: 'ferramentas', active: true },
  { id: 2, name: 'Climatização', slug: 'climatizacao', active: true },
  { id: 3, name: 'Peças e componentes', slug: 'pecas-componentes', active: true },
]
const catalog = [
  ['Bomba de vácuo profissional 7 CFM', 'bomba-vacuo', 789.90, 758.30, 1, 'pump'],
  ['Manifold digital de alta precisão', 'manifold-digital', 459.90, 441.50, 1, 'gauge'],
  ['Ar-condicionado inverter 12.000 BTUs', 'ar-condicionado-inverter', 2499.90, 2374.90, 2, 'ac'],
  ['Kit de ferramentas para instalação', 'kit-ferramentas', 329.90, 313.40, 1, 'tools'],
  ['Capacitor de partida 35 µF', 'capacitor-35uf', 49.90, 47.40, 3, 'part'],
  ['Termostato digital para refrigeração', 'termostato-digital', 139.90, 132.90, 3, 'control'],
] as const
export const demoProducts: Product[] = catalog.map(([name, slug, price, pix, categoryId, image], i) => ({
  id: i + 1, name, slug, sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
  description: 'Produto ilustrativo do catálogo Clima Store. Equipamento para projetos de refrigeração e climatização. Os valores e as especificações desta demonstração são fictícios.',
  price: String(price), pixPrice: String(pix), stock: 12 + i * 3, active: true,
  imageUrl: `/demo/${image}.svg`, imageUrls: [`/demo/${image}.svg`],
  categoryId, category: categories.find(category => category.id === categoryId)!,
  technicalAttributes: { brand: 'Clima Demo', model: `Modelo ${i + 1}`, voltage: '220 V' },
  createdAt: `2026-11-0${6 - i}T12:00:00Z`, updatedAt: '2026-11-06T12:00:00Z',
}))

// Somente no bundle de demonstração: nenhuma chamada /api alcança um servidor real.
// Escritas são recusadas; o painel é uma prévia pública com dados fictícios.
export function installDemo() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
    if (init?.signal?.aborted || (input instanceof Request && input.signal.aborted)) throw new DOMException('Aborted', 'AbortError')
    if (method !== 'GET') return json({ error: 'Demonstração de portfólio: gravações, contas e pagamentos estão desativados.' }, 403)
    const path = url.pathname
    if (path === '/api/products' || path === '/api/admin/products') return json(demoProducts)
    if (path === '/api/categories' || path === '/api/admin/categories') return json(categories.map(category => ({ ...category, _count: { products: demoProducts.filter(product => product.categoryId === category.id).length } })))
    if (path === '/api/storefront' || path === '/api/admin/storefront') return json({ settings: { ...defaultStorefrontSettings, autoplay: false }, categories, bestSellerIds: [] })
    if (path === '/api/admin/me') return json({ id: 0, name: 'Visitante Demo', email: 'demo@example.com' })
    if (path === '/api/customer/me') return json({ error: 'Sem sessão na demonstração.' }, 401)
    if (path === '/api/customer/google/status') return json({ enabled: false })
    if (path === '/api/payments/config') return json({ enabled: false, environment: 'sandbox' })
    if (path === '/api/coupons/available') return json({ coupons: [] })
    if (/^\/api\/products\/\d+\/reviews$/.test(path)) return json({ reviews: [], average: 0, total: 0, eligible: false, own: null })
    if (path === '/api/admin/dashboard') return json({ totalProducts: demoProducts.length, totalOrders: 0, totalCustomers: 0, pendingOrders: 0, lowStockProducts: 0, totalSales: 0, recentOrders: [] })
    if (path === '/api/admin/orders' || path === '/api/admin/customers' || path === '/api/services') return json([])
    return json({ error: 'Esta função exige o backend completo e não está disponível na demonstração.' }, 503)
  }
}

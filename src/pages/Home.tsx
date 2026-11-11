import { CustomerCoupons } from '../components/CustomerCoupons'
import { headerTheme } from '../../shared/header'
const ServicesPage = lazy(() => import('../components/ServicesPage'))
import { attributeFields, matchesAttributes, normalizeAttribute, readProductAttributes, type ProductAttributes } from '../../shared/productAttributes'
import ProductTechnicalFilters from '../components/ProductTechnicalFilters'
import QuotePage from '../components/QuotePage'
import { useQuote } from '../hooks/useQuote'
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Wrench, Heart, ArrowRight, ChevronDown, ChevronRight, CircleHelp, LayoutGrid, MapPin, Menu, Package, Phone, Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Truck, UserRound, X } from 'lucide-react'
import { useCart } from '../context/useCart'
import { useCustomer } from '../context/customer'
import type { Product } from '../context/cart'
import { store } from '../config/store'
import { InstagramIcon } from '../components/InstagramIcon'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { StoreLogo } from '../components/StoreLogo'
import { BannerCarousel, CartDrawer, CategoryIcon, ProductCard, ProductCarousel } from '../components/StorefrontComponents'
import { defaultStorefrontSettings, parseStorefrontSettings, type StorefrontSettings } from '../../shared/storefront'
import { storefrontImageUrl } from '../utils/storefront'
import ProductPage from '../components/ProductPage'
import { useFavorites } from '../hooks/useFavorites'
import PromotionPopup from '../components/PromotionPopup'
import './Storefront.css'

type Category = { id: number; name: string; slug: string; _count?: { products: number } }
type Metadata = { settings: StorefrontSettings; categories: Category[]; bestSellerIds: number[] }

function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { slug, productSlug } = useParams()
  const servicesPage = location.pathname === '/servicos'
  const quotePage = location.pathname === '/orcamento'
  const { items: quoteItems } = useQuote()
  const favoritesPage = location.pathname === "/favoritos"
  const isProductPage = productSlug !== undefined
  const { ids: favoriteIds } = useFavorites()
  const [urlParams, setParams] = useSearchParams()
  const [pendingParams, setPendingParams] = useState<{ locationKey: string; value: string } | null>(null)
  const params = pendingParams?.locationKey === location.key ? new URLSearchParams(pendingParams.value) : urlParams
  const catalog = location.pathname === '/catalogo' || Boolean(slug)
  const { customer } = useCustomer()
  const { cartCount, cartTotal } = useCart()
  const [products, setProducts] = useState<Product[]>([])
  const [metadata, setMetadata] = useState<Metadata>({ settings: defaultStorefrontSettings, categories: [], bestSellerIds: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [draftSearch, setDraftSearch] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const inspect = (product: Product) => navigate(`/produto/${encodeURIComponent(product.slug)}`)
  const settings = metadata.settings
  const header = settings.header
  const search = params.get('busca') || ''
  const selectedCategory = metadata.categories.find(category => category.slug === slug)
  const categories = metadata.categories.filter(category => products.some(product => product.categoryId === category.id))
  const min = params.get('min') || ''
  const max = params.get('max') || ''
  const stockOnly = params.get('estoque') === '1'
  const pixOnly = params.get('pix') === '1'
  const sort = params.get('ordem') || 'recentes'
  const color = settings.primaryColor.slice(1)
  const brightness = (parseInt(color.slice(0, 2), 16) * 299 + parseInt(color.slice(2, 4), 16) * 587 + parseInt(color.slice(4), 16) * 114) / 1000
  const theme = { '--clima-primary': settings.primaryColor, '--clima-secondary': settings.secondaryColor, '--clima-on-primary': brightness > 165 ? '#102d3a' : '#ffffff' } as CSSProperties

  useEffect(() => { window.scrollTo({ top: 0 }) }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setLoading(true); setError('')
        const [response, storeResponse] = await Promise.all([fetch('/api/products', { signal: controller.signal }), fetch('/api/storefront', { signal: controller.signal, cache: 'no-store' })])
        if (!response.ok) throw new Error('Não foi possível carregar os produtos. Tente novamente.')
        const data: Product[] = await response.json()
        const content: Metadata = storeResponse.ok ? await storeResponse.json() : { settings: defaultStorefrontSettings, categories: [...new Map(data.map(product => [product.categoryId, product.category])).values()], bestSellerIds: [] }
        if (controller.signal.aborted) return
        setProducts(data); setMetadata({ ...content, settings: parseStorefrontSettings(content.settings) })
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Não foi possível carregar a loja.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [retry])

  const technicalSearch = params.toString()
  const technicalFilters = useMemo(() => {
    const query = new URLSearchParams(technicalSearch)
    return Object.fromEntries(attributeFields.map(field => [field.key, query.get(`tec_${field.key}`) || ''])) as ProductAttributes
  }, [technicalSearch])

  const newest = useMemo(() => [...products].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [products])
  const filtered = useMemo(() => {
    const term = normalizeAttribute(search)
    const result = products.filter(product => {
      const price = Number(product.pixPrice ?? product.price)
      return matchesAttributes(product.technicalAttributes, technicalFilters) && (!slug || product.category.slug === slug) && (!term || normalizeAttribute(`${product.name} ${product.sku} ${product.category.name} ${Object.values(readProductAttributes(product.technicalAttributes)).join(' ')}`).includes(term)) && (!min || price >= Number(min)) && (!max || price <= Number(max)) && (!stockOnly || product.stock > 0) && (!pixOnly || (product.pixPrice !== null && Number(product.pixPrice) < Number(product.price)))
    })
    return result.sort((a, b) => sort === 'menor-preco' ? Number(a.pixPrice ?? a.price) - Number(b.pixPrice ?? b.price) : sort === 'maior-preco' ? Number(b.pixPrice ?? b.price) - Number(a.pixPrice ?? a.price) : sort === 'nome' ? a.name.localeCompare(b.name, 'pt-BR') : Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }, [products, slug, search, min, max, stockOnly, pixOnly, sort, technicalFilters])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setPendingParams({ locationKey: location.key, value: next.toString() })
    setParams(next, { replace: true })
  }
  function searchProducts(event: React.SyntheticEvent) {
    event.preventDefault()
    const term = (draftSearch ?? search).trim()
    navigate(`/catalogo${term ? `?busca=${encodeURIComponent(term)}` : ''}`)
    setDraftSearch(null); setMenuOpen(false)
  }
  const add = () => setCartOpen(true)
  const activeFilters = Boolean(search || min || max || stockOnly || pixOnly || Object.values(technicalFilters).some(Boolean))

  return (
    <div className="store clima-store" style={theme}>
      <header className="main-header clima-header" style={headerTheme(header) as CSSProperties}>
        <div className="container clima-header-content">
          <button className="clima-mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="clima-departments" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}>{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          <Link className="logo clima-brand" to="/" aria-label={store.name}><StoreLogo /><span><strong>{header.brandTitle}</strong><small>{header.brandSubtitle}</small></span></Link>
          <form className="clima-search" onSubmit={searchProducts}><Search size={19} /><input aria-label="Buscar produtos" placeholder={header.searchPlaceholder} value={draftSearch ?? search} onChange={event => setDraftSearch(event.target.value)} /><button type="submit" aria-label="Pesquisar"><ArrowRight size={20} /></button></form>
          <div className="clima-header-actions">{header.showFavorites && <Link to="/favoritos" className="clima-favorites-nav" aria-label={`${header.favoritesLabel}: ${favoriteIds.length} produtos`}><Heart size={22} /><span>{header.favoritesLabel}</span></Link>}{header.showHelp && (header.helpLink.startsWith('https://') || header.helpLink.startsWith('#') ? <a href={header.helpLink} target={header.helpLink.startsWith('https://') ? '_blank' : undefined} rel="noopener noreferrer" className="clima-header-help"><WhatsAppIcon size={23} /><span>{header.helpLabel}<small>{header.helpDetail}</small></span></a> : <Link to={header.helpLink} className="clima-header-help"><WhatsAppIcon size={23} /><span>{header.helpLabel}<small>{header.helpDetail}</small></span></Link>)}<button className="account-action" aria-label={header.accountLabel} onClick={() => navigate(customer ? '/conta' : '/entrar')}><UserRound size={24} /><span>{customer ? `${header.greeting} ${customer.name.split(' ')[0]}` : header.accountLabel}<small>{customer ? header.ordersHint : header.accountHint}</small></span></button><button className="cart-action clima-cart-action" onClick={add} aria-label={`Abrir ${header.cartLabel} com ${cartCount} itens`}><ShoppingCart size={25} /><b>{cartCount}</b><span>{header.cartLabel}<small>{cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</small></span></button></div>
        </div>
        <nav className="clima-nav" aria-label="Navegação da loja"><div className="container"><button className="clima-departments-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="clima-departments"><LayoutGrid size={17} /> {header.departmentsLabel} <ChevronDown size={15} /></button><div className="clima-nav-links">{header.links.filter(item => item.active).map(item => {
          const external = item.link.startsWith('https://') || item.link.startsWith('#')
          const target = new URL(item.link, window.location.origin)
          const active = !external && target.pathname === location.pathname && (target.search ? [...target.searchParams].every(([key, value]) => params.get(key) === value) : !location.search)
          const label = <>{item.label}{!external && target.pathname === '/orcamento' && quoteItems.length ? ` (${quoteItems.length})` : ''}</>
          return external ? <a key={item.id} href={item.link} target={item.link.startsWith('https://') ? '_blank' : undefined} rel="noopener noreferrer">{label}</a> : <Link key={item.id} to={item.link} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>{label}</Link>
        })}</div>{header.showLocation && <span className="clima-nav-location"><MapPin size={13} /> {header.locationLabel}</span>}</div></nav>
        {menuOpen && <><button className="clima-menu-backdrop" aria-label="Fechar departamentos" onClick={() => setMenuOpen(false)} /><div className="clima-mega-menu container" id="clima-departments" onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false) }}><div className="clima-mega-heading"><div><span className="clima-eyebrow">EXPLORE A CLIMA STORE</span><h2>Seu projeto, do começo ao fim.</h2></div><button onClick={() => setMenuOpen(false)} aria-label="Fechar departamentos"><X size={21} /></button></div><div className="clima-mega-categories"><Link to="/servicos" onClick={() => setMenuOpen(false)}><Wrench size={23} /><span>Serviços<small>Instalação, manutenção e limpeza</small></span><ChevronRight size={15} /></Link>{categories.map(category => <Link key={category.id} to={`/categoria/${category.slug}`} onClick={() => setMenuOpen(false)}><CategoryIcon name={category.name} size={23} /><span>{category.name}<small>{category._count?.products ?? products.filter(product => product.categoryId === category.id).length} produtos</small></span><ChevronRight size={15} /></Link>)}</div><div className="clima-mega-bottom"><Link to="/catalogo" onClick={() => setMenuOpen(false)}>Ver todo o catálogo <ArrowRight size={16} /></Link><Link to="/orcamento" onClick={() => setMenuOpen(false)}>Meu orçamento</Link><Link to="/meus-pedidos" onClick={() => setMenuOpen(false)}>Minha conta e pedidos</Link></div></div></>}
      </header>

      <main>
        {servicesPage && <Suspense fallback={<p className="container clima-loading">Carregando serviços...</p>}><ServicesPage onAdd={add} /></Suspense>}
        {!catalog && !isProductPage && !favoritesPage && !quotePage && !servicesPage && <>
          <BannerCarousel settings={settings} />
          <section className="clima-benefits container" aria-label="Vantagens da Clima"><div><Truck /><span><strong>Frete sem adivinhação</strong><small>Cote as opções com seu CEP</small></span></div><div><ShieldCheck /><span><strong>Conta protegida</strong><small>Acompanhe seus pedidos</small></span></div><div><WhatsAppIcon /><span><strong>Conversa de especialista</strong><small>Atendimento pelo WhatsApp</small></span></div><div><MapPin /><span><strong>A Clima está por perto</strong><small>Conheça nosso projeto demonstrativo</small></span></div></section>

          {loading && <div className="container clima-loading">Preparando as vitrines da Clima...</div>}
          {error && <div className="container clima-empty"><p role="alert">{error}</p><button className="clima-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
          {!loading && !error && (() => {
            const used = new Set<number>()
            return settings.showcases.filter(showcase => showcase.active).map(showcase => {
              const candidates = showcase.mode === 'manual' ? showcase.productIds.flatMap(id => products.find(product => product.id === id) || []) : showcase.mode === 'pix' ? newest.filter(product => product.pixPrice !== null && Number(product.pixPrice) < Number(product.price)) : showcase.mode === 'bestsellers' ? metadata.bestSellerIds.flatMap(id => products.find(product => product.id === id) || []) : newest
              const list = candidates.filter(product => !used.has(product.id)).slice(0, 12)
              list.forEach(product => used.add(product.id))
              return <ProductCarousel key={showcase.id} showcase={showcase} products={list} onAdd={add} onInspect={inspect} />
            })
          })()}
          {settings.showCategories && categories.length > 0 && <section className="clima-category-section container"><div className="clima-section-heading"><div><span className="clima-eyebrow">ENCONTRE A SUA SOLUÇÃO</span><h2>Um caminho para cada projeto.</h2></div><Link to="/catalogo" className="clima-text-link">Todos os produtos <ArrowRight size={16} /></Link></div><div className="clima-category-tiles">{categories.map((category, index) => { const tile = settings.categoryTiles.find(item => item.categoryId === category.id); return <Link to={`/categoria/${category.slug}`} className={`clima-category-tile clima-category-tone-${index % 4}`} key={category.id}><span className="clima-category-count">{String(index + 1).padStart(2, '0')} / Clima</span><div className="clima-category-illustration">{tile?.imageUrl ? <img src={storefrontImageUrl(tile.imageUrl)} alt="" loading="lazy" /> : <CategoryIcon name={category.name} size={64} />}</div><span className="clima-category-label"><strong>{tile?.title || category.name}</strong><ArrowRight size={19} /></span></Link> })}</div></section>}
          <section className="clima-consult container"><div className="clima-consult-icon"><WhatsAppIcon size={36} /></div><div><span className="clima-eyebrow">QUEM ENTENDE, AJUDA A ESCOLHER</span><h2>Na dúvida, chama a Clima.</h2><p>Uma conversa rápida pode fazer a diferença no seu próximo serviço.</p></div><a href={store.whatsappUrl} className="clima-button" target="_blank" rel="noopener noreferrer">Falar com a equipe <ArrowRight size={18} /></a></section>
        </>}

        {catalog && <section className="clima-catalog container" id="produtos"><div className="clima-breadcrumb"><Link to="/">Início</Link><ChevronRight size={13} /><Link to="/catalogo">Catálogo</Link>{selectedCategory && <><ChevronRight size={13} /><span>{selectedCategory.name}</span></>}</div><div className="clima-catalog-title"><div><span className="clima-eyebrow">ENCONTRE O QUE PRECISA</span><h1>{slug ? selectedCategory?.name || 'Categoria não encontrada' : pixOnly ? 'Oportunidades no Pix' : search ? `Resultados para “${search}”` : 'Explore o catálogo Clima'}</h1><p>{loading ? 'Carregando...' : `${filtered.length} produto${filtered.length === 1 ? '' : 's'} encontrado${filtered.length === 1 ? '' : 's'}`}</p></div><div className="clima-catalog-controls"><button className="clima-filter-toggle" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen}><SlidersHorizontal size={17} /> Filtros</button><label>Ordenar por<select value={sort} onChange={event => setFilter('ordem', event.target.value)}><option value="recentes">Mais recentes</option><option value="menor-preco">Menor preço</option><option value="maior-preco">Maior preço</option><option value="nome">Nome: A–Z</option></select></label></div></div><div className="clima-catalog-layout"><aside className={`clima-filters ${filtersOpen ? 'open' : ''}`} aria-label="Filtros do catálogo"><div className="clima-filter-heading"><strong>Refine sua busca</strong><button onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros"><X size={18} /></button></div><fieldset><legend>Departamentos</legend><Link className={!slug ? 'selected' : ''} to="/catalogo">Todos os produtos</Link>{categories.map(category => <Link key={category.id} className={slug === category.slug ? 'selected' : ''} to={`/categoria/${category.slug}`}>{category.name}<span>{products.filter(product => product.categoryId === category.id).length}</span></Link>)}</fieldset><fieldset><legend>Faixa de preço no Pix</legend><div className="clima-price-inputs"><label>De R$<input type="number" min="0" step="0.01" value={min} onChange={event => setFilter('min', event.target.value)} placeholder="0,00" /></label><label>Até R$<input type="number" min="0" step="0.01" value={max} onChange={event => setFilter('max', event.target.value)} placeholder="Sem limite" /></label></div></fieldset><ProductTechnicalFilters products={products.filter(product => !slug || product.category.slug === slug)} filters={technicalFilters} onChange={(key, value) => setFilter(`tec_${key}`, value)} /><fieldset><legend>Disponibilidade</legend><label className="clima-check"><input type="checkbox" checked={stockOnly} onChange={event => setFilter('estoque', event.target.checked ? '1' : '')} /> Somente em estoque</label><label className="clima-check"><input type="checkbox" checked={pixOnly} onChange={event => setFilter('pix', event.target.checked ? '1' : '')} /> Preço especial no Pix</label></fieldset>{activeFilters && <Link to={slug ? `/categoria/${slug}` : '/catalogo'} className="clima-clear-filters">Limpar filtros</Link>}<a href={store.whatsappUrl} className="clima-filter-help" target="_blank" rel="noopener noreferrer"><CircleHelp size={24} /><strong>Não encontrou?</strong><span>A equipe Clima ajuda você.</span><b>Conversar no WhatsApp →</b></a></aside><div>{loading ? <div className="clima-loading">Carregando produtos...</div> : error ? <div className="clima-empty"><p role="alert">{error}</p><button className="clima-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : filtered.length === 0 ? <div className="clima-empty"><Package size={38} /><h2>Nenhum produto por aqui.</h2><p>Experimente outra categoria ou ajuste os filtros.</p><Link className="clima-button" to="/catalogo">Explorar todos os produtos</Link></div> : <div className="clima-catalog-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onAdd={add} onInspect={inspect} />)}</div>}</div></div></section>}

        {(isProductPage || favoritesPage || quotePage) && (loading ? <div className="container clima-loading">Carregando produtos...</div> : error ? <div className="container clima-empty"><p role="alert">{error}</p><button className="clima-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : quotePage ? <QuotePage products={products} /> : isProductPage ? (() => {
          const product = products.find(item => item.slug === productSlug)
          return product ? <ProductPage key={product.id} product={product} products={products} onAdd={add} onInspect={inspect} /> : <section className="container clima-empty"><Package size={38} /><h1>Produto indisponível</h1><p>Este produto não está mais no catálogo público.</p><Link to="/catalogo" className="clima-button">Explorar catálogo</Link></section>
        })() : <section className="container clima-favorites-page"><span className="clima-eyebrow">SUAS ESCOLHAS</span><h1>Produtos favoritos</h1><p>Salvos neste navegador para consultar depois. Preços e disponibilidade são atualizados ao abrir esta página.</p>{products.some(product => favoriteIds.includes(product.id)) ? <div className="clima-catalog-grid">{products.filter(product => favoriteIds.includes(product.id)).map(product => <ProductCard key={product.id} product={product} onAdd={add} onInspect={inspect} />)}</div> : <div className="clima-empty"><Heart size={38} /><h2>Salve suas próximas escolhas.</h2><p>Toque no coração de um produto para encontrá-lo aqui.</p><Link to="/catalogo" className="clima-button">Encontrar produtos</Link></div>}{favoriteIds.some(id => !products.some(product => product.id === id)) && <p role="status">Alguns favoritos estão indisponíveis e não aparecem no catálogo.</p>}</section>)}

      </main>

      <footer className="clima-footer" id="atendimento">
        <div className="container clima-footer-intro">
          <span className="clima-eyebrow">CLIMA STORE · REFRIGERAÇÃO E CLIMATIZAÇÃO</span>
          <h2>Seu próximo projeto começa aqui.</h2>
          <p>Encontre o que precisa e conte com uma equipe que entende do seu dia a dia.</p>
        </div>
        <div className="container clima-footer-grid">
          <div className="clima-footer-brand" id="sobre">
            <Link className="logo clima-brand" to="/" aria-label={store.name}>
              <StoreLogo /><span><strong>Clima <b>REFRIGERAÇÃO</b></strong><small>E CLIMATIZAÇÃO</small></span>
            </Link>
            <p>Soluções para quem trabalha com refrigeração e climatização. Produtos, atendimento e uma experiência de compra pensada para o seu projeto.</p>
            <a href={store.instagramUrl} className="clima-footer-social" target="_blank" rel="noopener noreferrer"><InstagramIcon size={22} /> Instagram da Clima</a>
          </div>
          <div>
            <h3>Explore a loja</h3>
            <Link to="/catalogo">Catálogo completo</Link>
            <Link to="/servicos">Serviços</Link>
            <Link to="/catalogo?pix=1">Oportunidades no Pix</Link>
            <Link to="/catalogo?ordem=recentes">Novidades</Link>
            <h3 className="clima-footer-account-title">Sua conta</h3>
            <Link to="/conta">Minha conta</Link>
            <Link to="/meus-pedidos">Acompanhar pedidos</Link>
            <Link to="/orcamento">Solicitar orçamento</Link><Link to="/cadastro">Criar uma conta</Link><Link to="/favoritos">Meus favoritos</Link>
          </div>
          <div className="clima-footer-location">
            <h3>Visite a Clima</h3>
            <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className="footer-address"><MapPin size={20} /><span>{store.address}</span></a>
            <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer">Como chegar <ArrowRight size={16} /></a>
            <h3 className="clima-footer-phone-title">Fale com a equipe</h3>
            <a href={store.whatsappUrl} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={22} /> {store.phone}</a>
            <a href={store.phoneUrl}><Phone size={18} /> Ligar para a loja</a>
          </div>
          <div className="clima-footer-faq" id="duvidas">
            <h3>Antes de comprar</h3>
            <details><summary>Como consultar o frete?</summary><p>Informe seu CEP no checkout, escolha uma das entregas disponíveis e confira o valor e o prazo antes de finalizar.</p></details>
            <details><summary>Como acompanhar meu pedido?</summary><p>Entre na sua conta e abra <Link to="/meus-pedidos">Meus pedidos</Link>. Para compras sem cadastro, use a confirmação no navegador da compra ou fale com a equipe.</p></details>
            <details><summary>Preciso de ajuda para escolher.</summary><p><a href={store.whatsappUrl} target="_blank" rel="noopener noreferrer">Converse com a Clima pelo WhatsApp</a> e tire suas dúvidas sobre os produtos.</p></details>
          </div>
        </div>
        <div className="clima-footer-bottom container">
          <span>© {new Date().getFullYear()} {store.name}</span>
          <span className="clima-footer-credit">Desenvolvido por <strong>Gabriel Alves</strong></span>
        </div>
      </footer>
      <CustomerCoupons /><a className="whatsapp-float clima-whatsapp-float" href={store.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Falar com ${store.name} pelo WhatsApp`}><WhatsAppIcon size={25} /></a>
      {!catalog && !isProductPage && !favoritesPage && !quotePage && !loading && !error && <PromotionPopup key={(settings.promotion ?? defaultStorefrontSettings.promotion).id} promotion={settings.promotion ?? defaultStorefrontSettings.promotion} />}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </div>
  )
}

export default Home

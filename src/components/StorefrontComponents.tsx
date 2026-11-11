import QuoteButton from './QuoteButton'
import { useFavorites } from '../hooks/useFavorites'
import { productImages } from '../../shared/productMedia'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ArrowRight, ChevronLeft, ChevronRight, Flame, Minus, Package, Plus, Settings, ShoppingCart, Snowflake, Trash2, Wrench, X, Zap } from 'lucide-react'
import type { Product } from '../context/cart'
import { useCart } from '../context/useCart'
import type { Banner, Showcase, StorefrontSettings } from '../../shared/storefront'
import { storefrontImageUrl } from '../utils/storefront'

const heroImage = '/clima-service-hero.jpg'

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function CategoryIcon({ name, size = 30 }: { name: string; size?: number }) {
  const normalized = name.toLowerCase()
  const Icon = /gás|gas|fluido/.test(normalized) ? Flame : /ferrament|instrument/.test(normalized) ? Wrench : /clima|^ar|condicionado/.test(normalized) ? Snowflake : /elétr|eletr/.test(normalized) ? Zap : /peça|peca|component/.test(normalized) ? Settings : Package
  return <Icon size={size} strokeWidth={1.5} />
}

export function BannerCarousel({ settings }: { settings: StorefrontSettings }) {
  const banners = settings.banners.filter(banner => banner.active)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    if (banners.length < 2 || paused || reduceMotion || !settings.autoplay) return
    const timer = window.setInterval(() => setIndex(current => (current + 1) % banners.length), settings.slideSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [banners.length, paused, reduceMotion, settings.autoplay, settings.slideSeconds])
  if (!banners.length) return null
  const current = index % banners.length
  const banner: Banner = banners[current]
  const navigate = (direction: number) => setIndex(value => (value + direction + banners.length) % banners.length)
  const button = <>{banner.buttonText}<ArrowRight size={18} /></>
  const external = banner.link.startsWith('https://')
  return (
    <section className="clima-hero container" aria-roledescription="carrossel" aria-label="Destaques da loja" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
      <div className="clima-hero-copy" key={banner.id}>
        <span className="clima-eyebrow"><i /> {banner.eyebrow}</span>
        <h1>{banner.title}</h1>
        <p>{banner.description}</p>
        {external || banner.link.startsWith('#') ? <a className="clima-button" href={banner.link} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{button}</a> : <Link className="clima-button" to={banner.link}>{button}</Link>}
        <div className="clima-hero-controls">
          <div className="clima-banner-dots" aria-label="Escolher destaque">{banners.map((item, position) => <button key={item.id} type="button" aria-label={`Exibir destaque ${position + 1}`} aria-pressed={current === position} className={current === position ? 'active' : ''} onClick={() => setIndex(position)} />)}</div>
          {banners.length > 1 && <div className="clima-arrow-controls"><button onClick={() => navigate(-1)} aria-label="Destaque anterior"><ChevronLeft size={19} /></button><span>{String(current + 1).padStart(2, '0')} / {String(banners.length).padStart(2, '0')}</span><button onClick={() => navigate(1)} aria-label="Próximo destaque"><ChevronRight size={19} /></button></div>}
        </div>
      </div>
      <div className={`clima-hero-visual clima-hero-tone-${current % 3}`}>
        <img key={banner.imageUrl || 'default'} src={storefrontImageUrl(banner.imageUrl) || heroImage} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = heroImage }} alt="" />
        <div className="clima-visual-orbit" />
        <div className="clima-hero-note"><span className="clima-note-symbol"><Snowflake size={24} /><Zap size={17} /></span><span><strong>Temperatura certa.</strong><small>Parceria em cada projeto.</small></span></div>
        <span className="clima-visual-caption">Clima • REFRIGERAÇÃO & CLIMATIZAÇÃO</span>
      </div>
    </section>
  )
}

export function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void; onInspect: (product: Product) => void }) {
  const { addToCart } = useCart()
  const { ids, toggle } = useFavorites()
  const normal = Number(product.price)
  const pix = product.pixPrice != null ? Number(product.pixPrice) : null
  const discount = pix !== null && pix < normal ? Math.round((1 - pix / normal) * 100) : 0
  return (
    <article className="product-card clima-product-card">
      <div className="clima-product-picture">
        {product.stock <= 0 ? <span className="clima-product-badge muted">Esgotado</span> : discount > 0 ? <span className="clima-product-badge">−{discount}% no Pix</span> : product.stock <= 5 ? <span className="clima-product-badge">Últimas unidades</span> : null}
        <Link className="clima-product-image-button" to={`/produto/${encodeURIComponent(product.slug)}`} aria-label={`Ver detalhes de ${product.name}`}><img src={storefrontImageUrl(product.imageUrl) || '/product-placeholder.svg'} alt={product.name} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/product-placeholder.svg' }} /></Link><button className="clima-favorite-button" type="button" aria-label={`${ids.includes(product.id) ? 'Remover dos' : 'Salvar nos'} favoritos: ${product.name}`} aria-pressed={ids.includes(product.id)} onClick={() => toggle(product.id)}><Heart size={19} fill={ids.includes(product.id) ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="clima-product-info">
        <span className="clima-product-category">{product.category.name}</span>
        <h3><Link to={`/produto/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h3>
        <div className="clima-price-area"><strong className="product-price">{money(normal)}</strong>{pix !== null && <span>{money(pix)} <small>no Pix</small></span>}</div>
        <small className="clima-product-shipping">Consulte o frete na página do produto</small>
        <button className="buy-button clima-add-button" disabled={product.stock <= 0} onClick={() => { addToCart(product); onAdd() }}>{product.stock <= 0 ? 'Indisponível' : 'Adicionar ao carrinho'}<ShoppingCart size={16} /></button><QuoteButton productId={product.id} />
      </div>
    </article>
  )
}

export function ProductCarousel({ showcase, products, onAdd, onInspect }: { showcase: Showcase; products: Product[]; onAdd: () => void; onInspect: (product: Product) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ start: true, end: true })
  const titleId = useId()
  useEffect(() => {
    const element = track.current
    if (!element) return
    const update = () => setPosition({ start: element.scrollLeft < 3, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 3 })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    return () => { observer.disconnect(); element.removeEventListener('scroll', update) }
  }, [products.length])
  if (!products.length) return null
  const scroll = (direction: number) => track.current?.scrollBy({ left: direction * track.current.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  return (
    <section className="clima-showcase container" aria-labelledby={titleId}>
      <div className="clima-section-heading"><div><span className="clima-eyebrow">VITRINE CLIMA STORE</span><h2 id={titleId}>{showcase.title}</h2><p>{showcase.subtitle}</p></div><div className="clima-showcase-actions"><Link to={showcase.mode === 'pix' ? '/catalogo?pix=1' : '/catalogo'}>Ver catálogo <ArrowRight size={15} /></Link><button disabled={position.start} aria-label={`Voltar produtos de ${showcase.title}`} onClick={() => scroll(-1)}><ChevronLeft size={20} /></button><button disabled={position.end} aria-label={`Avançar produtos de ${showcase.title}`} onClick={() => scroll(1)}><ChevronRight size={20} /></button></div></div>
      <div className="clima-product-track" ref={track} tabIndex={0} aria-label={showcase.title}>{products.map(product => <ProductCard key={product.id} product={product} onAdd={onAdd} onInspect={onInspect} />)}</div>
    </section>
  )
}

function StoreDialog({ title, variant, onClose, children }: { title: string; variant: 'cart' | 'product'; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [])
  return <dialog className={`clima-dialog clima-${variant}-dialog`} ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="clima-dialog-inner"><header><h2 id={titleId}>{title}</h2><button onClick={onClose} aria-label={variant === 'cart' ? 'Fechar carrinho' : 'Fechar detalhes'}><X size={22} /></button></header>{children}</div></dialog>
}

export function CartDrawer({ onClose }: { onClose: () => void }) {
  const { cart, cartTotal, increaseQuantity, decreaseQuantity, removeFromCart, clearCart } = useCart()
  return <StoreDialog title="Seu carrinho" variant="cart" onClose={onClose}><div className="clima-cart-items">{cart.length ? cart.map(item => <article className="clima-cart-item" key={item.product.id}><img src={storefrontImageUrl(item.product.imageUrl) || '/product-placeholder.svg'} alt={item.product.name} /><div><strong>{item.product.name}</strong><span>{money(Number(item.product.price))}</span><div className="clima-quantity"><button onClick={() => decreaseQuantity(item.product.id)} aria-label={`Diminuir quantidade de ${item.product.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => increaseQuantity(item.product.id)} disabled={item.quantity >= item.product.stock} aria-label={`Aumentar quantidade de ${item.product.name}`}><Plus size={14} /></button></div></div><button className="clima-remove" onClick={() => removeFromCart(item.product.id)} aria-label={`Remover ${item.product.name}`}><Trash2 size={17} /></button></article>) : <div className="clima-empty"><ShoppingCart size={40} /><h3>Seu carrinho está vazio.</h3><button className="clima-button" onClick={onClose}>Continuar explorando <ArrowRight size={16} /></button></div>}</div>{cart.length > 0 && <footer className="clima-cart-footer"><button onClick={clearCart} className="clima-clear-cart">Limpar carrinho</button><div><span>Subtotal</span><strong>{money(cartTotal)}</strong></div><p>Frete e preço conforme o pagamento no checkout.</p><Link to="/checkout" className="clima-button" onClick={onClose}>Finalizar compra <ArrowRight size={18} /></Link></footer>}</StoreDialog>
}

export function ProductImageGallery({ product }: { product: Product }) {
  const images = productImages(product)
  const photos = images.length ? images : ['/product-placeholder.svg']
  const [selected, setSelected] = useState(0)
  const current = selected % photos.length
  return <div className="clima-product-gallery" aria-label={`Fotos de ${product.name}`}>
    <div className="clima-gallery-main"><img src={storefrontImageUrl(photos[current])} alt={`${product.name} — foto ${current + 1} de ${photos.length}`} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/product-placeholder.svg' }} />
      {photos.length > 1 && <><button type="button" className="clima-gallery-prev" aria-label="Foto anterior" onClick={() => setSelected((current + photos.length - 1) % photos.length)}><ChevronLeft size={20} /></button><button type="button" className="clima-gallery-next" aria-label="Próxima foto" onClick={() => setSelected((current + 1) % photos.length)}><ChevronRight size={20} /></button></>}
    </div>
    {photos.length > 1 && <><span className="clima-gallery-count" aria-live="polite">Foto {current + 1} de {photos.length}</span><div className="clima-gallery-thumbnails">{photos.map((url, index) => <button type="button" key={url} aria-label={`Ver foto ${index + 1} de ${product.name}`} aria-pressed={current === index} onClick={() => setSelected(index)}><img src={storefrontImageUrl(url)} alt="" loading="lazy" /></button>)}</div></>}
  </div>
}

export function ProductDetails({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: () => void }) {
  const { addToCart } = useCart()
  return <StoreDialog title="Conheça o produto" variant="product" onClose={onClose}><div className="clima-product-detail"><ProductImageGallery key={product.id} product={product} /><div><span className="clima-eyebrow">{product.category.name}</span><h3>{product.name}</h3><small>SKU: {product.sku}</small><p>{product.description || 'Precisa de mais informações? Fale com nossa equipe pelo WhatsApp.'}</p><strong>{money(Number(product.price))}</strong>{product.pixPrice != null && <span className="clima-pix-detail">{money(Number(product.pixPrice))} no Pix</span>}<small>{product.stock > 0 ? `${product.stock} unidades em estoque` : 'Sem estoque no momento'}</small><button className="clima-button" disabled={product.stock <= 0} onClick={() => { addToCart(product); onClose(); onAdd() }}>Adicionar ao carrinho <ShoppingCart size={18} /></button></div></div></StoreDialog>
}

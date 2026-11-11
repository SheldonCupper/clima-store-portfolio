import ProductInfoTabs from './ProductInfoTabs'
import { attributeFields, readProductAttributes } from '../../shared/productAttributes'
import QuoteButton from './QuoteButton'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Share2, ShoppingCart, Truck } from 'lucide-react'
import type { Product } from '../context/cart'
import { useCart } from '../context/useCart'
import { useFavorites } from '../hooks/useFavorites'
import { ProductCarousel, ProductImageGallery } from './StorefrontComponents'
import { store } from '../config/store'

const money = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
type Quote = { id: string; name: string; company: string; price: number; deliveryTime: number | null }

export default function ProductPage({ product, products, onAdd, onInspect }: { product: Product; products: Product[]; onAdd: () => void; onInspect: (product: Product) => void }) {
  const { addToCart, cart } = useCart()
  const { ids, toggle } = useFavorites()
  const [quantity, setQuantity] = useState(1)
  const [cep, setCep] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('PIX')
  const [shipping, setShipping] = useState<{ request: string; quotes: Quote[]; error: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const request = JSON.stringify({ cep: cep.replace(/\D/g, ''), paymentMethod, items: [{ productId: product.id, quantity }] })
  const available = Math.max(0, product.stock - (cart.find(item => item.product.id === product.id)?.quantity || 0))
  const shownShipping = shipping?.request === request ? shipping : null
  useEffect(() => {
    document.title = `${product.name} | ${store.name}`
    window.scrollTo({ top: 0 })
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort(); document.title = store.name }
  }, [product.name])
  async function quote(event: FormEvent) {
    event.preventDefault()
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setBusy(true); setShipping(null)
    try {
      const response = await fetch('/api/shipping/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request, signal: active.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Não foi possível consultar a entrega.')
      if (!Array.isArray(data.quotes) || !data.quotes.length) throw new Error('Nenhuma entrega disponível para este CEP. Consulte a Clima.')
      if (!active.signal.aborted) setShipping({ request, quotes: data.quotes, error: '' })
    } catch (error) {
      if (!active.signal.aborted) setShipping({ request, quotes: [], error: error instanceof Error ? error.message : 'Não foi possível consultar o frete.' })
    } finally { if (!active.signal.aborted && mounted.current) setBusy(false) }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: product.name, url: location.href })
      else { await navigator.clipboard.writeText(location.href); setMessage('Link copiado!') }
    } catch { setMessage('Copie o endereço desta página para compartilhar o produto.') }
  }
  const related = products.filter(item => item.id !== product.id && item.categoryId === product.categoryId).slice(0, 8)
  const pixSavings = product.pixPrice != null ? Math.round(Number(product.price) * 100) - Math.round(Number(product.pixPrice) * 100) : 0
  const contact = `${store.whatsappUrl}?text=${encodeURIComponent(`Olá! Gostaria de informações sobre ${product.name} (SKU ${product.sku}). ${location.href}`)}`
  return <>
    <section className="container clima-product-page">
      <nav className="clima-breadcrumb" aria-label="Caminho do produto"><Link to="/">Início</Link><span>/</span><Link to={`/categoria/${product.category.slug}`}>{product.category.name}</Link><span>/</span><span>{product.name}</span></nav>
      <div className="clima-product-page-grid">
        <ProductImageGallery product={product} />
        <div className="clima-product-purchase">
          <span className="clima-eyebrow">{product.category.name}</span><h1>{product.name}</h1><p className="clima-muted">SKU: {product.sku}</p>
          <div className="clima-product-tools"><button type="button" aria-pressed={ids.includes(product.id)} onClick={() => toggle(product.id)}><Heart size={18} fill={ids.includes(product.id) ? 'currentColor' : 'none'} />{ids.includes(product.id) ? 'Salvo nos favoritos' : 'Salvar produto'}</button><button type="button" onClick={() => void share()}><Share2 size={18} />Compartilhar</button></div>
          <div className={`clima-detail-price${pixSavings > 0 ? ' clima-detail-price-pix' : ''}`}>
            {pixSavings > 0 ? <>
              <span className="clima-detail-price-label">À vista no Pix</span>
              <strong>{money(product.pixPrice!)}</strong>
              <span className="clima-detail-price-saving">Economize {money(pixSavings / 100)} no Pix</span>
              <span className="clima-detail-price-card">{money(product.price)} no cartão</span>
            </> : <><span className="clima-detail-price-label">Preço do produto</span><strong>{money(product.price)}</strong></>}
            <small>Frete não incluído. Confira o total antes de pagar.</small>
          </div>
          <p>{product.stock > 0 ? 'Disponível em estoque' : 'Indisponível no momento'}</p>
          {product.stock > 0 ? <div className="clima-purchase-actions"><label htmlFor="product-quantity">Quantidade<input id="product-quantity" type="number" min="1" max={Math.max(1, available)} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(Math.max(1, available), Math.floor(Number(event.target.value) || 1))))} /></label><button className="clima-button" disabled={available === 0 || quantity > available} onClick={() => { for (let i = 0; i < quantity; i++) addToCart(product); onAdd() }}><ShoppingCart size={18} />Adicionar ao carrinho</button></div> : <a className="clima-button" href={contact} target="_blank" rel="noopener noreferrer">Consultar reposição com a Clima</a>}
          {product.stock > 0 && available === 0 && <p role="status">As unidades disponíveis já estão no seu carrinho.</p>}
          {product.stock > 0 && <form className="clima-product-freight" onSubmit={event => void quote(event)}><h2><Truck size={20} />Entrega para o seu CEP</h2><div className="clima-freight-fields"><label htmlFor="product-cep">CEP<input id="product-cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={cep} maxLength={9} pattern="[0-9]{5}-[0-9]{3}" required onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 8); setCep(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits) }} /></label><label htmlFor="freight-payment">Pagamento<select id="freight-payment" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="PIX">Pix</option><option value="CREDIT_CARD">Cartão</option></select></label><button className="clima-button" disabled={busy}>{busy ? 'Consultando...' : 'Calcular'}</button></div><small>Consulta para {quantity} unidade(s). A entrega será escolhida e recalculada no checkout para o carrinho completo.</small>
          {shownShipping?.error && <p role="alert">{shownShipping.error}</p>}{shownShipping && shownShipping.quotes.length > 0 && <ul className="clima-freight-options">{shownShipping.quotes.map(item => <li key={item.id}><span><strong>{item.company} · {item.name}</strong><small>{item.deliveryTime == null ? 'Prazo a confirmar' : `Estimativa de ${item.deliveryTime} dia(s) útil(eis)`}</small></span><b>{money(item.price)}</b></li>)}</ul>}</form>}
          <QuoteButton productId={product.id} quantity={quantity} />
          <a className="clima-text-link" href={contact} target="_blank" rel="noopener noreferrer">Tirar dúvidas sobre este produto →</a><p className="clima-product-share-status" role="status" aria-live="polite">{message}</p>
        </div>
      </div>
      <ProductInfoTabs key={product.id} product={product}>
      <div className="clima-product-information"><section><h2>Sobre o produto</h2><p>{product.description || 'A descrição detalhada ainda não foi informada. Consulte a equipe Clima antes de comprar.'}</p></section><section><h2>Identificação e ficha técnica</h2><dl>{attributeFields.map(field => { const value = readProductAttributes(product.technicalAttributes)[field.key]; return value ? <div key={field.key}><dt>{field.label}</dt><dd>{value}</dd></div> : null })}<div><dt>Referência / SKU</dt><dd>{product.sku}</dd></div><div><dt>Categoria</dt><dd>{product.category.name}</dd></div>{product.gtin && <div><dt>Código de barras</dt><dd>{product.gtin}</dd></div>}</dl><p className="clima-muted">Para confirmar medidas do equipamento, tensão e compatibilidade, fale com a equipe. As medidas da embalagem usadas no frete não representam as medidas do produto.</p></section></div>
      </ProductInfoTabs>
    </section>
    {related.length > 0 && <ProductCarousel showcase={{ id: 'relacionados', active: true, title: 'Produtos relacionados', subtitle: 'Outros produtos para você conhecer.', mode: 'manual', productIds: [] }} products={related} onAdd={onAdd} onInspect={onInspect} />}
  </>
}

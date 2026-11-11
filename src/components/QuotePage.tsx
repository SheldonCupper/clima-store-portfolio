import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Copy, Trash2 } from 'lucide-react'
import { useQuote } from '../hooks/useQuote'
import { buildQuoteMessage, MAX_QUOTE_QUANTITY } from '../../shared/quoteRequest'
import type { Product } from '../context/cart'
import { store } from '../config/store'
import { storefrontImageUrl } from '../utils/storefront'
import { WhatsAppIcon } from './WhatsAppIcon'

export default function QuotePage({ products }: { products: Product[] }) {
  const { items, setQuantity, remove } = useQuote()
  const [notes, setNotes] = useState('')
  const [feedback, setFeedback] = useState('')
  const unavailable = items.some(item => !products.some(product => product.id === item.productId))
  const message = items.length && !unavailable ? buildQuoteMessage(items, products, window.location.origin, notes) : ''
  const whatsapp = new URL(store.whatsappUrl)
  whatsapp.searchParams.set('text', message)
  async function copy() {
    try { await navigator.clipboard.writeText(message); setFeedback('Solicitação copiada.') }
    catch { setFeedback('Selecione e copie a mensagem na prévia abaixo.') }
  }
  return <section className="container clima-quote-page"><span className="clima-eyebrow">CONVERSE COM A CLIMA STORE</span><h1>Seu orçamento</h1><p>Reúna até 20 produtos e escolha as quantidades. A equipe confirma preços, disponibilidade, frete e prazo pelo WhatsApp.</p>
    {!items.length ? <div className="clima-empty"><ClipboardList size={40} /><h2>Comece sua lista de orçamento.</h2><p>Use “Adicionar ao orçamento” nos produtos que deseja consultar.</p><Link className="clima-button" to="/catalogo">Explorar catálogo</Link></div> : <div className="clima-quote-layout"><div>
      <ul className="clima-quote-items">{items.map(item => {
        const product = products.find(product => product.id === item.productId)
        return <li key={item.productId} className="clima-quote-item">{product ? <><img src={storefrontImageUrl(product.imageUrl) || '/product-placeholder.svg'} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/product-placeholder.svg' }} /><div><Link to={`/produto/${encodeURIComponent(product.slug)}`}><strong>{product.name}</strong></Link><small>SKU: {product.sku}</small>{product.stock < item.quantity && <small>Quantidade sujeita à disponibilidade da Clima.</small>}<label htmlFor={`quote-quantity-${item.productId}`}>Quantidade solicitada<input id={`quote-quantity-${item.productId}`} type="number" min="1" max={MAX_QUOTE_QUANTITY} step="1" value={item.quantity} onChange={event => setQuantity(item.productId, Number(event.target.value))} /></label></div></> : <div><strong>Produto indisponível no catálogo</strong><p>Remova este item para continuar.</p></div>}<button type="button" className="clima-quote-remove" aria-label={`Remover do orçamento: ${product?.name || item.productId}`} onClick={() => remove(item.productId)}><Trash2 size={18} /></button></li>
      })}</ul><Link className="clima-text-link" to="/catalogo">← Adicionar mais produtos</Link></div>
      <aside className="clima-quote-summary"><h2>Solicitar atendimento</h2><p>Orçamento não é compra: nenhum pedido é criado, pagamento cobrado ou estoque reservado.</p><label htmlFor="quote-notes">Observações (opcional)<textarea id="quote-notes" maxLength={500} rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Modelo do equipamento, aplicação ou dúvidas sobre os produtos..." /></label><small>{notes.length}/500 caracteres</small>
      {unavailable ? <p role="alert">Remova os produtos indisponíveis para preparar a mensagem.</p> : <><a className="clima-button" href={whatsapp.href} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={20} />Abrir orçamento no WhatsApp</a><small>O WhatsApp abrirá com a mensagem pronta. Confira e toque em enviar para falar com a Clima.</small><button type="button" className="clima-quote-button" onClick={() => void copy()}><Copy size={16} />Copiar solicitação</button><details><summary>Conferir mensagem</summary><textarea aria-label="Mensagem do orçamento" readOnly rows={10} value={message} /></details></>}
      <p role="status" aria-live="polite">{feedback}</p></aside></div>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TicketPercent, X, RefreshCw, Copy, Check } from 'lucide-react'
import { useCustomer } from '../context/customer'
import './CustomerCoupons.css'

type Offer = { id: string; code: string; kind: string; value: string; minSubtotal: string; maxDiscount: string | null; expiresAt: string | null; firstPurchase: boolean; unavailable: string; saved: boolean }
const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function CustomerCoupons({ wallet = false }: { wallet?: boolean }) {
  const { customer } = useCustomer()
  const location = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [claims, setClaims] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError(''); setOffers([]); setClaims([])
      try {
        const urls = ['/api/coupons/available', ...(wallet && customer ? ['/api/customer/coupons'] : [])]
        const results = await Promise.all(urls.map(async url => {
          const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
          const data = await response.json()
          if (!response.ok || !Array.isArray(data.coupons)) throw new Error(data.error || 'Não foi possível carregar os cupons.')
          return data.coupons as Offer[]
        }))
        if (!controller.signal.aborted) { setOffers(results[0]); setClaims(results[1] ?? []) }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Não foi possível carregar os cupons.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [customer?.id, wallet, retry])
  useEffect(() => {
    if (!open || wallet) return
    const element = dialog.current
    if (!element) return
    element.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = previous }
  }, [open, wallet])
  async function redeem(offer: Offer) {
    setBusy(offer.id); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/customer/coupons/${encodeURIComponent(offer.id)}/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await response.json()
      if (!response.ok || !data.coupon?.saved) throw new Error(data.error || 'Não foi possível resgatar este cupom.')
      setOffers(current => current.map(item => item.id === offer.id ? data.coupon : item))
      setClaims(current => [data.coupon, ...current.filter(item => item.id !== offer.id)])
      setMessage(`Cupom ${offer.code} resgatado! Ele está em Meus cupons.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível resgatar.') }
    finally { setBusy('') }
  }
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setMessage(`Código ${code} copiado.`) }
    catch { setMessage(`Use o código ${code} no checkout.`) }
  }
  function cards(items: Offer[]) {
    return <div className="coupon-offers">{items.map(offer => <article className={`coupon-ticket${offer.unavailable ? ' unavailable' : ''}`} key={offer.id}>
      <div className="coupon-ticket-top"><TicketPercent size={25} /><strong>{offer.kind === 'PERCENT' ? `${Number(offer.value).toLocaleString('pt-BR')}%` : money(offer.value)} de desconto</strong>{offer.saved && <span><Check size={13} /> Resgatado</span>}</div>
      <code>{offer.code}</code>
      <p>{Number(offer.minSubtotal) > 0 ? `Em compras a partir de ${money(offer.minSubtotal)}.` : 'Sem compra mínima.'}{offer.maxDiscount && ` Desconto de até ${money(offer.maxDiscount)}.`}</p>
      {offer.firstPurchase && <p>Exclusivo para a primeira compra da conta.</p>}
      {offer.expiresAt && <small>Válido até {new Date(offer.expiresAt).toLocaleString('pt-BR')}</small>}
      {offer.unavailable ? <p className="coupon-unavailable">{offer.unavailable}</p> : <div className="coupon-actions">{!customer ? <Link className="coupon-primary" to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`}>Entrar para resgatar</Link> : !offer.saved ? <button type="button" className="coupon-primary" disabled={Boolean(busy)} onClick={() => void redeem(offer)}>{busy === offer.id ? 'Resgatando...' : 'Resgatar cupom'}</button> : <Link className="coupon-primary" to={`/checkout?cupom=${encodeURIComponent(offer.code)}`}>Usar no checkout</Link>}<button className="coupon-copy" type="button" onClick={() => void copy(offer.code)} aria-label={`Copiar código ${offer.code}`}><Copy size={15} /> Copiar</button></div>}
    </article>)}</div>
  }
  const content = <>
    <div className="coupon-section-heading"><div><span className="coupon-kicker">VANTAGENS DA CLIMA STORE</span><h2 id={wallet ? 'wallet-heading' : 'coupon-dialog-heading'}>{wallet ? 'Meus cupons' : 'Cupons para o seu projeto'}</h2></div>{wallet ? <button className="coupon-copy" type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} aria-label="Atualizar cupons"><RefreshCw size={17} /></button> : <button className="coupon-copy" type="button" onClick={() => setOpen(false)} aria-label="Fechar cupons"><X size={23} /></button>}</div>
    <p>Resgate e guarde na sua conta. Use um cupom por pedido; o frete fica separado. Condições e disponibilidade são conferidas na compra.</p>
    {error && <div role="alert"><p>{error}</p><button className="coupon-copy" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
    {message && <p className="coupon-feedback" role="status">{message}</p>}
    {loading ? <p>Carregando cupons...</p> : <>{wallet && <><h3>Cupons resgatados</h3>{claims.length ? cards(claims) : <p>Você ainda não resgatou um cupom.</p>}<h3>Disponíveis para resgatar</h3></>}{cards(offers.filter(item => !wallet || !item.saved))}{!offers.filter(item => !wallet || !item.saved).length && <p>Não há novas campanhas disponíveis no momento. Volte em breve!</p>}</>}
    {!wallet && customer && <Link className="coupon-wallet-link" to="/conta">Ver meus cupons e minha conta →</Link>}
  </>
  if (wallet) return <section className="coupon-wallet" aria-labelledby="wallet-heading">{content}</section>
  if (!open && (!offers.length || loading)) return null
  return <><button className="coupon-floating" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"><TicketPercent size={22} /><span>Cupons</span></button><dialog ref={dialog} className="coupon-dialog" aria-labelledby="coupon-dialog-heading" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>{content}</dialog></>
}

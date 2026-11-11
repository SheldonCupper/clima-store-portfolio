import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { safeStorefrontLink, type Promotion } from '../../shared/storefront'
import { storefrontImageUrl } from '../utils/storefront'
import './PromotionPopup.css'

// Mantém a frequência também quando o navegador bloqueia o armazenamento.
const viewed = new Map<string, number>()
function storageKey(promotion: Promotion) { return `clima-promotion:${promotion.frequency}:${promotion.id}` }
function wasViewed(promotion: Promotion) {
  const key = storageKey(promotion)
  let timestamp = viewed.get(key) || 0
  try { timestamp = Number((promotion.frequency === 'session' ? sessionStorage : localStorage).getItem(key)) || timestamp } catch { /* Usa a memória desta visita. */ }
  if (!timestamp) return false
  const interval = (promotion.frequency === 'weekly' ? 7 : 1) * 86400000
  return promotion.frequency === 'session' || Date.now() - timestamp < interval
}
function markViewed(promotion: Promotion) {
  const key = storageKey(promotion), timestamp = Date.now()
  viewed.set(key, timestamp)
  try { (promotion.frequency === 'session' ? sessionStorage : localStorage).setItem(key, String(timestamp)) } catch { /* A campanha continua funcionando sem armazenamento. */ }
}

export function PromotionDialog({ promotion, onClose, preview = false }: { promotion: Promotion; onClose: () => void; preview?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), descriptionId = useId()
  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { element.close(); document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll: true }) }
  }, [])
  const imageUrl = safeStorefrontLink(promotion.imageUrl, true) ? storefrontImageUrl(promotion.imageUrl) : ''
  const link = safeStorefrontLink(promotion.link) ? promotion.link : '/catalogo'
  const label = <>{promotion.buttonText}<ArrowRight size={18} aria-hidden="true" /></>
  return (
    <dialog ref={dialog} className="clima-promotion" aria-labelledby={titleId} aria-describedby={promotion.description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="clima-promotion-content">
        <button type="button" className="clima-promotion-close" aria-label="Fechar promoção" onClick={onClose} autoFocus><X size={22} /></button>
        {imageUrl && <img className="clima-promotion-image" src={imageUrl} alt="" />}
        <div className="clima-promotion-copy">
          <span className="clima-promotion-eyebrow">{preview ? 'PRÉVIA DA CAMPANHA' : 'ESPECIAL Clima'}</span>
          <h2 id={titleId}>{promotion.title}</h2>
          {promotion.description && <p id={descriptionId}>{promotion.description}</p>}
        </div>
        <div className="clima-promotion-actions">
          {preview ? <button type="button" className="clima-promotion-primary" onClick={onClose}>{label}</button> : link.startsWith('https://') ? <a href={link} className="clima-promotion-primary" onClick={onClose}>{label}</a> : <Link to={link} className="clima-promotion-primary" onClick={onClose}>{label}</Link>}
          <button type="button" className="clima-promotion-dismiss" onClick={onClose}>{promotion.dismissText}</button>
        </div>
      </div>
    </dialog>
  )
}

export default function PromotionPopup({ promotion }: { promotion: Promotion }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!promotion.active || wasViewed(promotion)) return
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      // Aguarda o cliente fechar o carrinho ou os detalhes de um produto.
      if (document.querySelector('dialog[open]') || document.visibilityState === 'hidden') { timer = setTimeout(show, 1000); return }
      if (wasViewed(promotion)) return
      markViewed(promotion)
      setOpen(true)
    }
    timer = setTimeout(show, promotion.delaySeconds * 1000)
    return () => clearTimeout(timer)
  }, [promotion])
  return open ? <PromotionDialog promotion={promotion} onClose={() => setOpen(false)} /> : null
}

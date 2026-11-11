import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import './CouponDeleteDialog.css'
export default function CouponDeleteDialog({ coupon, onClose, onDeleted }: { coupon: { id: string; code: string }; onClose: () => void; onDeleted: (id: string, message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current!, previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; element.showModal()
    return () => { element.close(); document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll: true }) }
  }, [])
  async function remove(event: FormEvent) {
    event.preventDefault(); if (saving || confirmation !== coupon.code) return
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/admin/coupons/${encodeURIComponent(coupon.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) }), data = await response.json()
      if (!response.ok || data.success !== true) throw Error(data.error || 'Não foi possível excluir o cupom.')
      onDeleted(coupon.id, data.message); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir cupom.'); setSaving(false) }
  }
  return <dialog ref={dialog} className="coupon-delete-dialog" aria-labelledby="coupon-delete-title" aria-describedby="coupon-delete-description" onCancel={event => { event.preventDefault(); if (!saving) onClose() }}><button type="button" className="coupon-delete-close" aria-label="Fechar exclusão" disabled={saving} onClick={onClose}><X size={20} /></button><Trash2 size={28} /><h2 id="coupon-delete-title">Excluir cupom {coupon.code}?</h2><p id="coupon-delete-description">O cupom sairá da lista e não poderá ser usado em novas compras, inclusive por quem já resgatou. Pedidos anteriores manterão seus valores e descontos.</p><p>{coupon.id === 'clima-welcome-first-purchase' ? 'O benefício de boas-vindas será desativado. Você poderá configurá-lo novamente nesta seção.' : 'Este código ficará reservado no histórico. Para uma nova campanha, crie outro código.'}</p><form onSubmit={event => void remove(event)}><label htmlFor="coupon-delete-confirm">Digite {coupon.code} para confirmar<input id="coupon-delete-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" maxLength={30} disabled={saving} autoFocus /></label>{error && <p className="admin-form-error" role="alert">{error}</p>}<div><button type="button" className="admin-secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="coupon-delete-button" disabled={saving || confirmation !== coupon.code}>{saving ? 'Excluindo...' : 'Excluir cupom'}</button></div></form></dialog>
}

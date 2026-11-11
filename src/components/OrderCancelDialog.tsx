import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
export type CancellationOrder = { id: number; status: string; paymentStatus: string; paymentReviewRequired?: boolean; total: string; refundRequest?: { status: string; amount: string; environment: string; createdAt: string; confirmedAt: string | null } | null }
type Preview = { id: number; total: string; paymentStatus: string; status: string; environment: string | null; refundPending: boolean }
export default function OrderCancelDialog({ orderId, onClose, onUpdate }: { orderId: number; onClose: () => void; onUpdate: (order: CancellationOrder) => void }) {
  const node = useRef<HTMLDialogElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { const dialog = node.current, overflow = document.body.style.overflow; dialog?.showModal(); document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; dialog?.close() } }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}/cancel-preview`, { signal: controller.signal, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível conferir o pedido.')
        if (data.id !== orderId || !/^\d+(?:\.\d{1,2})?$/.test(data.total) || !Number.isFinite(Number(data.total))) throw new Error('Resposta inválida. Atualize o pedido.')
        if (!controller.signal.aborted) setPreview(data)
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Não foi possível conferir o pedido.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); return () => controller.abort()
  }, [orderId])
  async function submit() {
    if (!preview || busy || confirmation !== 'CANCELAR') return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation, expectedTotal: preview.total }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Confira o pagamento antes de tentar novamente.')
      if (data.order?.id !== orderId || typeof data.pending !== 'boolean') throw new Error('Resposta inválida. Atualize o pedido para conferir o resultado.')
      onUpdate(data.order)
      if (!data.pending) { onClose(); return }
      setPreview({ ...preview, refundPending: true }); setMessage(data.message || 'Estorno registrado e aguardando confirmação. O estoque continua reservado.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Confira o resultado antes de tentar novamente.')
      // Atualiza apenas o registro local. Nunca repete uma chamada financeira automaticamente.
      try { const response = await fetch(`/api/admin/orders/${orderId}`, { cache: 'no-store' }); if (response.ok) { const current = await response.json(); if (current.id === orderId) onUpdate(current) } } catch { /* A conferência pode ser retomada depois. */ }
    } finally { setBusy(false) }
  }
  const paid = preview?.paymentStatus === 'APPROVED' || preview?.refundPending
  return <dialog ref={node} className="admin-bulk-dialog admin-cancel-dialog" aria-labelledby="cancel-order-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2 id="cancel-order-title">{preview?.refundPending ? 'Conferir estorno' : 'Cancelar pedido'} #{orderId}</h2><button type="button" aria-label="Fechar cancelamento" onClick={onClose} disabled={busy}><X size={21} /></button></header>
    {loading && <p>Conferindo o pedido...</p>}
    {preview && <><p><strong>Total do pedido: {Number(preview.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>{preview.environment && <p>Mercado Pago · {preview.environment === 'sandbox' ? 'Ambiente de teste — sem devolução de dinheiro real' : 'Produção — esta ação pode devolver dinheiro ao cliente'}</p>}
    <p>{paid ? 'Ao confirmar, você autoriza o reembolso integral do valor pago, incluindo o frete, para o meio de pagamento original pelo Mercado Pago.' : 'Ao confirmar, o sistema verifica o pagamento. Se houver valor aprovado, você autoriza o reembolso integral, incluindo o frete, pelo Mercado Pago.'}</p><p>O pedido só será cancelado e o estoque liberado após conferir o encerramento da cobrança ou o estorno integral. O prazo para o crédito aparecer para o cliente depende do meio de pagamento e do provedor.</p>
    <label className="admin-bulk-confirm">Digite CANCELAR para autorizar<input value={confirmation} onChange={event => setConfirmation(event.target.value.toUpperCase())} maxLength={8} autoComplete="off" spellCheck={false} disabled={busy} /></label></>}
    {error && <p role="alert" className="admin-form-error">{error}</p>}{message && <p role="status">{message}</p>}
    <footer><button type="button" className="admin-secondary-button" disabled={busy} onClick={onClose}>Fechar</button>{preview && <button type="button" className="admin-bulk-danger" disabled={busy || loading || confirmation !== 'CANCELAR'} onClick={() => void submit()}>{busy ? 'Conferindo no Mercado Pago...' : preview.refundPending ? 'Conferir estorno e concluir' : paid ? 'Confirmar cancelamento e estorno' : 'Confirmar cancelamento'}</button>}</footer>
  </dialog>
}

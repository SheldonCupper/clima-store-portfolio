import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
export type BulkAction = 'activate' | 'deactivate' | 'delete'
export type BulkProduct = { id: number; name: string; updatedAt: string; active: boolean }
export type BulkResult = { action: BulkAction; selected: number; affected: number; protectedCount: number; protectedProducts: { id: number; name: string }[] }
const verbs = { activate: 'Ativar', deactivate: 'Desativar', delete: 'Excluir' }
export default function ProductBulkDialog({ action, products, onCancel, onDone, onRefresh }: { action: BulkAction; products: BulkProduct[]; onCancel: () => void; onDone: (result: BulkResult) => void; onRefresh: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; const overflow = document.body.style.overflow; node?.showModal(); document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; node?.close() } }, [])
  async function submit() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/products/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, products: products.map(({ id, updatedAt }) => ({ id, updatedAt })), ...(action === 'delete' ? { confirmation } : {}) }) })
      const data = await response.json().catch(() => { throw new Error('Resposta inválida. Atualize a lista para conferir o resultado.') })
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Atualize a lista antes de tentar novamente.')
      if (data.action !== action || data.selected !== products.length || !Number.isInteger(data.affected) || data.affected < 0 || data.affected > products.length || !Number.isInteger(data.protectedCount) || !Array.isArray(data.protectedProducts)) throw new Error('Resposta inválida. Atualize a lista para conferir o resultado.')
      onDone(data)
    } catch (error) { setError(error instanceof Error ? error.message : 'Confira o catálogo antes de tentar novamente.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="admin-bulk-dialog" aria-labelledby="bulk-dialog-title" aria-describedby="bulk-dialog-description" onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <header><h2 id="bulk-dialog-title">{verbs[action]} {products.length} produto(s)?</h2><button type="button" aria-label="Fechar confirmação" disabled={busy} onClick={onCancel}><X size={21} /></button></header>
    <p id="bulk-dialog-description">{action === 'delete' ? 'A exclusão é permanente. Produtos vinculados a pedidos serão preservados para manter o histórico. Para retirar esses produtos da vitrine, use Desativar.' : action === 'activate' ? 'Os produtos selecionados ficarão ativos na loja, mantendo seus preços, estoque e demais dados.' : 'Os produtos selecionados sairão da vitrine e continuarão disponíveis no painel para edição e reativação.'}</p>
    <ul>{products.slice(0, 10).map(product => <li key={product.id}>{product.name}</li>)}</ul>{products.length > 10 && <p>E mais {products.length - 10} produto(s) selecionado(s).</p>}
    {action === 'delete' && <label className="admin-bulk-confirm">Digite EXCLUIR para confirmar<input value={confirmation} autoComplete="off" spellCheck={false} maxLength={7} onChange={event => setConfirmation(event.target.value.toUpperCase())} disabled={busy} /></label>}
    {error && <p role="alert" className="admin-form-error">{error}</p>}
    <footer><button type="button" className="admin-secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button>{error && <button type="button" className="admin-secondary-button" disabled={busy} onClick={onRefresh}>Fechar e atualizar lista</button>}<button type="button" className={action === 'delete' ? 'admin-bulk-danger' : 'admin-primary-button'} disabled={busy || (action === 'delete' && confirmation !== 'EXCLUIR')} onClick={() => void submit()}>{busy ? 'Processando...' : `${verbs[action]} produtos`}</button></footer>
  </dialog>
}

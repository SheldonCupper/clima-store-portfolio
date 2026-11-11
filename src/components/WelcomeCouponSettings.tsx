import { useEffect, useState, type FormEvent } from 'react'

type WelcomeCoupon = { id: string; code: string; kind: string; value: string; minSubtotal: string; maxDiscount: string | null; active: boolean; published?: boolean }
export function WelcomeCouponSettings({ coupon, onSaved, loading, busy = false, onToggle, onDelete }: { busy?: boolean; onToggle?: () => void; onDelete?: () => void; coupon?: WelcomeCoupon; onSaved: () => void; loading: boolean }) {
  const [form, setForm] = useState({ kind: 'PERCENT', value: '', minSubtotal: '0', maxDiscount: '', active: false, published: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { if (coupon) setForm({ kind: coupon.kind, value: String(coupon.value), minSubtotal: String(coupon.minSubtotal), maxDiscount: coupon.maxDiscount === null ? '' : String(coupon.maxDiscount), active: coupon.active, published: coupon.published === true }); else setForm({ kind: 'PERCENT', value: '', minSubtotal: '0', maxDiscount: '', active: false, published: false }) }, [coupon])
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/coupons/welcome', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.')
      setMessage('Benefício de primeira compra salvo.'); onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }
  return <form className="admin-form-card" onSubmit={event => void save(event)}><h2>Boas-vindas para novas contas</h2><p>Código fixo: <strong>BOASVINDAS</strong>. Escolha o desconto e ative quando estiver pronto. Vale na primeira compra da conta; pedidos em andamento também contam. Não acumula com outro cupom.</p><div className="admin-form-grid">
    <div className="admin-form-group"><label htmlFor="welcome-kind">Tipo do benefício</label><select id="welcome-kind" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}><option value="PERCENT">Porcentagem (%)</option><option value="FIXED">Valor fixo (R$)</option></select></div>
    <div className="admin-form-group"><label htmlFor="welcome-value">{form.kind === 'PERCENT' ? 'Desconto para conta nova (%)' : 'Desconto para conta nova (R$)'}</label><input id="welcome-value" required type="number" min="0.01" step="0.01" max={form.kind === 'PERCENT' ? 100 : 99999999.99} value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} /></div>
    <div className="admin-form-group"><label htmlFor="welcome-min">Compra mínima (R$)</label><input id="welcome-min" required type="number" min="0" step="0.01" value={form.minSubtotal} onChange={event => setForm({ ...form, minSubtotal: event.target.value })} /></div>
    <div className="admin-form-group"><label htmlFor="welcome-max">Desconto máximo (R$, opcional)</label><input id="welcome-max" type="number" min="0.01" step="0.01" value={form.maxDiscount} onChange={event => setForm({ ...form, maxDiscount: event.target.value })} /></div>
    <label className="admin-form-check admin-form-full"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Ativar benefício de boas-vindas</label><label className="admin-form-check admin-form-full"><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })} />Divulgar na loja e em Meus cupons</label>
  </div><p>O servidor verifica conta, e-mail e CPF para impedir repetição. Cancelamento confirmado pela loja libera a elegibilidade se não houver outra compra. Alterar o benefício preserva descontos de pedidos já criados.</p>{error && <p role="alert" className="admin-form-error">{error}</p>}{message && <p role="status">{message}</p>}<div className="admin-form-actions">{coupon && <><button type="button" className="admin-secondary-button" disabled={saving || loading || busy} onClick={onToggle}>{coupon.active ? 'Pausar boas-vindas' : 'Ativar boas-vindas'}</button><button type="button" className="coupon-delete-button" disabled={saving || loading || busy} onClick={onDelete}>Excluir boas-vindas</button></>}<button className="admin-primary-button" disabled={saving || loading || busy}>{saving ? 'Salvando...' : 'Salvar boas-vindas'}</button></div></form>
}

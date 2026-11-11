import CouponDeleteDialog from '../../components/CouponDeleteDialog'
import { WelcomeCouponSettings } from '../../components/WelcomeCouponSettings'
import { useEffect, useState, type FormEvent } from 'react'
import { TicketPercent } from 'lucide-react'
import { Link } from 'react-router-dom'

type Coupon = { id: string; code: string; kind: 'PERCENT' | 'FIXED'; value: string; minSubtotal: string; maxDiscount: string | null; active: boolean; published: boolean; startsAt: string | null; expiresAt: string | null; usageLimit: number | null; usedCount: number }
const blank = { code: '', kind: 'PERCENT', value: '', minSubtotal: '0', maxDiscount: '', usageLimit: '', startsAt: '', expiresAt: '', active: false, published: false }
const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data definida'

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [form, setForm] = useState(blank)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [deleting, setDeleting] = useState<Coupon | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setLoading(true); setError('')
        const response = await fetch('/api/admin/coupons', { signal: controller.signal, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'Não foi possível carregar os cupons.')
        setCoupons(data)
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Falha ao carregar cupons.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); return () => controller.abort()
  }, [retry])
  async function create(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true)
    try {
      const response = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, usageLimit: form.usageLimit ? Number(form.usageLimit) : null, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o cupom.')
      setCoupons(current => [data, ...current]); setForm(blank); setMessage(`Cupom ${data.code} criado${data.active ? ' e ativado' : ' como pausado'}.`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao criar cupom.') }
    finally { setSaving(false) }
  }
  async function toggle(coupon: Coupon, key: 'active' | 'published' = 'active') {
    setBusy(coupon.id); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: !coupon[key] }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o cupom.')
      setCoupons(current => current.map(item => item.id === coupon.id ? { ...item, [key]: !coupon[key] } : item)); setMessage(key === 'published' ? `Divulgação do cupom ${coupon.code} atualizada.` : `Cupom ${coupon.code} ${coupon.active ? 'pausado' : 'ativado'}.`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao atualizar cupom.') }
    finally { setBusy('') }
  }
  function field(key: keyof typeof form, value: string | boolean) { setForm(current => ({ ...current, [key]: value })) }
  return <div className="admin-page admin-coupon-page"><header className="admin-header"><div className="container admin-header-content"><div><span className="admin-kicker">CAMPANHAS DA CLIMA STORE</span><h1>Cupons de desconto</h1></div><Link className="admin-back-link" to="/">Ver loja</Link></div></header><main className="container admin-content">
    <p>Marque <strong>Divulgar na loja</strong> para mostrar a campanha no botão flutuante Cupons e em Meus cupons. Resgatar salva o código na conta, sem consumir uma utilização.</p><p>Um cupom por pedido, aplicado aos produtos após o preço no Pix. O frete permanece separado. As utilizações são reservadas ao criar o pedido e liberadas quando ele é cancelado pela loja.</p>
    {error && <p role="alert" className="admin-form-error">{error}</p>}{message && <p role="status" className="admin-coupon-message">{message}</p>}
    <WelcomeCouponSettings loading={loading} coupon={coupons.find(item => item.id === 'clima-welcome-first-purchase')} onSaved={() => setRetry(value => value + 1)} busy={Boolean(busy)} onToggle={() => { const coupon = coupons.find(item => item.id === 'clima-welcome-first-purchase'); if (coupon) void toggle(coupon) }} onDelete={() => { const coupon = coupons.find(item => item.id === 'clima-welcome-first-purchase'); if (coupon) setDeleting(coupon) }} />
    <form className="admin-form-card" onSubmit={event => void create(event)}><h2><TicketPercent size={22} /> Criar cupom</h2><div className="admin-form-grid">
      <div className="admin-form-group"><label htmlFor="coupon-code">Código</label><input id="coupon-code" required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,29}" value={form.code} onChange={event => field('code', event.target.value.toUpperCase())} placeholder="Ex.: CLIMA10" /></div>
      <div className="admin-form-group"><label htmlFor="coupon-kind">Tipo de desconto</label><select id="coupon-kind" value={form.kind} onChange={event => field('kind', event.target.value)}><option value="PERCENT">Porcentagem (%)</option><option value="FIXED">Valor fixo (R$)</option></select></div>
      <div className="admin-form-group"><label htmlFor="coupon-value">{form.kind === 'PERCENT' ? 'Porcentagem de desconto' : 'Desconto em reais'}</label><input id="coupon-value" required type="number" min="0.01" max={form.kind === 'PERCENT' ? 100 : 99999999.99} step="0.01" value={form.value} onChange={event => field('value', event.target.value)} /></div>
      <div className="admin-form-group"><label htmlFor="coupon-min">Compra mínima em produtos (R$)</label><input id="coupon-min" required type="number" min="0" max="99999999.99" step="0.01" value={form.minSubtotal} onChange={event => field('minSubtotal', event.target.value)} /></div>
      <div className="admin-form-group"><label htmlFor="coupon-max">Desconto máximo (R$, opcional)</label><input id="coupon-max" type="number" min="0.01" max="99999999.99" step="0.01" value={form.maxDiscount} onChange={event => field('maxDiscount', event.target.value)} placeholder="Sem teto adicional" /></div>
      <div className="admin-form-group"><label htmlFor="coupon-limit">Limite de utilizações (opcional)</label><input id="coupon-limit" type="number" min="1" max="1000000" step="1" value={form.usageLimit} onChange={event => field('usageLimit', event.target.value)} placeholder="Sem limite" /></div>
      <div className="admin-form-group"><label htmlFor="coupon-start">Início (opcional)</label><input id="coupon-start" type="datetime-local" value={form.startsAt} onChange={event => field('startsAt', event.target.value)} /></div>
      <div className="admin-form-group"><label htmlFor="coupon-end">Fim da validade (opcional)</label><input id="coupon-end" type="datetime-local" value={form.expiresAt} onChange={event => field('expiresAt', event.target.value)} /></div>
      <label className="admin-form-check admin-form-full"><input type="checkbox" checked={form.active} onChange={event => field('active', event.target.checked)} />Ativar cupom ao criar</label><label className="admin-form-check admin-form-full"><input type="checkbox" checked={form.published} onChange={event => field('published', event.target.checked)} />Divulgar na loja e na conta dos clientes</label>
    </div><p>Datas usam o horário deste aparelho. Para mudar as regras depois, pause o código e crie outro. O total final precisa ser de pelo menos R$ 1,00 para pagamento.</p><div className="admin-form-actions"><button className="admin-primary-button" disabled={saving || loading} type="submit">{saving ? 'Criando...' : 'Criar cupom'}</button></div></form>
    <section className="admin-coupon-list" aria-label="Cupons cadastrados"><h2>Cupons cadastrados</h2>{loading ? <p>Carregando cupons...</p> : <>{error && <button className="admin-secondary-button" onClick={() => setRetry(value => value + 1)}>Recarregar lista</button>}{!coupons.length && <p>Nenhum cupom criado ainda.</p>}<div className="admin-coupon-grid">{coupons.filter(coupon => coupon.id !== 'clima-welcome-first-purchase').map(coupon => <article className="admin-card admin-coupon-card" key={coupon.id}><h3>{coupon.code}</h3><strong>{coupon.kind === 'PERCENT' ? `${Number(coupon.value).toLocaleString('pt-BR')}%` : money(coupon.value)} de desconto</strong><p>Compra mínima: {money(coupon.minSubtotal)}<br />{coupon.maxDiscount && <>Desconto máximo: {money(coupon.maxDiscount)}<br /></>}Utilizações: {coupon.usedCount}{coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ' (sem limite)'}</p><p>Início: {date(coupon.startsAt)}<br />Fim: {date(coupon.expiresAt)}</p><p>{!coupon.active ? 'Pausado' : coupon.expiresAt && new Date(coupon.expiresAt) <= new Date() ? 'Expirado' : coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit ? 'Limite atingido' : coupon.startsAt && new Date(coupon.startsAt) > new Date() ? 'Agendado' : 'Ativo'}</p><p>{coupon.published ? 'Divulgação ligada · aparece quando estiver válido e ativo' : 'Não divulgado · disponível somente pelo código'}</p><div className="coupon-actions"><button type="button" className="admin-secondary-button" disabled={Boolean(busy)} onClick={() => void toggle(coupon, 'published')}>{coupon.published ? 'Ocultar divulgação' : 'Divulgar na loja'}</button><button type="button" className="admin-secondary-button" disabled={Boolean(busy)} onClick={() => void toggle(coupon)}>{busy === coupon.id ? 'Salvando...' : coupon.active ? 'Pausar cupom' : 'Ativar cupom'}</button><button type="button" className="coupon-delete-button" disabled={Boolean(busy)} onClick={() => setDeleting(coupon)} aria-label={`Excluir cupom ${coupon.code}`}>Excluir cupom</button></div></article>)}</div></>}</section>
    {deleting && <CouponDeleteDialog coupon={deleting} onClose={() => setDeleting(null)} onDeleted={(id, text) => { setCoupons(current => current.filter(coupon => coupon.id !== id)); setMessage(text); setError('') }} />}
  </main></div>
}

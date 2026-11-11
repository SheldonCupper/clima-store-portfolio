import { useEffect, useState } from 'react'
import { store } from '../config/store'

const labels: Record<string, string> = { PENDING: 'Aguardando pagamento', APPROVED: 'Pagamento aprovado', REFUSED: 'Pagamento recusado', CANCELED: 'Pagamento cancelado', REFUNDED: 'Pagamento reembolsado' }
export default function OrderPayment({ id, method, status, orderStatus, review, refreshOrder }: { id: number; method: string; status: string; orderStatus: string; review: boolean; refreshOrder: () => Promise<void> }) {
  const [config, setConfig] = useState<{ enabled: boolean; environment: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/payments/config', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error()
      const value = await response.json()
      if (!controller.signal.aborted) setConfig(value)
    }).catch(() => { if (!controller.signal.aborted) setConfig({ enabled: false, environment: 'sandbox' }) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!config?.enabled || ['APPROVED', 'REFUNDED'].includes(status) || orderStatus === 'CANCELED') return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshOrder().catch(() => {}) }, 15000)
    return () => window.clearInterval(timer)
  }, [config?.enabled, status, orderStatus, refreshOrder])
  async function action(check = false) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/orders/${id}/payment/${check ? 'refresh' : 'checkout'}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível processar o pagamento.')
      if (check) { await refreshOrder(); return }
      const target = new URL(data.url)
      if (target.protocol !== 'https:' || target.hostname !== 'www.mercadopago.com.br' || target.username || target.password || !target.pathname.startsWith('/checkout/')) throw new Error('Não foi possível abrir o pagamento.')
      window.location.assign(target.href)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível processar o pagamento.') }
    finally { setBusy(false) }
  }
  const payable = !review && orderStatus !== 'CANCELED' && !['APPROVED', 'REFUNDED'].includes(status)
  return <div className="order-payment-actions">
    <p>Forma: <strong>{method === 'PIX' ? 'Pix' : 'Cartão de crédito'}</strong></p>
    <p>Status: <strong>{labels[status] || 'Em conferência'}</strong></p>
    {review && <p role="status">Seu pagamento precisa de conferência pela equipe. Entre em contato com a loja.</p>}
    {config?.enabled && config.environment === 'sandbox' && <p className="order-payment-note">Pagamento em ambiente de teste.</p>}
    {config?.enabled && payable && <button className="order-back-button" data-mp-checkout-cta="checkout-pro" disabled={busy} onClick={() => void action()}>{busy ? 'Aguarde...' : 'Pagar com Mercado Pago'}</button>}
    {config?.enabled && orderStatus !== 'CANCELED' && <button className="order-payment-refresh" disabled={busy} onClick={() => void action(true)}>{busy ? 'Consultando...' : 'Atualizar pagamento'}</button>}
    {config && !config.enabled && payable && <p>Para combinar o pagamento, <a href={store.whatsappUrl} target="_blank" rel="noreferrer">fale com a loja pelo WhatsApp</a>.</p>}
    {error && <p className="order-payment-error" role="alert">{error}</p>}
  </div>
}

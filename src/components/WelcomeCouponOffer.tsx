import { useEffect, useState } from 'react'
export function WelcomeCouponOffer({ accountId, apply, currentCode }: { accountId?: number; apply: (code: string) => void; currentCode: string }) {
  const [offer, setOffer] = useState<{ code: string; kind: string; value: string; minSubtotal: string; maxDiscount: string | null } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (accountId) fetch('/api/coupons/welcome', { signal: controller.signal, cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (!controller.signal.aborted) setOffer(data?.coupon || null) }).catch(() => {})
    return () => controller.abort()
  }, [accountId])
  if (!offer || !accountId) return null
  const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return <div className="checkout-coupon"><strong>Boas-vindas à Clima!</strong><p>Use {offer.code}: {offer.kind === 'PERCENT' ? `${Number(offer.value)}%` : money(offer.value)} de desconto na primeira compra.{Number(offer.minSubtotal) > 0 && ` Compra mínima em produtos: ${money(offer.minSubtotal)}.`}{offer.maxDiscount && ` Desconto máximo: ${money(offer.maxDiscount)}.`}</p><button type="button" onClick={() => apply(offer.code)} disabled={currentCode === offer.code}> {currentCode === offer.code ? 'Boas-vindas selecionado' : 'Usar cupom de boas-vindas'}</button></div>
}

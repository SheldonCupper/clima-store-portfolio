import { useEffect, useState, type FormEvent } from 'react'
import { couponCode } from '../../shared/coupons'

type Result = { request: string; status: 'loading' | 'success' | 'error'; error: string; subtotal: number; discount: number; itemPrices: { productId: number; unitPrice: number }[] }
export function useCheckoutCoupon(items: { productId: number; quantity: number }[], paymentMethod: 'PIX' | 'CREDIT_CARD', initialCode = '') {
  const [input, setInput] = useState(initialCode)
  const [code, setCode] = useState(initialCode)
  const [inputError, setInputError] = useState('')
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  useEffect(() => { setInput(initialCode); setCode(initialCode) }, [initialCode])
  const canValidate = items.length > 0
  const request = JSON.stringify({ code, paymentMethod, items })
  const current = result?.request === request ? result : null
  useEffect(() => {
    const controller = new AbortController()
    async function validate() {
      setResult({ request, status: 'loading', error: '', subtotal: 0, discount: 0, itemPrices: [] })
      try {
        const response = await fetch('/api/coupons/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request, signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível validar o cupom.')
        if (data.code !== code || !Number.isFinite(data.discount) || !Number.isFinite(data.subtotal) || data.discount <= 0 || data.discount > data.subtotal || !Array.isArray(data.itemPrices)) throw new Error('Resposta de cupom inválida. Tente novamente.')
        if (!controller.signal.aborted) setResult({ request, status: 'success', error: '', subtotal: data.subtotal, discount: data.discount, itemPrices: data.itemPrices })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ request, status: 'error', error: error instanceof Error ? error.message : 'Não foi possível validar o cupom.', subtotal: 0, discount: 0, itemPrices: [] })
      }
    }
    if (code && canValidate) void validate()
    return () => controller.abort()
  }, [request, code, retry, canValidate])
  function select(value: string) {
    setInput(value); setCode(value); setInputError(''); setRetry(current => current + 1)
  }
  function apply(event: FormEvent) {
    event.preventDefault()
    try { const value = couponCode(input); setInputError(''); setInput(value); setCode(value); setRetry(current => current + 1) }
    catch (error) { setInputError(error instanceof Error ? error.message : 'Cupom inválido.') }
  }
  return {
    input, setInput, code, apply, select,
    remove() { setCode(''); setInput(''); setInputError('') },
    subtotal: code && current?.status === 'success' ? current.subtotal : null,
    discount: code && current?.status === 'success' ? current.discount : 0,
    itemPrices: code && current?.status === 'success' ? current.itemPrices : [],
    busy: Boolean(code && (!current || current.status === 'loading')),
    blocked: Boolean(code && current?.status !== 'success'),
    error: inputError || (code ? current?.error || '' : ''),
  }
}

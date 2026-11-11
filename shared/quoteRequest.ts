export type QuoteItem = { productId: number; quantity: number }
export const MAX_QUOTE_ITEMS = 20
export const MAX_QUOTE_QUANTITY = 9999
export function parseQuoteItems(value: unknown): QuoteItem[] {
  if (!Array.isArray(value)) return []
  const items = new Map<number, QuoteItem>()
  for (const raw of value.slice(0, MAX_QUOTE_ITEMS)) {
    if (!raw || !Number.isSafeInteger(raw.productId) || raw.productId <= 0 || !Number.isSafeInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > MAX_QUOTE_QUANTITY) continue
    items.set(raw.productId, { productId: raw.productId, quantity: raw.quantity })
  }
  return [...items.values()]
}
export function buildQuoteMessage(items: QuoteItem[], products: { id: number; name: string; sku: string; slug: string; stock: number }[], origin: string, notes: string) {
  if (!items.length || items.some(item => !products.some(product => product.id === item.productId))) throw new Error('Revise os produtos indisponíveis antes de enviar.')
  const clean = (value: string, limit: number) => value.replace(/[\r\n\t]/g, ' ').trim().slice(0, limit)
  const lines = items.map(item => {
    const product = products.find(product => product.id === item.productId)!
    const url = new URL(`/produto/${encodeURIComponent(product.slug)}`, origin).href
    return `${item.quantity} un. — ${clean(product.name, 120)}\nSKU: ${clean(product.sku, 60)}${product.stock <= 0 ? ' · Reposição a consultar' : ''}\n${url}`
  })
  return `Olá, Clima! Gostaria de um orçamento para:\n\n${lines.join('\n\n')}\n\n${notes.trim() ? `Observações: ${notes.trim().slice(0, 500)}\n\n` : ''}Por favor, confirmem preços, disponibilidade, frete e prazo. Esta solicitação não é um pedido confirmado.`
}

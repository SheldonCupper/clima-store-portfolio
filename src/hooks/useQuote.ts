import { useSyncExternalStore } from 'react'
import { MAX_QUOTE_ITEMS, MAX_QUOTE_QUANTITY, parseQuoteItems, type QuoteItem } from '../../shared/quoteRequest'
const key = 'clima-quote-v1'
const event = 'clima-quote-change'
let cache = ''
let snapshot: QuoteItem[] = []
function read() {
  let raw = ''
  try { raw = localStorage.getItem(key) || '' } catch { /* Mantém a lista na sessão. */ }
  if (raw !== cache) {
    cache = raw
    try { snapshot = parseQuoteItems(JSON.parse(raw || '[]')) } catch { snapshot = [] }
  }
  return snapshot
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback); window.addEventListener('storage', callback)
  return () => { window.removeEventListener(event, callback); window.removeEventListener('storage', callback) }
}
function write(items: QuoteItem[]) {
  snapshot = items
  try { localStorage.setItem(key, JSON.stringify(items)); cache = localStorage.getItem(key) || '' } catch { /* A solicitação segue disponível nesta sessão. */ }
  window.dispatchEvent(new Event(event))
}
export function useQuote() {
  const items = useSyncExternalStore(subscribe, read)
  return {
    items,
    add(productId: number, quantity = 1) {
      const current = read(), existing = current.find(item => item.productId === productId)
      if (!existing && current.length >= MAX_QUOTE_ITEMS) return false
      if (!Number.isSafeInteger(quantity) || quantity < 1) return false
      write(existing ? current.map(item => item.productId === productId ? { ...item, quantity: Math.min(MAX_QUOTE_QUANTITY, item.quantity + quantity) } : item) : [...current, { productId, quantity: Math.min(MAX_QUOTE_QUANTITY, quantity) }])
      return true
    },
    setQuantity(productId: number, quantity: number) {
      if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_QUOTE_QUANTITY) write(read().map(item => item.productId === productId ? { ...item, quantity } : item))
    },
    remove(productId: number) { write(read().filter(item => item.productId !== productId)) },
  }
}

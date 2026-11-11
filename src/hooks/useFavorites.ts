import { useSyncExternalStore } from 'react'

const key = 'clima-favorites-v1'
const eventName = 'clima-favorites-change'
let cached = ''
let snapshot: number[] = []
function read() {
  let raw = ''
  try { raw = localStorage.getItem(key) || '' } catch { /* Navegação com armazenamento bloqueado. */ }
  if (raw !== cached) {
    cached = raw
    try {
      const parsed: unknown = JSON.parse(raw || '[]')
      snapshot = Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 200) : []
    } catch { snapshot = [] }
  }
  return snapshot
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(eventName, callback)
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(eventName, callback) }
}
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, read)
  function toggle(id: number) {
    const current = read()
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id].slice(-200)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Mantém a seleção nesta sessão. */ }
    snapshot = next
    try { cached = localStorage.getItem(key) || '' } catch { cached = '' }
    window.dispatchEvent(new Event(eventName))
  }
  return { ids, toggle }
}

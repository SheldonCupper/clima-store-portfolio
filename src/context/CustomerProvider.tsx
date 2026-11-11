import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CustomerContext, type CustomerProfile } from './customer'

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<CustomerProfile | null>(null)
  const [checking, setChecking] = useState(true)
  const requestVersion = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)

  const cancelRefresh = useCallback(() => {
    requestVersion.current++
    activeRequest.current?.abort()
  }, [])

  const setCustomer = useCallback((profile: CustomerProfile | null) => {
    // Uma consulta iniciada antes do login/logout não pode sobrescrever a sessão nova.
    cancelRefresh()
    setCustomerState(profile)
    setChecking(false)
  }, [cancelRefresh])

  const refreshCustomer = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const version = ++requestVersion.current
    try {
      const response = await fetch('/api/customer/me', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      if (controller.signal.aborted || version !== requestVersion.current) return
      if (response.status === 401) {
        setCustomerState(null)
        return
      }
      const data = await response.json()
      if (!response.ok) throw new Error('Não foi possível atualizar sua conta.')
      if (!controller.signal.aborted && version === requestVersion.current) setCustomerState(data.customer)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (version === requestVersion.current) setChecking(false)
    }
  }, [])

  useEffect(() => {
    const refresh = () => { void refreshCustomer().catch(() => { /* Falhas temporárias preservam o perfil já carregado. */ }) }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelRefresh()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshCustomer, cancelRefresh])

  async function logout() {
    const response = await fetch('/api/customer/logout', { method: 'POST', credentials: 'include' })
    if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.')
    setCustomer(null)
  }

  return <CustomerContext.Provider value={{ customer, checking, setCustomer, refreshCustomer, logout }}>{children}</CustomerContext.Provider>
}

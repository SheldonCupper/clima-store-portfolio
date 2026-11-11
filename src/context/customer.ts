import { createContext, useContext } from 'react'

export type CustomerProfile = { emailVerificationRequired?: boolean; id: number; name: string; email: string; phone: string; cpf: string; emailVerifiedAt: string | null }
export const CustomerContext = createContext<{
  customer: CustomerProfile | null
  checking: boolean
  setCustomer: (customer: CustomerProfile | null) => void
  refreshCustomer: () => Promise<void>
  logout: () => Promise<void>
} | undefined>(undefined)

export function useCustomer() {
  const context = useContext(CustomerContext)
  if (!context) throw new Error('CustomerProvider ausente')
  return context
}

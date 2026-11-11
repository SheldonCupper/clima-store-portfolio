export type CustomerField = 'name' | 'email' | 'phone' | 'cpf'
export type CustomerErrors = Partial<Record<CustomerField, string>>

type CustomerInput = Record<CustomerField, string>

export function cpfDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits

  const local = digits.slice(2)
  const prefixLength = digits.length === 11 ? 5 : 4
  const suffix = local.length > prefixLength ? `-${local.slice(prefixLength)}` : ''
  return `${digits.slice(0, 2)} ${local.slice(0, prefixLength)}${suffix}`
}

export function checkoutCustomerErrors(value: unknown): CustomerErrors {
  const customer = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
  const errors: CustomerErrors = {}

  if (typeof customer.name !== 'string' || !customer.name.trim()) {
    errors.name = 'Informe seu nome completo.'
  }

  const email = typeof customer.email === 'string' ? customer.email.trim() : ''
  if (
    email.length > 254 ||
    !/^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9._-]+)?@gmail\.com$/i.test(email)
  ) {
    errors.email = 'Informe um e-mail válido terminado em @gmail.com.'
  }

  if (
    typeof customer.phone !== 'string' ||
    !/^[\d\s()-]+$/.test(customer.phone) ||
    !/^\d{10,11}$/.test(customer.phone.replace(/\D/g, ''))
  ) {
    errors.phone = 'Informe o telefone com DDD e 10 ou 11 números.'
  }

  if (typeof customer.cpf !== 'string' || !/^\d{11}$/.test(customer.cpf)) {
    errors.cpf = 'O CPF deve conter exatamente 11 números.'
  }

  return errors
}

export function normalizeCheckoutCustomer(customer: CustomerInput): CustomerInput {
  return {
    name: customer.name.trim(),
    email: customer.email.trim().toLowerCase(),
    phone: customer.phone.replace(/\D/g, ''),
    cpf: customer.cpf,
  }
}

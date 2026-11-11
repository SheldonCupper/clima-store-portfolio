export const attributeFields = [
  { key: 'warranty', label: 'Garantia informada pelo fabricante', placeholder: 'Ex.: prazo e condições confirmados na ficha do fabricante' },
  { key: 'brand', label: 'Marca', placeholder: 'Nome do fabricante' },
  { key: 'model', label: 'Modelo', placeholder: 'Referência do fabricante' },
  { key: 'voltage', label: 'Tensão', placeholder: 'Ex.: 220 V ou Bivolt' },
  { key: 'capacity', label: 'Capacidade', placeholder: 'Ex.: 12.000 BTU/h ou 7 CFM' },
  { key: 'application', label: 'Aplicação', placeholder: 'Ex.: Instalação de ar-condicionado' },
  { key: 'refrigerant', label: 'Tipo de gás', placeholder: 'Ex.: R410A' },
] as const
export type AttributeKey = typeof attributeFields[number]['key']
export type ProductAttributes = Partial<Record<AttributeKey, string>>

// Undefined preserva os dados em solicitações de versões anteriores do admin.
export function parseProductAttributes(value: unknown): ProductAttributes | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ficha técnica inválida.')
  const result: ProductAttributes = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!attributeFields.some(field => field.key === key) || typeof raw !== 'string' || raw.length > 120 || [...raw].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Use somente os campos técnicos disponíveis, com até 120 caracteres cada.')
    const text = raw.trim().replace(/\s+/g, ' ')
    if (text) result[key as AttributeKey] = text
  }
  return result
}
export function readProductAttributes(value: unknown): ProductAttributes {
  try { return parseProductAttributes(value) || {} } catch { return {} }
}
export function normalizeAttribute(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')
}
export function matchesAttributes(value: unknown, filters: ProductAttributes) {
  const attributes = readProductAttributes(value)
  return attributeFields.every(({ key }) => !filters[key] || normalizeAttribute(attributes[key] || '') === normalizeAttribute(filters[key]!))
}
export function attributeOptions(values: unknown[], key: AttributeKey) {
  const options = new Map<string, string>()
  for (const value of values) {
    const text = readProductAttributes(value)[key]
    if (text) options.set(normalizeAttribute(text), text)
  }
  return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
}

export const MAX_PRODUCT_IMAGES = 12

export function validGtin(value: string) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value)) return false
  let sum = 0
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(value[i]) * weight
  return (10 - sum % 10) % 10 === Number(value.at(-1))
}

export function parseProductGtin(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !validGtin(value)) throw new Error('Informe um código de barras GTIN válido, com 8, 12, 13 ou 14 dígitos.')
  return value
}

export function validProductImage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1500 || (value.includes('\\') || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127))) return false
  if (/^\/uploads\/[a-z0-9_.-]+$/i.test(value)) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}

export function parseProductImages(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_PRODUCT_IMAGES || !value.every(validProductImage)) throw new Error(`Envie até ${MAX_PRODUCT_IMAGES} fotos com endereço HTTPS ou do upload da loja.`)
  return [...new Set(value)]
}

export function productImages(product: { imageUrl?: string | null; imageUrls?: string[] }) {
  return [...new Set([product.imageUrl, ...(product.imageUrls || [])].filter((value): value is string => Boolean(value)))]
}

export type ProductMeasurementSuggestion = {
  gtin: string; name: string; brand: string; source: string
  sourceName?: string; rawWeight?: string; rawDimensions?: string
  dimensionValuesCm?: [number, number, number] | null
  measurements: { weightKg: number | null; heightCm: number | null; widthCm: number | null; lengthCm: number | null }
}

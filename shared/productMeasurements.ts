import type { ProductMeasurementSuggestion } from './productMedia'

const numberPattern = '(\\d+(?:[.,]\\d+)?)'
const unitPattern = '(kg|kgs|kilograms?|quilogramas?|g|gr|grams?|gramas?|mg|lb|lbs|pounds?|oz|ounces?|cm|centimeters?|centimetros?|mm|millimeters?|milimetros?|m|meters?|metros?|inches|inch|in|pol(?:egadas?)?|["″])'
function normalize(text: string) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
function numeric(value: string) {
  // Não interpreta separadores de milhar ou números ambíguos como decimais.
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(value)) return null
  const result = Number(value.replace(',', '.'))
  return Number.isFinite(result) && result > 0 ? result : null
}
function convert(value: string, unit: string, weight: boolean) {
  const amount = numeric(value)
  if (amount === null) return null
  const key = normalize(unit)
  let multiplier: number | undefined
  if (weight) {
    if (/^(kg|kgs|kilogram|quilograma)/.test(key)) multiplier = 1
    else if (/^(g|gr|gram|grama)$/.test(key) || /^grams|gramas/.test(key)) multiplier = .001
    else if (key === 'mg') multiplier = .000001
    else if (/^(lb|lbs|pound)/.test(key)) multiplier = .45359237
    else if (/^(oz|ounce)/.test(key)) multiplier = .028349523125
  } else {
    if (/^(cm|centimeter|centimetro)/.test(key)) multiplier = 1
    else if (/^(mm|millimeter|milimetro)/.test(key)) multiplier = .1
    else if (/^(m|meter|metro)$/.test(key) || /^(meters|metros)$/.test(key)) multiplier = 100
    else if (/^(inch|in$|pol)|^["″]$/.test(key)) multiplier = 2.54
  }
  if (multiplier === undefined) return null
  const result = amount * multiplier
  if (result > 100000) return null
  return weight ? Math.ceil(result * 1000 - 1e-9) / 1000 : Math.ceil(result - 1e-9)
}
export function parseWeight(text: string) {
  const match = normalize(text).trim().match(new RegExp(`^${numberPattern}\\s*${unitPattern}$`, 'i'))
  return match ? convert(match[1], match[2], true) : null
}
function field(text: string, labels: string, weight = false) {
  const match = normalize(text).match(new RegExp(`\\b(?:${labels})\\s*(?:\\(\\s*${unitPattern}\\s*\\))?\\s*[:=–-]?\\s*${numberPattern}\\s*${unitPattern}?(?=$|[\\s,;.)])`, 'i'))
  if (!match) return null
  const unit = match[3] || match[1]
  return unit ? convert(match[2], unit, weight) : null
}
export function parseLabeledMeasurements(text: string): ProductMeasurementSuggestion['measurements'] {
  return {
    weightKg: field(text, 'peso\\s+(?:bruto|embalado|com\\s+embalagem)|gross\\s+weight|shipping\\s+weight', true),
    heightCm: field(text, 'altura|height'), widthCm: field(text, 'largura|width'),
    lengthCm: field(text, 'comprimento|profundidade|length|depth'),
  }
}
export function parseDimensionTriplet(text: string): [number, number, number] | null {
  const match = normalize(text).trim().match(new RegExp(`^${numberPattern}\\s*[x×]\\s*${numberPattern}\\s*[x×]\\s*${numberPattern}\\s*${unitPattern}$`, 'i'))
  if (!match) return null
  const values = [match[1], match[2], match[3]].map(value => convert(value, match[4], false))
  return values.every((value): value is number => value !== null) ? values as [number, number, number] : null
}

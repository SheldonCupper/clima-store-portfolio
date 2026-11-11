import { attributeFields, attributeOptions, normalizeAttribute, type AttributeKey, type ProductAttributes } from '../../shared/productAttributes'
import type { Product } from '../context/cart'

export default function ProductTechnicalFilters({ products, filters, onChange }: { products: Product[]; filters: ProductAttributes; onChange: (key: AttributeKey, value: string) => void }) {
  const fields = attributeFields.filter(field => field.key !== 'model' && field.key !== 'warranty').map(field => ({ ...field, options: attributeOptions(products.map(product => product.technicalAttributes), field.key) })).filter(field => field.options.length || filters[field.key])
  if (!fields.length) return null
  return <fieldset className="clima-technical-filters"><legend>Características técnicas</legend>{fields.map(field => <label key={field.key} htmlFor={`filter-${field.key}`}>{field.label}<select id={`filter-${field.key}`} value={normalizeAttribute(filters[field.key] || '')} onChange={event => onChange(field.key, event.target.value)}><option value="">Todas as opções</option>{filters[field.key] && !field.options.some(([value]) => value === normalizeAttribute(filters[field.key]!)) && <option value={normalizeAttribute(filters[field.key]!)}>{filters[field.key]} (sem produtos)</option>}{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</fieldset>
}

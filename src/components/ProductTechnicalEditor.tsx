import { attributeFields, type ProductAttributes } from '../../shared/productAttributes'

export default function ProductTechnicalEditor({ value, onChange, disabled }: { value: ProductAttributes; onChange: (value: ProductAttributes) => void; disabled: boolean }) {
  return <fieldset className="admin-form-full clima-technical-editor" disabled={disabled}>
    <legend>Ficha técnica e filtros (opcional)</legend>
    <p>Preencha somente o que estiver na ficha do fabricante. Use a mesma escrita para produtos equivalentes. Os filtros aparecem automaticamente nas categorias com informações preenchidas.</p>
    <div className="admin-form-grid">{attributeFields.map(field => <div className="admin-form-group" key={field.key}><label htmlFor={`technical-${field.key}`}>{field.label}</label><input id={`technical-${field.key}`} maxLength={120} value={value[field.key] || ''} placeholder={field.placeholder} onChange={event => onChange({ ...value, [field.key]: event.target.value })} /></div>)}</div>
    <small>Capacidade deve incluir a unidade. Produtos sem essas informações continuam no catálogo e nos resultados sem filtro técnico.</small>
  </fieldset>
}

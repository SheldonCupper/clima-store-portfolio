import type { ProductAttributes } from '../../shared/productAttributes'

// Impede publicação silenciosa de uma ficha que um backend antigo descartaria.
export async function requireTechnicalAttributesSupport(attributes: ProductAttributes) {
  if (!Object.values(attributes).some(value => value?.trim())) return
  const response = await fetch('/api/admin/product-features', { cache: 'no-store', credentials: 'include' })
  const features = await response.json().catch(() => null)
  if (!response.ok || features?.technicalAttributes !== true) throw new Error('O servidor ainda não confirmou suporte à ficha técnica. Seus dados continuam no formulário; tente salvar novamente após a atualização do backend.')
}

type CatalogProduct = {
  name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[]
  weightKg?: number | null; heightCm?: number | null; widthCm?: number | null; lengthCm?: number | null
  category: { name: string }
}

export function catalogIssues(product: CatalogProduct): string[] {
  const issues: string[] = []
  if (/^(teste(?: produto)?|testado)$/i.test(product.name.trim())) issues.push('Cadastro de teste: mantenha inativo')
  if (!product.imageUrl && !product.imageUrls?.length) issues.push('Adicionar fotos reais')
  if ([product.imageUrl, ...(product.imageUrls || [])].some(url => url && /images\.unsplash\.com|placehold\.co/.test(url))) issues.push('Substituir imagem ilustrativa pela foto do produto')
  if (!product.description || product.description.trim().length < 60) issues.push('Completar descrição e compatibilidade com a ficha do fornecedor')
  if (![product.weightKg, product.heightCm, product.widthCm, product.lengthCm].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) issues.push('Conferir peso e medidas da embalagem para o frete')
  if (/^teste$/i.test(product.category.name.trim())) issues.push('Escolher uma categoria do catálogo')
  return issues
}

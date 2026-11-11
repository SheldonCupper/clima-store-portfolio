import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogIssues } from '../../shared/catalogQuality'

test('identifica demo, categoria de teste, imagem ilustrativa e medidas ausentes', () => {
  const issues = catalogIssues({ name: 'Teste Produto', description: 'teste', imageUrl: 'https://images.unsplash.com/photo-demo', category: { name: 'teste' } })
  assert.equal(issues.length, 5)
  assert.ok(issues.some(issue => issue.includes('inativo')))
})
test('cadastro completo não recebe pendências automáticas e valores inválidos não contam como medidas', () => {
  const product = { name: 'Equipamento modelo A', description: 'Descrição do fabricante com identificação e compatibilidade para revisão pela equipe da loja.', imageUrl: '/uploads/produto.webp', weightKg: 1.2, heightCm: 20, widthCm: 30, lengthCm: 40, category: { name: 'Ferramentas' } }
  assert.deepEqual(catalogIssues(product), [])
  assert.ok(catalogIssues({ ...product, weightKg: NaN }).some(issue => issue.includes('embalagem')))
})

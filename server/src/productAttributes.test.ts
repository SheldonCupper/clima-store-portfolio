import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attributeOptions, matchesAttributes, parseProductAttributes, readProductAttributes } from '../../shared/productAttributes'
import { buildQuoteMessage, parseQuoteItems } from '../../shared/quoteRequest'

test('atributos opcionais preservam versões anteriores e validam limites e campos', () => {
  assert.equal(parseProductAttributes(undefined), undefined)
  assert.deepEqual(parseProductAttributes({ brand: '  Marca Clima  ', voltage: '', capacity: '7  CFM' }), { brand: 'Marca Clima', capacity: '7 CFM' })
  for (const invalid of [null, [], '220V', { invented: 'x' }, { brand: 42 }, { brand: 'x'.repeat(121) }, { brand: 'texto\nextra' }]) assert.throws(() => parseProductAttributes(invalid))
  assert.deepEqual(readProductAttributes(null), {})
})
test('filtros combinam características e não presumem ficha de produtos sem dados', () => {
  assert.equal(matchesAttributes({ brand: 'Clima', application: 'Instalação' }, { brand: 'clima', application: 'instalacao' }), true)
  assert.equal(matchesAttributes({ voltage: '220 V' }, { voltage: '127 V' }), false)
  assert.equal(matchesAttributes(undefined, { brand: 'Clima' }), false)
  assert.equal(matchesAttributes(undefined, {}), true)
  assert.deepEqual(attributeOptions([{ brand: 'Clima' }, { brand: 'clima' }, {}, { brand: 'Outra' }], 'brand'), [['clima', 'clima'], ['outra', 'Outra']])
})
test('lista de orçamento rejeita dados adulterados e limita itens e quantidades', () => {
  assert.deepEqual(parseQuoteItems([{ productId: 1, quantity: 2 }, { productId: 1, quantity: 3 }, { productId: 2, quantity: 0 }, { productId: '3', quantity: 2 }, { productId: 3, quantity: 1.5 }, { productId: 4, quantity: 10000 }]), [{ productId: 1, quantity: 3 }])
  assert.equal(parseQuoteItems(Array.from({ length: 25 }, (_, id) => ({ productId: id + 1, quantity: 1 }))).length, 20)
  assert.deepEqual(parseQuoteItems({}), [])
})
test('mensagem usa catálogo atual, IDs e quantidades sem confiar em preço armazenado', () => {
  const items = [{ productId: 1, quantity: 5 }]
  const products = [{ id: 1, name: 'Bomba\nClima', sku: 'B1', slug: 'bomba clima', stock: 0, price: 'R$ 0,01' }]
  const message = buildQuoteMessage(items, products, 'https://loja.example', 'Preciso para instalação.')
  assert.match(message, /5 un. — Bomba Clima/)
  assert.match(message, /Reposição a consultar/)
  assert.match(message, /https:\/\/loja.example\/produto\/bomba%20clima/)
  assert.match(message, /não é um pedido confirmado/)
  assert.doesNotMatch(message, /0,01/)
  assert.throws(() => buildQuoteMessage(items, [], 'https://loja.example', ''))
  assert.throws(() => buildQuoteMessage([], products, 'https://loja.example', ''))
})

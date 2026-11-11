import { Router } from 'express'
import { requireAdmin } from './auth'
import { authAttemptLimit } from './customerAuth'
import { validGtin, type ProductMeasurementSuggestion } from '../../shared/productMedia'
import { parseDimensionTriplet, parseLabeledMeasurements, parseWeight } from '../../shared/productMeasurements'

export class ProductLookupError extends Error { constructor(message: string, public status = 502) { super(message) } }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const label = (value: unknown, max = 600) => typeof value === 'string' ? value.slice(0, max) : ''
export function parseFreeProduct(body: unknown, gtin: string): ProductMeasurementSuggestion {
  const value = object(body)
  if (value.code !== 'OK' || !Array.isArray(value.items)) throw new ProductLookupError('A base gratuita retornou uma resposta inesperada.')
  const product = value.items.map(object).find(item => [item.ean, item.upc, item.gtin].some(code => typeof code === 'string' && validGtin(code) && code.padStart(14, '0') === gtin.padStart(14, '0')))
  if (!product) throw new ProductLookupError('Produto não encontrado na base gratuita. Use a ficha técnica ou preencha as medidas manualmente.', 404)
  const rawWeight = label(product.weight, 100), rawDimensions = label(product.dimension, 300)
  const measurements = parseLabeledMeasurements(rawDimensions)
  measurements.weightKg = parseWeight(rawWeight)
  return { gtin, name: label(product.title), brand: label(product.brand), sourceName: 'UPCitemdb', source: `https://www.upcitemdb.com/upc/${encodeURIComponent(gtin)}`, rawWeight, rawDimensions, dimensionValuesCm: parseDimensionTriplet(rawDimensions), measurements }
}

// Somente o endpoint gratuito: nenhuma chave, assinatura ou fallback pago.
const url = 'https://api.upcitemdb.com/prod/trial/lookup?upc='
export function createFreeLookup(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: ProductMeasurementSuggestion }>()
  const pending = new Map<string, Promise<ProductMeasurementSuggestion>>()
  let nextRequestAt = 0, active = false
  return async function lookup(gtin: string): Promise<ProductMeasurementSuggestion> {
    if (!validGtin(gtin)) throw new ProductLookupError('Código de barras inválido. Revise todos os números.', 400)
    const key = gtin.padStart(14, '0'), saved = cache.get(key)
    if (saved && saved.expires > Date.now()) return { ...saved.value, gtin }
    const existing = pending.get(key)
    if (existing) return { ...await existing, gtin }
    if (active || Date.now() < nextRequestAt) throw new ProductLookupError('Aguarde dez segundos entre consultas à base gratuita. Você também pode usar a ficha técnica.', 429)
    active = true; nextRequestAt = Date.now() + 10000
    const task = (async () => {
      let response: Response
      try { response = await fetcher(url + encodeURIComponent(gtin), { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) }) }
      catch { throw new ProductLookupError('A base gratuita está indisponível. Tente mais tarde ou use a ficha técnica.') }
      if (response.status === 429) {
        const retry = Number(response.headers.get('Retry-After'))
        nextRequestAt = Date.now() + Math.min(86400, Math.max(10, Number.isFinite(retry) ? retry : 60)) * 1000
        throw new ProductLookupError('Limite da base gratuita atingido. Aguarde ou use a ficha técnica; nenhuma cobrança será realizada.', 429)
      }
      if (response.status === 404) throw new ProductLookupError('Produto não encontrado na base gratuita. Use a ficha técnica.', 404)
      if (!response.ok) throw new ProductLookupError('Não foi possível consultar a base gratuita. Use a ficha técnica ou tente mais tarde.')
      let body: unknown
      try { body = await response.json() } catch { throw new ProductLookupError('A base gratuita retornou uma resposta inválida.') }
      const result = parseFreeProduct(body, gtin)
      if (cache.size >= 200) cache.delete(cache.keys().next().value!)
      cache.set(key, { value: result, expires: Date.now() + 15 * 60 * 1000 })
      return result
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key); active = false }
  }
}
export const lookupFreeProduct = createFreeLookup()
export const productLookupRouter = Router()
productLookupRouter.use('/admin/product-lookup', requireAdmin, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
productLookupRouter.get('/admin/product-lookup/config', (_req, res) => res.json({ enabled: true, provider: 'UPCitemdb', free: true }))
productLookupRouter.get('/admin/product-lookup', authAttemptLimit(30, 10 * 60 * 1000), async (req, res) => {
  try { return res.json(await lookupFreeProduct(typeof req.query.gtin === 'string' ? req.query.gtin : '')) }
  catch (error) { return res.status(error instanceof ProductLookupError ? error.status : 502).json({ error: error instanceof ProductLookupError ? error.message : 'Não foi possível consultar o produto.' }) }
})

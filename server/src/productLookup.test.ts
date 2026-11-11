import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, mock, test } from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { createFreeLookup, parseFreeProduct, productLookupRouter } from './productLookup'
import { parseDimensionTriplet, parseLabeledMeasurements, parseWeight } from '../../shared/productMeasurements'

const gtin = '0885909456017'
const item = { ean: gtin, upc: '885909456017', title: 'Produto de teste', brand: 'Marca', weight: '0.2 Pounds', dimension: '4.9 X 2.3 X 0.2 inches' }
const body = { code: 'OK', items: [item] }
const originalSecret = process.env.JWT_SECRET
beforeEach(() => { process.env.JWT_SECRET = 'segredo-ficticio-da-consulta-gratuita' })
afterEach(() => { mock.restoreAll(); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret })
const app = express(); app.use(cookieParser()); app.use('/api', productLookupRouter)
const server = app.listen(0, '127.0.0.1')
after(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())) })
async function call(path: string, admin = false) {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  return fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/product-lookup${path}`, { headers: admin ? { Cookie: `admin_token=${jwt.sign({ role: 'ADMIN', email: 'admin@example.com' }, process.env.JWT_SECRET!)}` } : {} })
}
test('consulta gratuita é restrita ao admin e não exige chave nem assinatura', async () => {
  assert.equal((await call('/config')).status, 401)
  assert.equal((await call('?gtin=' + gtin)).status, 401)
  assert.deepEqual(await (await call('/config', true)).json(), { enabled: true, provider: 'UPCitemdb', free: true })
  assert.equal((await call('?gtin=123', true)).status, 400)
})
test('leitor de ficha converte unidades e respeita identificação de peso bruto', () => {
  assert.deepEqual(parseLabeledMeasurements('Peso líquido: 750 g\nPeso bruto: 0,850 kg\nAltura: 20 cm\nLargura: 150 mm\nComprimento: 0,3 m'), { weightKg: .85, heightCm: 20, widthCm: 15, lengthCm: 30 })
  assert.deepEqual(parseLabeledMeasurements('Peso embalado (g): 900\nAltura (mm): 205\nWidth: 21 cm\nDepth: 30 cm'), { weightKg: .9, heightCm: 21, widthCm: 21, lengthCm: 30 })
  assert.equal(parseWeight('0.2 Pounds'), .091)
  assert.equal(parseWeight('8 oz'), .227)
  assert.deepEqual(parseDimensionTriplet('4.9 X 2.3 X 0.2 inches'), [13, 6, 1])
})
test('não estima peso líquido, unidade ausente, valores negativos ou separador ambíguo', () => {
  assert.deepEqual(parseLabeledMeasurements('Peso líquido: 10 kg\nPeso: 20 kg\nAltura: 20\nLargura: -10 cm\nComprimento: 15 bananas'), { weightKg: null, heightCm: null, widthCm: null, lengthCm: null })
  for (const value of ['1.000 g', '1,000 kg', '1,234.56 g', '0 kg', '-2 kg', '200', '9999999 kg']) assert.equal(parseWeight(value), null)
  assert.equal(parseDimensionTriplet('10 x 20 x 30'), null)
  assert.equal(parseDimensionTriplet('tamanho M'), null)
})
test('dimensões sem eixos só fornecem três valores para conferência explícita no painel', () => {
  const result = parseFreeProduct(body, gtin)
  assert.deepEqual(result.measurements, { weightKg: .091, heightCm: null, widthCm: null, lengthCm: null })
  assert.deepEqual(result.dimensionValuesCm, [13, 6, 1])
  assert.equal(result.sourceName, 'UPCitemdb')
  assert.equal(result.rawWeight, '0.2 Pounds')
})
test('dados ausentes e produto/código divergentes não viram valores inventados', () => {
  assert.deepEqual(parseFreeProduct({ code: 'OK', items: [{ ean: gtin }] }, gtin).measurements, { weightKg: null, heightCm: null, widthCm: null, lengthCm: null })
  assert.throws(() => parseFreeProduct({ code: 'OK', items: [] }, gtin), /não encontrado/)
  assert.throws(() => parseFreeProduct(body, '7890830766152'), /não encontrado/)
  assert.throws(() => parseFreeProduct({ items: [] }, gtin), /inesperada/)
})
test('usa apenas endpoint gratuito, sem cabeçalho de autenticação e mantém cache temporário', async () => {
  let calls = 0
  const lookup = createFreeLookup((async (input: string | URL | Request, init: RequestInit) => {
    calls++; assert.equal(String(input), 'https://api.upcitemdb.com/prod/trial/lookup?upc=' + gtin)
    assert.deepEqual(init.headers, { Accept: 'application/json' }); assert.equal(init.redirect, 'error')
    return Response.json(body)
  }) as typeof fetch)
  assert.equal((await lookup(gtin)).name, item.title)
  assert.equal((await lookup('885909456017')).gtin, '885909456017')
  assert.equal(calls, 1)
  await assert.rejects(lookup('7890830766152'), /dez segundos/)
})
test('limite externo é tratado sem nova tentativa paga e respeita Retry-After', async () => {
  let calls = 0
  const lookup = createFreeLookup((async () => { calls++; return Response.json({ message: 'corpo privado do provedor' }, { status: 429, headers: { 'Retry-After': '600' } }) }) as typeof fetch)
  await assert.rejects(lookup(gtin), /nenhuma cobrança/)
  await assert.rejects(lookup(gtin), /Aguarde/)
  assert.equal(calls, 1)
})
test('GTIN inválido, falha de rede e JSON inválido não expõem resposta bruta', async () => {
  let calls = 0
  const lookup = createFreeLookup((async () => { calls++; throw Error('segredo-interno') }) as typeof fetch)
  await assert.rejects(lookup('123'), /inválido/); assert.equal(calls, 0)
  await assert.rejects(lookup(gtin), /indisponível/)
  const invalid = createFreeLookup((async () => new Response('conteudo-privado')) as typeof fetch)
  await assert.rejects(invalid(gtin), /resposta inválida/)
})
test('consulta realista respeita janela de dez segundos e expiração do cache', async () => {
  let time = 100000, calls = 0
  mock.method(Date, 'now', () => time)
  const lookup = createFreeLookup((async () => { calls++; return Response.json(body) }) as typeof fetch)
  await lookup(gtin); time += 1000; await lookup(gtin); assert.equal(calls, 1)
  time += 15 * 60 * 1000; await lookup(gtin); assert.equal(calls, 2)
})

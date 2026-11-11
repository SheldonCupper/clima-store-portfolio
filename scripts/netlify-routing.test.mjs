import assert from 'node:assert/strict'
import { test } from 'node:test'
import { netlifyRouting } from './netlify-routing.mjs'
import { handler } from '../netlify/functions/backend-unavailable.mjs'

test('sem backend, a API fica indisponível explicitamente e a SPA mantém rotas internas', async () => {
  const rules = netlifyRouting().trim().split('\n')
  assert.match(rules[0], /^\/api\/\* \/\.netlify\/functions\/backend-unavailable 200!$/)
  assert.match(rules[1], /^\/uploads\/\* \/\.netlify\/functions\/backend-unavailable 200!$/)
  assert.equal(rules.at(-1), '/* /index.html 200')
  const response = await handler()
  assert.equal(response.statusCode, 503)
  assert.equal(response.headers['Cache-Control'], 'no-store')
  assert.equal(typeof JSON.parse(response.body).error, 'string')
})

test('backend público preserva caminhos da API e imagens, antes da regra da SPA', () => {
  const rules = netlifyRouting(' https://api.example.com/ ').trim().split('\n')
  assert.equal(rules[0], '/api/* https://api.example.com/api/:splat 200!')
  assert.equal(rules[1], '/uploads/* https://api.example.com/uploads/:splat 200!')
  assert.equal(rules.at(-1), '/* /index.html 200')
})

test('configuração inválida não gera proxy para localhost, HTTP, credenciais ou caminhos', () => {
  for (const value of ['invalido', 'http://api.example.com', 'https://localhost:3001', 'https://127.0.0.1', 'https://[::1]', 'https://api.localhost', 'https://user:password@api.example.com', 'https://api.example.com/api', 'https://api.example.com/?secret=1', 'https://api.example.com/#hash']) assert.throws(() => netlifyRouting(value), /BACKEND_URL/)
})

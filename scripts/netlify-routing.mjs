import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function netlifyRouting(backendUrl = '') {
  let target = '/.netlify/functions/backend-unavailable'
  if (backendUrl.trim()) {
    let url
    try { url = new URL(backendUrl.trim()) } catch { throw new Error('BACKEND_URL deve ser a origem HTTPS pública do backend.') }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('BACKEND_URL deve ser a origem HTTPS pública, sem caminho, credenciais ou parâmetros.')
    target = url.origin
  }
  const backend = target.startsWith('https://')
  return [
    `/api/* ${target}${backend ? '/api/:splat' : ''} 200!`,
    `/uploads/* ${target}${backend ? '/uploads/:splat' : ''} 200!`,
    '/* /index.html 200',
    '',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.env.BACKEND_URL || ''
  await writeFile(new URL('../dist/_redirects', import.meta.url), netlifyRouting(backendUrl))
  console.log(backendUrl.trim() ? 'Rotas Netlify: API e uploads encaminhados ao backend HTTPS.' : 'Prévia visual: BACKEND_URL ausente. API retorna 503 até conectar o backend; nenhum dado é simulado.')
}

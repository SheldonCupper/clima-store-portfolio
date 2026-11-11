// Resposta explícita para a prévia visual enquanto não há backend publicado.
export const handler = async () => ({
  statusCode: 503,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ error: 'Serviço temporariamente indisponível. Tente novamente mais tarde.' }),
})

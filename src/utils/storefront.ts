export function storefrontImageUrl(value: string | null | undefined) {
  if (!value) return ''
  // Fotos antigas podem ter sido salvas com a URL do servidor local.
  // Resolve pelo proxy sem precisar alterar registros no banco.
  try {
    const url = new URL(value)
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname.startsWith('/uploads/')) return url.pathname
  } catch { /* Caminhos relativos e URLs externas são mantidos. */ }
  return value
}

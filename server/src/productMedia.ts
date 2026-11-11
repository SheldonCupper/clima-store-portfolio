import { parseProductImages, productImages, validProductImage } from '../../shared/productMedia'

function image(value: unknown) {
  if (value === null || value === '') return null
  if (validProductImage(value)) return value
  if (typeof value === 'string') {
    try {
      const url = new URL(value)
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && validProductImage(url.pathname) && url.pathname.startsWith('/uploads/')) return url.pathname
    } catch { /* Será rejeitado abaixo. */ }
  }
  throw new Error('Use uma foto enviada pela loja ou um endereço HTTPS válido.')
}

export function productMediaUpdate(input: { imageUrl?: unknown; imageUrls?: unknown }, current?: { imageUrl?: string | null; imageUrls?: string[] }) {
  const images = parseProductImages(input.imageUrls)
  if (images !== undefined) return { imageUrl: images[0] || null, imageUrls: images }
  if (current && (input.imageUrl === undefined || input.imageUrl === current.imageUrl)) return {}
  const cover = input.imageUrl === undefined ? null : image(input.imageUrl)
  const gallery = cover ? [cover, ...productImages(current || {}).filter(url => url !== current?.imageUrl && url !== cover)] : []
  return { imageUrl: cover, imageUrls: parseProductImages(gallery)! }
}

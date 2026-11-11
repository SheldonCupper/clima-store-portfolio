import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_PRODUCT_IMAGES, validProductImage } from '../../shared/productMedia'
import { storefrontImageUrl } from '../utils/storefront'

export type ProductPhoto = { id: string; url: string; file?: File; uploadedUrl?: string }
export function useProductPhotos() {
  const [photos, setPhotos] = useState<ProductPhoto[]>([])
  const [error, setError] = useState('')
  const previews = useRef(new Set<string>())
  useEffect(() => { const urls = previews.current; return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() } }, [])
  const setExisting = useCallback((urls: string[]) => { setPhotos([...new Set(urls)].map(url => ({ id: crypto.randomUUID(), url: storefrontImageUrl(url) }))) }, [])
  function add(files: FileList | null) {
    if (!files?.length) return
    setError('')
    const list = Array.from(files)
    if (photos.length + list.length > MAX_PRODUCT_IMAGES) { setError(`Você pode adicionar até ${MAX_PRODUCT_IMAGES} fotos por produto.`); return }
    if (list.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Envie JPG, PNG ou WEBP de até 5 MB por foto.'); return }
    const added = list.map(file => { const url = URL.createObjectURL(file); previews.current.add(url); return { id: crypto.randomUUID(), url, file } })
    setPhotos(current => [...current, ...added])
  }
  function remove(id: string) {
    const photo = photos.find(item => item.id === id)
    if (photo && previews.current.has(photo.url)) { URL.revokeObjectURL(photo.url); previews.current.delete(photo.url) }
    setPhotos(current => current.filter(item => item.id !== id)); setError('')
  }
  function move(id: string, target: number) {
    setPhotos(current => {
      const index = current.findIndex(item => item.id === id)
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]; const [photo] = next.splice(index, 1); next.splice(target, 0, photo); return next
    })
  }
  async function upload() {
    if (photos.length > 1) {
      const response = await fetch('/api/admin/product-features', { credentials: 'include', cache: 'no-store' })
      if (!response.ok || (await response.json()).gallery !== true) throw new Error('O servidor ainda não permite várias fotos. Atualize o backend antes de salvar a galeria.')
    }
    const result: string[] = []
    for (const photo of photos) {
      if (!photo.file || photo.uploadedUrl) { result.push(photo.uploadedUrl || photo.url); continue }
      const data = new FormData(); data.append('image', photo.file)
      const response = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: data })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Não foi possível enviar uma das fotos.')
      if (typeof body.imageUrl !== 'string') throw new Error('O envio da foto não retornou um endereço válido.')
      const url = new URL(body.imageUrl, window.location.origin).pathname
      if (!validProductImage(url) || !url.startsWith('/uploads/')) throw new Error('O envio da foto retornou um endereço inválido.')
      setPhotos(current => current.map(item => item.id === photo.id ? { ...item, uploadedUrl: url } : item))
      result.push(url)
    }
    return result
  }
  return { photos, error, setExisting, add, remove, move, upload }
}

import { useId } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react'
import { MAX_PRODUCT_IMAGES } from '../../shared/productMedia'
import type { useProductPhotos } from '../hooks/useProductPhotos'
import './ProductAdminExtras.css'

export default function ProductPhotoEditor({ gallery, disabled }: { gallery: ReturnType<typeof useProductPhotos>; disabled: boolean }) {
  const id = useId()
  return <section className="product-photo-editor admin-form-full" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Fotos do produto</h2>
    <p>A primeira foto é a principal no catálogo. Adicione até {MAX_PRODUCT_IMAGES} imagens e organize a ordem.</p>
    <label className="admin-image-upload-button" htmlFor={id}><ImagePlus size={19} /> Adicionar fotos</label>
    <input id={id} className="admin-image-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled || gallery.photos.length >= MAX_PRODUCT_IMAGES} onChange={event => { gallery.add(event.target.files); event.target.value = '' }} />
    <small>JPG, PNG ou WEBP · até 5 MB por foto · {gallery.photos.length}/{MAX_PRODUCT_IMAGES} fotos</small>
    {gallery.error && <p className="admin-form-error" role="alert">{gallery.error}</p>}
    <div className="product-photo-grid">{gallery.photos.map((photo, index) => <article className="product-photo" key={photo.id}>
      <img src={photo.url} alt={`Foto ${index + 1} do produto`} />
      <strong>{index === 0 ? 'Foto principal' : `Foto ${index + 1}`}</strong>
      <div className="product-photo-controls">
        <button type="button" disabled={disabled || index === 0} onClick={() => gallery.move(photo.id, 0)} aria-label={`Definir foto ${index + 1} como principal`} title="Definir como principal"><Star size={17} /></button>
        <button type="button" disabled={disabled || index === 0} onClick={() => gallery.move(photo.id, index - 1)} aria-label={`Mover foto ${index + 1} para antes`}><ArrowLeft size={17} /></button>
        <button type="button" disabled={disabled || index === gallery.photos.length - 1} onClick={() => gallery.move(photo.id, index + 1)} aria-label={`Mover foto ${index + 1} para depois`}><ArrowRight size={17} /></button>
        <button type="button" disabled={disabled} onClick={() => gallery.remove(photo.id)} aria-label={`Remover foto ${index + 1}`}><Trash2 size={17} /></button>
      </div>
    </article>)}</div>
    {gallery.photos.length === 0 && <p>Nenhuma foto selecionada.</p>}
  </section>
}

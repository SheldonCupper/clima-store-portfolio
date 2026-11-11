import ProductReviewModeration from '../../components/ProductReviewModeration'
import { requireTechnicalAttributesSupport } from '../../utils/productAttributes'
import ProductTechnicalEditor from '../../components/ProductTechnicalEditor'
import { readProductAttributes, type ProductAttributes } from '../../../shared/productAttributes'
import { productImages } from '../../../shared/productMedia'
import ProductPhotoEditor from '../../components/ProductPhotoEditor'
import { useProductPhotos } from '../../hooks/useProductPhotos'
import ProductMeasurementLookup from '../../components/ProductMeasurementLookup'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'

type Category = {
  id: number
  name: string
}

function AdminProductEdit() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [categories, setCategories] = useState<Category[]>([])

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [pixPrice, setPixPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [gtin, setGtin] = useState('')
  const [technicalAttributes, setTechnicalAttributes] = useState<ProductAttributes>({})
  const [weightKg, setWeightKg] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const gallery = useProductPhotos()
  const { setExisting } = gallery
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState(true)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        const [productResponse, categoriesResponse] =
          await Promise.all([
            fetch(`/api/products/${id}`),
            fetch('/api/categories'),
          ])

        const productData = await productResponse.json()
        const categoriesData = await categoriesResponse.json()

        if (!productResponse.ok) {
          throw new Error(
            productData.error || 'Erro ao carregar produto'
          )
        }

        if (!categoriesResponse.ok) {
          throw new Error('Erro ao carregar categorias')
        }

        setName(productData.name)
        setSlug(productData.slug)
        setDescription(productData.description || '')
        setSku(productData.sku)
        setGtin(productData.gtin || '')
        setTechnicalAttributes(readProductAttributes(productData.technicalAttributes))
        setPrice(productData.price)
        setPixPrice(productData.pixPrice || '')
        setStock(String(productData.stock))
        setWeightKg(
          productData.weightKg != null
            ? String(productData.weightKg)
            : ''
        )
        setHeightCm(
          productData.heightCm != null
            ? String(productData.heightCm)
            : ''
        )
        setWidthCm(
          productData.widthCm != null
            ? String(productData.widthCm)
            : ''
        )
        setLengthCm(
          productData.lengthCm != null
            ? String(productData.lengthCm)
            : ''
        )
        setExisting(productImages(productData))
        setCategoryId(String(productData.categoryId))
        setActive(productData.active)

        setCategories(categoriesData)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar produto'
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id, setExisting])

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')

      await requireTechnicalAttributesSupport(technicalAttributes)
      const uploadedImages = await gallery.upload()

      const response = await fetch(
        `/api/products/${id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            slug,
            description,
            sku,
            gtin,
            technicalAttributes,
            price,
            pixPrice,
            stock: Number(stock),
            active,
            imageUrl: uploadedImages[0] || '',
            imageUrls: uploadedImages,
            categoryId: Number(categoryId),
            weightKg: Number(weightKg),
            heightCm: Number(heightCm),
            widthCm: Number(widthCm),
            lengthCm: Number(lengthCm),
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao editar produto'
        )
      }

      navigate('/admin/produtos')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao editar produto'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <main className="container admin-content">
          <div className="admin-empty">
            Carregando produto...
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>
            <h1>Editar produto</h1>
          </div>

          <Link
            to="/admin/produtos"
            className="admin-back-link"
          >
            <ArrowLeft size={18} />
            Voltar para produtos
          </Link>
        </div>
      </header>

      <main className="container admin-content">
        <form
          className="admin-form-card"
          onSubmit={handleSubmit}
        >
          <div className="admin-form-grid">
            <div className="admin-form-group admin-form-full">
              <label>Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="admin-form-group">
              <label>Slug *</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>

            <div className="admin-form-group">
              <label>SKU *</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>

            <div className="admin-form-group">
              <label>Categoria *</label>
              <select
                value={categoryId}
                onChange={(e) =>
                  setCategoryId(e.target.value)
                }
              >
                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label>Estoque *</label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) =>
                  setStock(e.target.value)
                }
              />
            </div>

            <div className="admin-form-group">
              <label>Preço *</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
              />
            </div>

            <div className="admin-form-group">
              <label>Preço no Pix</label>
              <input
                type="number"
                step="0.01"
                value={pixPrice}
                onChange={(e) =>
                  setPixPrice(e.target.value)
                }
              />
            </div>
            <ProductTechnicalEditor value={technicalAttributes} onChange={setTechnicalAttributes} disabled={saving} />
            <ProductMeasurementLookup productName={name} gtin={gtin} onGtinChange={setGtin} onApply={measurements => {
              if (measurements.weightKg !== null) setWeightKg(String(measurements.weightKg))
              if (measurements.heightCm !== null) setHeightCm(String(measurements.heightCm))
              if (measurements.widthCm !== null) setWidthCm(String(measurements.widthCm))
              if (measurements.lengthCm !== null) setLengthCm(String(measurements.lengthCm))
            }} />
            <div className="admin-form-group">
              <label>Peso embalado (kg) *</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                required
                value={weightKg}
                onChange={(e) =>
                  setWeightKg(e.target.value)
                }
                placeholder="0.750"
              />
            </div>

            <div className="admin-form-group">
              <label>Altura (cm) *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={heightCm}
                onChange={(e) =>
                  setHeightCm(e.target.value)
                }
              />
            </div>

            <div className="admin-form-group">
              <label>Largura (cm) *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={widthCm}
                onChange={(e) =>
                  setWidthCm(e.target.value)
                }
              />
            </div>

            <div className="admin-form-group">
              <label>Comprimento (cm) *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={lengthCm}
                onChange={(e) =>
                  setLengthCm(e.target.value)
                }
              />
            </div>

            <ProductPhotoEditor gallery={gallery} disabled={saving} />

            <div className="admin-form-group admin-form-full">
              <label>Descrição</label>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
              />
            </div>

            <div className="admin-form-check admin-form-full">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) =>
                  setActive(e.target.checked)
                }
              />

              <label htmlFor="active">
                Produto ativo
              </label>
            </div>
          </div>

          {error && (
            <p className="admin-form-error">{error}</p>
          )}

          <div className="admin-form-actions">
            <Link
              to="/admin/produtos"
              className="admin-secondary-button"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className="admin-primary-button"
              disabled={saving}
            >
              <Save size={18} />
              {saving
                ? 'Salvando...'
                : 'Salvar alterações'}
            </button>
          </div>
        </form>
        {id && <ProductReviewModeration productId={id} />}
      </main>
    </div>
  )
}

export default AdminProductEdit

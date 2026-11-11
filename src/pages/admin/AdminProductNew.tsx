import { requireTechnicalAttributesSupport } from '../../utils/productAttributes'
import ProductTechnicalEditor from '../../components/ProductTechnicalEditor'
import { type ProductAttributes } from '../../../shared/productAttributes'
import ProductPhotoEditor from '../../components/ProductPhotoEditor'
import { useProductPhotos } from '../../hooks/useProductPhotos'
import ProductMeasurementLookup from '../../components/ProductMeasurementLookup'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

type Category = {
  id: number
  name: string
  slug: string
}

function AdminProductNew() {
  const navigate = useNavigate()

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
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch(
          '/api/categories'
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error('Erro ao carregar categorias')
        }

        setCategories(data)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar categorias'
        )
      }
    }

    loadCategories()
  }, [])

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function handleNameChange(value: string) {
    setName(value)

    if (!slug) {
      setSlug(generateSlug(value))
    }
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

    if (
      !name ||
      !slug ||
      !sku ||
      !price ||
      !categoryId ||
      !weightKg ||
      !heightCm ||
      !widthCm ||
      !lengthCm
    ) {
      setError('Preencha os campos obrigatórios.')
      return
    }

    try {
      setLoading(true)

      await requireTechnicalAttributesSupport(technicalAttributes)
      const uploadedImages = await gallery.upload()

      const response = await fetch(
        '/api/products',
        {
          method: 'POST',
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
          data.error || 'Erro ao cadastrar produto'
        )
      }

      navigate('/admin/produtos')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao cadastrar produto'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Novo produto</h1>
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
                onChange={(e) =>
                  handleNameChange(e.target.value)
                }
                placeholder="Ex.: Bomba de Vácuo 7 CFM"
              />
            </div>

            <div className="admin-form-group">
              <label>Slug *</label>

              <input
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value)
                }
                placeholder="bomba-de-vacuo-7-cfm"
              />
            </div>

            <div className="admin-form-group">
              <label>SKU *</label>

              <input
                value={sku}
                onChange={(e) =>
                  setSku(e.target.value)
                }
                placeholder="BOMBA-7CFM"
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
                <option value="">
                  Selecione uma categoria
                </option>

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
                min="0"
                step="0.01"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
                placeholder="0,00"
              />
            </div>

            <div className="admin-form-group">
              <label>Preço no Pix</label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={pixPrice}
                onChange={(e) =>
                  setPixPrice(e.target.value)
                }
                placeholder="0,00"
              />
            </div>
            <ProductTechnicalEditor value={technicalAttributes} onChange={setTechnicalAttributes} disabled={loading} />
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

            <ProductPhotoEditor gallery={gallery} disabled={loading} />

            <div className="admin-form-group admin-form-full">
              <label>Descrição</label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                placeholder="Descrição do produto..."
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
            <p className="admin-form-error">
              {error}
            </p>
          )}

          <div className="admin-form-actions">
            <Link
              to="/admin/produtos"
              className="admin-secondary-button"
            >
              Cancelar
            </Link>

            <button
              className="admin-primary-button"
              type="submit"
              disabled={loading}
            >
              <Save size={18} />

              {loading
                ? 'Salvando...'
                : 'Salvar produto'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default AdminProductNew

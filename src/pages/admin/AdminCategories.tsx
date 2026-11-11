import {
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react'

import {
  Tags,
  Plus,
  Pencil,
  Search,
  Trash2,
  X,
  Save,
} from 'lucide-react'

type Category = {
  id: number
  name: string
  slug: string
  active: boolean

  _count?: {
    products: number
  }
}

function createSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const [editingId, setEditingId] = useState<number | null>(
    null
  )

  const [editingName, setEditingName] = useState('')
  const [editingSlug, setEditingSlug] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadCategories() {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(
        '/api/admin/categories',
        {
          credentials: 'include',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao carregar categorias'
        )
      }

      setCategories(
        Array.isArray(data) ? data : []
      )
    } catch (err) {
      setCategories([])

      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar categorias'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function initialLoad() {
      try {
        const response = await fetch(
          '/api/admin/categories',
          {
            credentials: 'include',
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || 'Erro ao carregar categorias'
          )
        }

        if (!cancelled) {
          setCategories(
            Array.isArray(data) ? data : []
          )
        }
      } catch (err) {
        if (!cancelled) {
          setCategories([])

          setError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar categorias'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initialLoad()

    return () => {
      cancelled = true
    }
  }, [])

  function handleNameChange(value: string) {
    setName(value)
    setSlug(createSlug(value))
  }

  async function handleCreate(
    event: SyntheticEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')

      const response = await fetch(
        '/api/admin/categories',
        {
          method: 'POST',
          credentials: 'include',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            name,
            slug,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao cadastrar categoria'
        )
      }

      setName('')
      setSlug('')

      await loadCategories()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao cadastrar categoria'
      )
    } finally {
      setSaving(false)
    }
  }

  function startEditing(category: Category) {
    setEditingId(category.id)
    setEditingName(category.name)
    setEditingSlug(category.slug)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName('')
    setEditingSlug('')
  }

  async function saveEditing(
    category: Category
  ) {
    try {
      setError('')

      const response = await fetch(
        `/api/admin/categories/${category.id}`,
        {
          method: 'PUT',
          credentials: 'include',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            name: editingName,
            slug: editingSlug,
            active: category.active,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao editar categoria'
        )
      }

      cancelEditing()

      await loadCategories()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao editar categoria'
      )
    }
  }

  async function handleDeactivate(
    category: Category
  ) {
    const confirmed = window.confirm(
      `Deseja inativar a categoria "${category.name}"?`
    )

    if (!confirmed) {
      return
    }

    try {
      const response = await fetch(
        `/api/admin/categories/${category.id}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao inativar categoria'
        )
      }

      await loadCategories()
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao inativar categoria'
      )
    }
  }

  async function handleReactivate(
    category: Category
  ) {
    try {
      const response = await fetch(
        `/api/admin/categories/${category.id}`,
        {
          method: 'PUT',
          credentials: 'include',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            name: category.name,
            slug: category.slug,
            active: true,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao reativar categoria'
        )
      }

      await loadCategories()
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao reativar categoria'
      )
    }
  }

  const filteredCategories = useMemo(() => {
    const term = search
      .toLowerCase()
      .trim()

    if (!term) {
      return categories
    }

    return categories.filter((category) => {
      return (
        category.name
          .toLowerCase()
          .includes(term) ||
        category.slug
          .toLowerCase()
          .includes(term)
      )
    })
  }, [categories, search])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Categorias</h1>
          </div>
        </div>
      </header>

      <main className="container admin-content">
        <section className="admin-form-card">
          <div className="admin-card-header">
            <div>
              <strong>Nova categoria</strong>

              <span>
                Crie categorias para organizar seus
                produtos
              </span>
            </div>

            <Plus size={22} />
          </div>

          <form
            className="admin-category-form"
            onSubmit={handleCreate}
          >
            <div className="admin-form-group">
              <label>Nome</label>

              <input
                value={name}
                onChange={(e) =>
                  handleNameChange(
                    e.target.value
                  )
                }
                placeholder="Ex.: Compressores"
                required
              />
            </div>

            <div className="admin-form-group">
              <label>Slug</label>

              <input
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value)
                }
                placeholder="compressores"
                required
              />
            </div>

            <button
              type="submit"
              className="admin-primary-button"
              disabled={saving}
            >
              <Plus size={18} />

              {saving
                ? 'Salvando...'
                : 'Cadastrar categoria'}
            </button>
          </form>

          {error && (
            <div className="admin-form-error">
              {error}
            </div>
          )}
        </section>

        <section className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Buscar categoria..."
            />
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <strong>
                Categorias cadastradas
              </strong>

              <span>
                {categories.length}{' '}
                categoria
                {categories.length === 1
                  ? ''
                  : 's'}
              </span>
            </div>

            <Tags size={24} />
          </div>

          {loading ? (
            <div className="admin-empty">
              Carregando categorias...
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Slug</th>
                    <th>Produtos</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCategories.map(
                    (category) => (
                      <tr key={category.id}>
                        <td>
                          {editingId ===
                          category.id ? (
                            <input
                              className="admin-inline-input"
                              value={editingName}
                              onChange={(e) =>
                                setEditingName(
                                  e.target.value
                                )
                              }
                            />
                          ) : (
                            <strong>
                              {category.name}
                            </strong>
                          )}
                        </td>

                        <td>
                          {editingId ===
                          category.id ? (
                            <input
                              className="admin-inline-input"
                              value={editingSlug}
                              onChange={(e) =>
                                setEditingSlug(
                                  e.target.value
                                )
                              }
                            />
                          ) : (
                            category.slug
                          )}
                        </td>

                        <td>
                          {category._count
                            ?.products ?? 0}
                        </td>

                        <td>
                          <span
                            className={
                              category.active
                                ? 'admin-status active'
                                : 'admin-status inactive'
                            }
                          >
                            {category.active
                              ? 'Ativa'
                              : 'Inativa'}
                          </span>
                        </td>

                        <td>
                          <div className="admin-actions">
                            {editingId ===
                            category.id ? (
                              <>
                                <button
                                  type="button"
                                  className="admin-edit-button"
                                  title="Salvar"
                                  onClick={() =>
                                    saveEditing(
                                      category
                                    )
                                  }
                                >
                                  <Save
                                    size={16}
                                  />
                                </button>

                                <button
                                  type="button"
                                  className="admin-delete-button"
                                  title="Cancelar"
                                  onClick={
                                    cancelEditing
                                  }
                                >
                                  <X
                                    size={16}
                                  />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="admin-edit-button"
                                  title="Editar"
                                  onClick={() =>
                                    startEditing(
                                      category
                                    )
                                  }
                                >
                                  <Pencil
                                    size={16}
                                  />
                                </button>

                                {category.active ? (
                                  <button
                                    type="button"
                                    className="admin-delete-button"
                                    title="Inativar"
                                    onClick={() =>
                                      handleDeactivate(
                                        category
                                      )
                                    }
                                  >
                                    <Trash2
                                      size={16}
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-primary-button admin-small-button"
                                    onClick={() =>
                                      handleReactivate(
                                        category
                                      )
                                    }
                                  >
                                    Reativar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>

              {filteredCategories.length ===
                0 && (
                <div className="admin-empty">
                  Nenhuma categoria encontrada
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminCategories
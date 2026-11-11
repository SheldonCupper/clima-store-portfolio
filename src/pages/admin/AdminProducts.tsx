import ProductBulkDialog, { type BulkAction, type BulkResult } from '../../components/ProductBulkDialog'
import ProductCsvImport from '../../components/ProductCsvImport'
import { catalogIssues } from '../../../shared/catalogQuality'
import { storefrontImageUrl } from '../../utils/storefront'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  ArrowLeft,
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
} from 'lucide-react'

type Product = {
  id: number
  updatedAt: string
  name: string
  sku: string
  price: string
  pixPrice: string | null
  stock: number
  active: boolean
  description: string | null
  imageUrls?: string[]
  weightKg?: number | null
  heightCm?: number | null
  widthCm?: number | null
  lengthCm?: number | null
  imageUrl: string | null
  category: {
    id: number
    name: string
  }
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState<{ action: BulkAction; products: Product[] } | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  function beginAction(action: BulkAction, targets = products.filter(product => selected.has(product.id))) {
    if (targets.length) { setResult(null); setPending({ action, products: targets }) }
  }
  function finishAction(result: BulkResult) { setResult(result); setPending(null); setSelected(new Set()); setReload(value => value + 1) }
  function toggleProduct(id: number) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }


  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()
    async function loadProducts() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          '/api/admin/products', { signal: controller.signal, cache: 'no-store' }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || 'Erro ao carregar produtos'
          )
        }

        if (controller.signal.aborted) return
        if (!Array.isArray(data)) throw new Error('Resposta de produtos inválida.')
        setProducts(data)
        setSelected(current => new Set([...current].filter(id => data.some(product => product.id === id))))
      } catch (err) {
        if (controller.signal.aborted) return
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar produtos'
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadProducts()
    return () => controller.abort()
  }, [reload])

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim()

    if (!term) {
      return products
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.category.name.toLowerCase().includes(term)
      )
    })
  }, [products, search])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Produtos</h1>
          </div>

          <Link to="/" className="admin-back-link">
            <ArrowLeft size={18} />
            Voltar para a loja
          </Link>
        </div>
      </header>

      <main className="container admin-content">
        <section className="admin-card" style={{ padding: 20, marginBottom: 20 }}>
          <h2>Preparar o catálogo real</h2>
          <p>Use nome, modelo, fotos e ficha técnica do fornecedor. Confira preço e estoque antes de ativar. Cadastros inativos continuam disponíveis aqui para edição.</p>
          <p>{products.filter(product => product.active).length} ativos · {products.filter(product => !product.active).length} inativos · {products.filter(product => catalogIssues(product).length > 0).length} com itens para revisar</p>
          <p>As dimensões do cadastro são da embalagem de envio. Na descrição, informe as especificações do produto e suas compatibilidades, sem estimativas.</p>
        </section>
        <ProductCsvImport onImported={() => setReload(value => value + 1)} />
        <section className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou SKU..."
            />
          </div>

          <button
            className="admin-primary-button"
            onClick={() =>
              navigate('/admin/produtos/novo')
            }
          >
            <Plus size={18} />
            Novo produto
          </button>
        </section>

        <section className="admin-card admin-bulk-panel" aria-label="Ações em lote de produtos">
          <strong>{selected.size} produto(s) selecionado(s)</strong>
          {selected.size > 0 && products.some(product => selected.has(product.id) && !filteredProducts.some(visible => visible.id === product.id)) && <p>Há produtos selecionados fora da busca atual. As ações incluem toda a seleção.</p>}
          <div className="admin-bulk-controls"><button type="button" className="admin-secondary-button" disabled={loading || Boolean(error) || !products.length} onClick={() => setSelected(new Set(products.map(product => product.id)))}>Selecionar todos os {products.length} produtos</button><button type="button" className="admin-secondary-button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Limpar seleção</button></div>
          <div className="admin-bulk-controls"><button type="button" className="admin-secondary-button" disabled={!selected.size || loading || Boolean(error)} onClick={() => beginAction('activate')}>Ativar selecionados</button><button type="button" className="admin-secondary-button" disabled={!selected.size || loading || Boolean(error)} onClick={() => beginAction('deactivate')}>Desativar selecionados</button><button type="button" className="admin-bulk-danger" disabled={!selected.size || loading || Boolean(error)} onClick={() => beginAction('delete')}>Excluir selecionados</button></div>
          <p>Para agir sobre o catálogo inteiro, selecione todos e escolha a ação. Produtos com pedidos não são apagados. Nenhuma ação altera preços ou estoque.</p>
          {result && <div role="status" className="admin-bulk-result"><strong>{result.affected} produto(s) {result.action === 'delete' ? 'excluído(s)' : result.action === 'activate' ? 'ativado(s)' : 'desativado(s)'}.</strong>{result.protectedCount > 0 && <><p>{result.protectedCount} produto(s) preservado(s) por estarem vinculados a pedidos. Você pode desativá-los.</p><details><summary>Ver produtos preservados</summary><ul>{result.protectedProducts.map(product => <li key={product.id}>{product.name}</li>)}</ul>{result.protectedCount > result.protectedProducts.length && <p>Exibindo os primeiros {result.protectedProducts.length}.</p>}</details></>}</div>}
        </section>
        {pending && <ProductBulkDialog action={pending.action} products={pending.products} onCancel={() => setPending(null)} onDone={finishAction} onRefresh={() => { setPending(null); setSelected(new Set()); setReload(value => value + 1) }} />}
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <strong>Produtos cadastrados</strong>

              <span>
                {products.length} produto
                {products.length === 1 ? '' : 's'} no catálogo
              </span>
            </div>

            <Package size={24} />
          </div>

          {loading && (
            <div className="admin-empty">
              <Package size={40} />
              <strong>Carregando produtos...</strong>
            </div>
          )}

          {error && (
            <div className="admin-empty">
              <Package size={40} />
              <strong>Erro ao carregar produtos</strong>
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label="Selecionar produtos da busca" checked={filteredProducts.length > 0 && filteredProducts.every(product => selected.has(product.id))} disabled={loading || !filteredProducts.length} ref={node => { if (node) node.indeterminate = filteredProducts.some(product => selected.has(product.id)) && !filteredProducts.every(product => selected.has(product.id)) }} onChange={event => { const checked = event.target.checked; setSelected(current => { const next = new Set(current); for (const product of filteredProducts) { if (checked) next.add(product.id); else next.delete(product.id) } return next }) }} /></th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>SKU</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Status</th><th>Revisão do cadastro</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td><input type="checkbox" aria-label={`Selecionar ${product.name} (${product.sku})`} checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} /></td>
                      <td>
                        <div className="admin-product-cell">
                          <img
                            src={
                              storefrontImageUrl(product.imageUrl) ||
                              '/product-placeholder.svg'
                            }
                            alt={product.name}
                          />

                          <strong>{product.name}</strong>
                        </div>
                      </td>

                      <td>{product.category.name}</td>

                      <td>{product.sku}</td>

                      <td>
                        {money(Number(product.price))}
                      </td>

                      <td>
                        <span
                          className={
                            product.stock <= 5
                              ? 'admin-stock low'
                              : 'admin-stock'
                          }
                        >
                          {product.stock}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            product.active
                              ? 'admin-status active'
                              : 'admin-status inactive'
                          }
                        >
                          {product.active
                            ? 'Ativo'
                            : 'Inativo'}
                        </span>
                      </td>

                      <td style={{ minWidth: 230 }}>{catalogIssues(product).length ? <details><summary>{catalogIssues(product).length} item(ns) para revisar</summary><ul>{catalogIssues(product).map(issue => <li key={issue}>{issue}</li>)}</ul></details> : 'Cadastro preenchido — confirme a ficha do fornecedor'}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            className="admin-edit-button"
                            title="Editar"
                            onClick={() =>
                              navigate(
                                `/admin/produtos/${product.id}/editar`
                              )
                            }
                          >
                            <Pencil size={16} />
                          </button>

                          <button type="button" className="admin-edit-button" title={product.active ? 'Desativar' : 'Ativar'} aria-label={`${product.active ? 'Desativar' : 'Ativar'} ${product.name}`} onClick={() => beginAction(product.active ? 'deactivate' : 'activate', [product])}><Power size={16} /></button>
                          <button type="button" className="admin-delete-button" title="Excluir" aria-label={`Excluir ${product.name}`} onClick={() => beginAction('delete', [product])}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredProducts.length === 0 && (
                <div className="admin-empty">
                  <Search size={36} />

                  <strong>
                    Nenhum produto encontrado
                  </strong>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminProducts
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { CSV_MAX_BYTES, CSV_MAX_PRODUCTS, productCsvTemplate } from '../../shared/productCsv'
type Preview = { token: string; total: number; errors: number; rows: { line: number; name: string; sku: string; category: string; error: string; warnings: string[]; data: { price: number; stock: number; active: boolean } | null }[] }
export default function ProductCsvImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([])
  const generation = useRef(0)
  useEffect(() => { const controller = new AbortController(); if (open) fetch('/api/categories', { signal: controller.signal }).then(response => response.ok ? response.json() : []).then(data => { if (!controller.signal.aborted && Array.isArray(data)) setCategories(data) }).catch(() => {}); return () => controller.abort() }, [open])
  useEffect(() => () => { generation.current++ }, [])
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0], current = ++generation.current
    setPreview(null); setCsv(''); setFileName(''); setError(''); setMessage('')
    if (!file) return
    if (!/\.csv$/i.test(file.name) || file.size > CSV_MAX_BYTES) { setError('Selecione um arquivo .csv de até 1 MB.'); return }
    setBusy(true)
    try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (current === generation.current) { setCsv(text); setFileName(file.name) } }
    catch { if (current === generation.current) setError('Não foi possível ler. Exporte a planilha como CSV UTF-8.') }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function send(confirm: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/admin/products/import/${confirm ? 'confirm' : 'preview'}`, { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', ...(confirm && preview ? { 'X-Import-Preview': preview.token } : {}) }, body: csv })
      const data = await response.json().catch(() => { throw new Error('Importador indisponível. Atualize a página ou tente novamente após a publicação do backend.') })
      if (!response.ok) { if (Array.isArray(data.rows)) setPreview(data); else if (confirm) setPreview(null); throw new Error(data.error || 'Há erros no arquivo. Corrija todas as linhas e faça a prévia novamente.') }
      if (confirm) {
        if (!Number.isInteger(data.imported) || data.imported < 1) throw new Error('Resposta de importação inválida. Confira o catálogo antes de tentar novamente.')
        setMessage(`${data.imported} produto(s) cadastrado(s). A lista foi atualizada.`); setPreview(null); setCsv(''); setFileName(''); onImported()
      } else {
        if (!Array.isArray(data.rows) || typeof data.token !== 'string' || !Number.isInteger(data.total) || !Number.isInteger(data.errors)) throw new Error('Prévia inválida. Atualize a página e tente novamente.')
        setPreview(data)
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível importar. Confira o catálogo antes de tentar novamente.') }
    finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([productCsvTemplate(categories[0]?.slug)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'modelo-produtos-clima.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="admin-card admin-csv-import" aria-label="Importação de produtos por CSV">
    <div className="admin-csv-heading"><div><h2>Cadastro em lote</h2><p>Cadastre vários produtos usando uma planilha CSV.</p></div><button type="button" className="admin-secondary-button" disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Upload size={18} />}{open ? 'Fechar importação' : 'Importar CSV'}</button></div>
    {open && <div className="admin-csv-content"><p>Baixe o modelo, substitua a linha de exemplo e exporte como <strong>CSV UTF-8</strong>. Até {CSV_MAX_PRODUCTS} produtos por arquivo e 1 MB. Use ponto ou vírgula decimal, sem separador de milhar. Peso embalado em kg; altura, largura e comprimento em cm inteiros.</p>
      <p>Categoria: use o nome ou o slug de uma categoria ativa. Slug do produto é gerado pelo nome quando vazio. Fotos: links HTTPS separados por <strong>|</strong> (até 12). A primeira será a capa.</p>
      {categories.length > 0 && <details><summary>Consultar categorias disponíveis</summary><ul>{categories.map(category => <li key={category.slug}>{category.name}: <code>{category.slug}</code></li>)}</ul></details>}
      <div className="admin-csv-controls"><button type="button" className="admin-secondary-button" onClick={download}><Download size={18} /> Baixar modelo CSV</button><label className="admin-csv-file">Selecionar arquivo CSV<input type="file" accept=".csv,text/csv" onChange={event => void choose(event)} disabled={busy} /></label><button type="button" className="admin-secondary-button" disabled={busy || !csv} onClick={() => void send(false)}>{busy ? 'Aguarde...' : 'Validar e visualizar'}</button></div>
      {fileName && <p>Arquivo selecionado: <strong>{fileName}</strong></p>}
      {error && <p role="alert" className="admin-form-error">{error}</p>}{message && <p role="status" className="admin-coupon-message">{message}</p>}
      {preview && <><p role="status"><strong>{preview.total} produto(s) · {preview.errors} linha(s) com erro</strong> · {preview.rows.filter(row => row.data?.active && !row.error).length} serão ativados. Nenhum produto foi cadastrado nesta prévia.</p><div className="admin-table-wrapper"><table className="admin-table"><thead><tr><th>Linha</th><th>Produto / SKU</th><th>Categoria</th><th>Preço / estoque</th><th>Conferência</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.line}><td>{row.line}</td><td><strong>{row.name}</strong><br />{row.sku}</td><td>{row.category}</td><td>{row.data ? <>{row.data.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br />{row.data.stock} un. · {row.data.active ? 'Ativo' : 'Inativo'}</> : '—'}</td><td>{row.error ? <span className="admin-form-error">{row.error}</span> : <><strong>Pronto para importar</strong>{row.warnings.length > 0 && <ul>{row.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</>}</td></tr>)}</tbody></table></div><p>Todos os dados serão conferidos novamente ao importar. Se houver erro ou conflito, o lote inteiro será recusado. SKUs e slugs existentes não serão substituídos. Produtos entram inativos se <code>ativo</code> estiver vazio; use <code>sim</code> para ativar.</p><button type="button" className="admin-primary-button" disabled={busy || preview.errors > 0 || !csv} onClick={() => void send(true)}>{busy ? 'Importando...' : `Confirmar importação de ${preview.total} produto(s)`}</button></>}
    </div>}
  </section>
}

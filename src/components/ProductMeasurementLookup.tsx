import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { validGtin, type ProductMeasurementSuggestion } from '../../shared/productMedia'
import { parseDimensionTriplet, parseLabeledMeasurements } from '../../shared/productMeasurements'
import './ProductAdminExtras.css'

type Measurements = ProductMeasurementSuggestion['measurements']
export default function ProductMeasurementLookup({ gtin, productName = '', onGtinChange, onApply }: { gtin: string; productName?: string; onGtinChange: (value: string) => void; onApply: (measurements: Measurements) => void }) {
  const id = useId()
  const [mode, setMode] = useState<'barcode' | 'sheet'>('barcode')
  const [sheet, setSheet] = useState('')
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ProductMeasurementSuggestion | null>(null)
  const [order, setOrder] = useState('')
  const [checked, setChecked] = useState(false)
  const [applied, setApplied] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    const config = new AbortController()
    fetch('/api/admin/product-lookup/config', { credentials: 'include', signal: config.signal }).then(async response => {
      if (!response.ok) throw new Error()
      const data = await response.json(); setEnabled(data.enabled === true && data.free === true)
    }).catch(() => { if (!config.signal.aborted) setEnabled(false) })
    return () => { config.abort(); controller.current?.abort() }
  }, [])
  function clear() { setError(''); setResult(null); setChecked(false); setApplied(false); setOrder('') }
  function changeMode(next: typeof mode) { controller.current?.abort(); setBusy(false); setMode(next); clear() }
  async function search() {
    clear()
    if (!validGtin(gtin)) { setError('Informe um GTIN válido com 8, 12, 13 ou 14 números.'); return }
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    try {
      setBusy(true)
      const response = await fetch(`/api/admin/product-lookup?gtin=${encodeURIComponent(gtin)}`, { credentials: 'include', signal: request.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o produto.')
      if (!request.signal.aborted) setResult(data)
    } catch (err) { if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Não foi possível consultar o produto.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  function readSheet() {
    clear()
    if (!sheet.trim()) { setError('Cole o texto da ficha técnica do fabricante ou fornecedor.'); return }
    const measurements = parseLabeledMeasurements(sheet)
    const dimensionLine = sheet.split('\n').find(line => /dimens[oõ]es|dimensions|medidas/i.test(line))
    const rawDimensions = dimensionLine ? dimensionLine.slice(dimensionLine.indexOf(':') + 1).trim() : sheet.trim()
    const dimensionValuesCm = parseDimensionTriplet(rawDimensions)
    setResult({ gtin, name: productName || 'Ficha técnica informada', brand: '', source: '', sourceName: 'Ficha técnica colada', rawDimensions: dimensionValuesCm ? rawDimensions : '', dimensionValuesCm, measurements })
  }
  const suggestion = result?.gtin === gtin ? result : null
  const measurements = suggestion ? { ...suggestion.measurements } : null
  if (measurements && suggestion?.dimensionValuesCm && order) {
    const [first, second, third] = suggestion.dimensionValuesCm
    if (order === 'hwl') { measurements.heightCm = first; measurements.widthCm = second; measurements.lengthCm = third }
    if (order === 'lwh') { measurements.lengthCm = first; measurements.widthCm = second; measurements.heightCm = third }
    if (order === 'wlh') { measurements.widthCm = first; measurements.lengthCm = second; measurements.heightCm = third }
  }
  const fields = [['weightKg', 'Peso informado', 'kg'], ['heightCm', 'Altura', 'cm'], ['widthCm', 'Largura', 'cm'], ['lengthCm', 'Comprimento', 'cm']] as const
  const hasMeasurements = measurements && Object.values(measurements).some(value => value !== null)
  return <section className="product-lookup admin-form-full" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Preencher peso e medidas</h2>
    <p>Use a consulta gratuita por código de barras ou cole a ficha técnica. Confira o modelo e a embalagem antes de aplicar os dados.</p>
    <div className="product-lookup-modes" aria-label="Fonte das medidas"><button type="button" aria-pressed={mode === 'barcode'} onClick={() => changeMode('barcode')}>Buscar por código de barras</button><button type="button" aria-pressed={mode === 'sheet'} onClick={() => changeMode('sheet')}>Colar ficha técnica</button></div>
    {mode === 'barcode' ? <>
      <div className="product-lookup-search"><label htmlFor={id}>Código de barras (GTIN / EAN)<input id={id} value={gtin} inputMode="numeric" maxLength={14} onChange={event => { onGtinChange(event.target.value.replace(/\D/g, '').slice(0, 14)); clear() }} placeholder="8, 12, 13 ou 14 números" /></label><button type="button" className="admin-secondary-button" disabled={busy || !enabled} onClick={() => void search()}><Search size={17} />{busy ? 'Consultando...' : 'Buscar gratuitamente'}</button></div>
      <p>Fonte: UPCitemdb, plano gratuito. Até 100 consultas por dia, compartilhadas pelo servidor, e espera de dez segundos entre buscas. Alguns produtos não terão peso ou medidas disponíveis.</p>
      {enabled === false && <p className="product-lookup-notice" role="status">A busca online não está disponível neste servidor. Use a ficha técnica ou preencha os campos manualmente.</p>}
    </> : <div className="product-lookup-sheet">
      <label htmlFor={`${id}-sheet`}>Texto da ficha técnica<textarea id={`${id}-sheet`} maxLength={12000} value={sheet} onChange={event => { setSheet(event.target.value); clear() }} placeholder={'Peso bruto: 0,850 kg\nAltura: 20 cm\nLargura: 15 cm\nComprimento: 30 cm'} /></label>
      <p>Copie os dados do modelo exato. Informe as unidades (kg, g, cm, mm etc.). O leitor reconhece peso bruto/embalado; peso líquido não substitui o peso para envio.</p>
      <div className="product-lookup-sheet-actions"><button type="button" className="admin-secondary-button" onClick={readSheet}>Ler ficha técnica</button><a href={`https://www.google.com/search?q=${encodeURIComponent(`${productName || gtin} ficha técnica peso bruto dimensões embalagem`)}`} target="_blank" rel="noopener noreferrer">Pesquisar ficha técnica na web ↗</a></div>
    </div>}
    {error && <p className="admin-form-error" role="alert">{error}</p>}
    {suggestion && measurements && <div className="product-lookup-result">
      <strong>{suggestion.name || 'Produto localizado'}</strong>{suggestion.brand && <p>Marca: {suggestion.brand}</p>}
      {mode === 'barcode' ? <a href={`https://www.upcitemdb.com/upc/${encodeURIComponent(suggestion.gtin)}`} target="_blank" rel="noopener noreferrer">Fonte: UPCitemdb · GTIN {suggestion.gtin}</a> : <p>Fonte: ficha técnica informada por você.</p>}
      {suggestion.rawWeight && <p>Peso na fonte: {suggestion.rawWeight}. Verifique se inclui a embalagem.</p>}
      {suggestion.rawDimensions && <p>Dimensões na fonte: {suggestion.rawDimensions}</p>}
      {suggestion.dimensionValuesCm && <label className="product-lookup-order">Confirme a ordem das dimensões<select value={order} onChange={event => { setOrder(event.target.value); setChecked(false); setApplied(false) }}><option value="">Selecione conforme a ficha do produto</option><option value="hwl">Altura × Largura × Comprimento</option><option value="lwh">Comprimento × Largura × Altura</option><option value="wlh">Largura × Comprimento × Altura</option></select></label>}
      <dl>{fields.map(([key, title, unit]) => <div key={key}><dt>{title}</dt><dd>{measurements[key] === null ? 'Não informado' : `${measurements[key]} ${unit}`}</dd></div>)}</dl>
      <p>Confira se estes dados correspondem à embalagem pronta para envio, incluindo proteções e caixa. Valores sem unidade ou ausentes não são estimados. Centímetros são arredondados para cima; campos não informados serão mantidos.</p>
      {hasMeasurements ? <><label className="product-lookup-confirm"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> Conferi os dados e a embalagem de envio.</label><button type="button" className="admin-secondary-button" disabled={!checked} onClick={() => { onApply(measurements); setApplied(true) }}>Aplicar medidas disponíveis</button>{applied && <p role="status">Medidas preenchidas. Confira os campos e salve o produto.</p>}</> : <p role="status">Não foram encontradas medidas utilizáveis. Informe as unidades, confirme a ordem das dimensões ou preencha os campos manualmente.</p>}
    </div>}
  </section>
}

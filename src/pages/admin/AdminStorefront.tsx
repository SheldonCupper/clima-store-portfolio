import HeaderEditor from '../../components/HeaderEditor'
import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Palette, Plus, Save, Megaphone, Eye, Trash2 } from 'lucide-react'
import { defaultStorefrontSettings, parseStorefrontSettings, parseStorefrontSaveResponse, type Banner, type Promotion, type Showcase, type StorefrontSettings } from '../../../shared/storefront'
import type { Product } from '../../context/cart'
import { storefrontImageUrl } from '../../utils/storefront'
import { PromotionDialog } from '../../components/PromotionPopup'
import './AdminStorefront.css'

type Category = { id: number; name: string; slug: string }
type Tab = 'header' | 'appearance' | 'banners' | 'showcases' | 'categories' | 'promotion'

function ImageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  async function upload(file: File | undefined) {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Envie JPG, PNG ou WEBP de até 5 MB.'); return }
    try {
      setUploading(true)
      const form = new FormData(); form.append('image', file)
      const response = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a imagem.')
      onChange(new URL(data.imageUrl, window.location.origin).pathname)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao enviar imagem.') }
    finally { setUploading(false) }
  }
  return <div className="sf-image-field"><div className="sf-image-input"><input aria-label="URL da imagem" value={value} onChange={event => onChange(event.target.value)} placeholder="URL HTTPS ou envie uma imagem" /><label className="sf-upload"><ImagePlus size={17} /> {uploading ? 'Enviando...' : 'Enviar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label></div>{value && <div className="sf-image-preview"><img src={storefrontImageUrl(value)} alt="Prévia da imagem" /><button type="button" onClick={() => onChange('')}>Remover imagem</button></div>}{error && <p className="sf-error" role="alert">{error}</p>}</div>
}

function move<T>(items: T[], index: number, direction: number) {
  const result = [...items]
  const target = index + direction
  if (target < 0 || target >= result.length) return result
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

export default function AdminStorefront() {
  const [settings, setSettings] = useState<StorefrontSettings>(defaultStorefrontSettings)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tab, setTab] = useState<Tab>('appearance')
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setLoading(true); setError(''); setLoadFailed(false)
        const responses = await Promise.all([fetch('/api/admin/storefront', { credentials: 'include', signal: controller.signal }), fetch('/api/products', { signal: controller.signal }), fetch('/api/categories', { signal: controller.signal })])
        if (responses.some(response => !response.ok)) throw new Error('Não foi possível carregar a personalização. Tente novamente.')
        const [data, catalog, departments] = await Promise.all(responses.map(response => response.json()))
        if (controller.signal.aborted) return
        setSettings(parseStorefrontSettings(data.settings)); setProducts(catalog); setCategories(departments); setDirty(false)
      } catch (err) { if (!controller.signal.aborted) { setLoadFailed(true); setError(err instanceof Error ? err.message : 'Erro ao carregar personalização.') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function edit(update: (current: StorefrontSettings) => StorefrontSettings) { setSettings(update); setDirty(true); setSaved(false) }
  function banner(id: string, update: Partial<Banner>) { edit(current => ({ ...current, banners: current.banners.map(item => item.id === id ? { ...item, ...update } : item) })) }
  function showcase(id: string, update: Partial<Showcase>) { edit(current => ({ ...current, showcases: current.showcases.map(item => item.id === id ? { ...item, ...update } : item) })) }
  function promotion(update: Partial<Promotion>) { edit(current => ({ ...current, promotion: { ...current.promotion, ...update } })) }
  async function save(event: SyntheticEvent) {
    event.preventDefault(); setError(''); setSaved(false)
    try {
      const validated = parseStorefrontSettings(settings)
      setSaving(true)
      const response = await fetch('/api/admin/storefront', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validated) })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Não foi possível salvar.')
      const confirmedSettings = parseStorefrontSaveResponse(data)
      setSettings(confirmedSettings); setDirty(false); setSaved(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar personalização.') }
    finally { setSaving(false) }
  }
  if (loading) return <main className="sf-admin"><p>Carregando a personalização da loja...</p></main>
  if (loadFailed) return <main className="sf-admin"><p role="alert" className="sf-error">{error}</p><button onClick={() => setRetry(value => value + 1)} className="sf-primary">Tentar novamente</button></main>

  return (
    <main className="sf-admin">
      <div className="sf-page-heading"><div><span>VITRINE E IDENTIDADE</span><h1>Sua loja, do seu jeito.</h1><p>Edite os blocos da página inicial e publique quando estiver pronto.</p></div><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Ver loja</a></div>
      <form onSubmit={save}>
        <div className="sf-toolbar"><div className="sf-tabs" role="tablist" aria-label="Áreas da personalização">{([['appearance', 'Aparência'], ['header', 'Cabeçalho e menu'], ['banners', 'Banners'], ['showcases', 'Vitrines'], ['categories', 'Categorias'], ['promotion', 'Pop-up promocional']] as const).map(([key, title]) => <button type="button" role="tab" aria-selected={tab === key} aria-controls={`sf-panel-${key}`} id={`sf-tab-${key}`} key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}</button>)}</div><button className="sf-primary" disabled={saving || !dirty}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
        {error && <p className="sf-error sf-notice" role="alert">{error}</p>}{saved && <p className="sf-success sf-notice" role="status">Personalização salva. As alterações já aparecem na loja.</p>}{dirty && <p className="sf-dirty">Você tem alterações ainda não salvas.</p>}
        <section id={`sf-panel-${tab}`} role="tabpanel" aria-labelledby={`sf-tab-${tab}`}>
          {tab === 'header' && <HeaderEditor value={settings.header} onChange={header => edit(current => ({ ...current, header }))} />}
          {tab === 'appearance' && <div className="sf-card"><h2><Palette size={20} /> A identidade da sua vitrine</h2><div className="sf-fields"><label>Cor principal<div className="sf-color"><input type="color" value={settings.primaryColor} onChange={event => edit(current => ({ ...current, primaryColor: event.target.value }))} /><span>{settings.primaryColor}</span></div></label><label>Cor de destaque<div className="sf-color"><input type="color" value={settings.secondaryColor} onChange={event => edit(current => ({ ...current, secondaryColor: event.target.value }))} /><span>{settings.secondaryColor}</span></div></label><label className="sf-check"><input type="checkbox" checked={settings.autoplay} onChange={event => edit(current => ({ ...current, autoplay: event.target.checked }))} /> Trocar banners automaticamente</label><label>Intervalo dos banners (segundos)<input type="number" min="4" max="15" value={settings.slideSeconds} onChange={event => edit(current => ({ ...current, slideSeconds: Number(event.target.value) }))} /></label><label className="sf-check sf-full"><input type="checkbox" checked={settings.showCategories} onChange={event => edit(current => ({ ...current, showCategories: event.target.checked }))} /> Mostrar os cards de categorias na página inicial</label></div><div className="sf-live-preview" style={{ background: settings.primaryColor }}><small>PRÉVIA DAS CORES</small><strong>O próximo projeto começa aqui.</strong><span style={{ background: settings.secondaryColor }}>Destaque da sua loja →</span></div></div>}
          {tab === 'promotion' && <>
            <div className="sf-section-intro"><p>Apresente uma campanha ao entrar na página inicial. Edite o conteúdo, confira a prévia e salve para publicar.</p><button type="button" className="sf-secondary" onClick={() => { try { parseStorefrontSettings(settings); setError(''); setPreview(true) } catch (err) { setError(err instanceof Error ? err.message : 'Revise os campos da campanha.') } }}><Eye size={16} /> Visualizar pop-up</button></div>
            <div className="sf-card">
              <h2><Megaphone size={20} /> Sua campanha em destaque</h2>
              <div className="sf-fields">
                <label className="sf-check sf-full"><input type="checkbox" checked={settings.promotion.active} onChange={event => promotion({ active: event.target.checked })} /> Ativar pop-up na página inicial</label>
                <label className="sf-full">Título da campanha<input value={settings.promotion.title} maxLength={110} onChange={event => promotion({ title: event.target.value })} /></label>
                <label className="sf-full">Descrição<textarea value={settings.promotion.description} maxLength={400} onChange={event => promotion({ description: event.target.value })} /></label>
                <div className="sf-full"><strong className="sf-field-title">Imagem da campanha (opcional)</strong><ImageField value={settings.promotion.imageUrl} onChange={imageUrl => promotion({ imageUrl })} /><small className="sf-help">Envie a arte da sua campanha em JPG, PNG ou WEBP. A imagem será exibida inteira, sem cortes. Você também pode usar apenas título e descrição.</small></div>
                <label>Texto do botão principal<input value={settings.promotion.buttonText} maxLength={45} onChange={event => promotion({ buttonText: event.target.value })} /></label>
                <label>Texto do botão de fechar<input value={settings.promotion.dismissText} maxLength={45} onChange={event => promotion({ dismissText: event.target.value })} /></label>
                <label className="sf-full">Destino do botão principal<input value={settings.promotion.link} maxLength={1500} placeholder="/catalogo ou https://..." onChange={event => promotion({ link: event.target.value })} /></label>
                <label>Quando exibir novamente<select value={settings.promotion.frequency} onChange={event => promotion({ frequency: event.target.value as Promotion['frequency'] })}><option value="session">Uma vez por visita (aba do navegador)</option><option value="daily">Uma vez por dia</option><option value="weekly">Uma vez por semana</option></select></label>
                <label>Espera antes de abrir (segundos)<input type="number" min="0" max="60" step="1" value={settings.promotion.delaySeconds} onChange={event => promotion({ delaySeconds: Number(event.target.value) })} /></label>
              </div>
              <div className="sf-promotion-renew"><div><strong>Vai publicar uma nova campanha?</strong><p>Libere a exibição novamente para quem já viu a anterior. A mudança só vale depois de salvar.</p></div><button type="button" className="sf-secondary" onClick={() => promotion({ id: crypto.randomUUID() })}>Renovar campanha</button></div>
              <p className="sf-help">O pop-up usa as cores da aba Aparência. A frequência é controlada neste navegador; desative a campanha quando a promoção terminar.</p>
            </div>
          </>}
          {tab === 'banners' && <><div className="sf-section-intro"><p>Até 8 banners. Altere a ordem com as setas e escolha quais ficam visíveis.</p><button type="button" className="sf-secondary" disabled={settings.banners.length >= 8} onClick={() => edit(current => ({ ...current, banners: [...current.banners, { id: crypto.randomUUID(), active: true, eyebrow: 'NOVIDADES NA Clima', title: 'Seu novo destaque', description: 'Apresente uma novidade ou uma seleção de produtos.', buttonText: 'Ver produtos', link: '/catalogo', imageUrl: '' }] }))}><Plus size={16} /> Adicionar banner</button></div>{settings.banners.map((item, index) => <div className="sf-card" key={item.id}><div className="sf-block-heading"><h2>Banner {index + 1}</h2><div><label className="sf-check"><input type="checkbox" checked={item.active} onChange={event => banner(item.id, { active: event.target.checked })} /> Visível</label><button type="button" aria-label={`Subir banner ${index + 1}`} disabled={index === 0} onClick={() => edit(current => ({ ...current, banners: move(current.banners, index, -1) }))}><ArrowUp size={16} /></button><button type="button" aria-label={`Descer banner ${index + 1}`} disabled={index === settings.banners.length - 1} onClick={() => edit(current => ({ ...current, banners: move(current.banners, index, 1) }))}><ArrowDown size={16} /></button><button type="button" aria-label={`Remover banner ${index + 1}`} onClick={() => edit(current => ({ ...current, banners: current.banners.filter(b => b.id !== item.id) }))}><Trash2 size={16} /></button></div></div><div className="sf-fields"><label className="sf-full">Título principal<input value={item.title} maxLength={110} onChange={event => banner(item.id, { title: event.target.value })} /></label><label>Texto acima do título<input value={item.eyebrow} maxLength={70} onChange={event => banner(item.id, { eyebrow: event.target.value })} /></label><label>Texto do botão<input value={item.buttonText} maxLength={45} onChange={event => banner(item.id, { buttonText: event.target.value })} /></label><label className="sf-full">Descrição<textarea value={item.description} maxLength={260} onChange={event => banner(item.id, { description: event.target.value })} /></label><label className="sf-full">Destino do botão<input value={item.link} onChange={event => banner(item.id, { link: event.target.value })} placeholder="/catalogo ou https://..." /></label><div className="sf-full"><strong className="sf-field-title">Imagem do banner</strong><ImageField value={item.imageUrl} onChange={imageUrl => banner(item.id, { imageUrl })} /><small className="sf-help">Sugestão: imagem horizontal, com pelo menos 1200 px de largura. Sem imagem personalizada, usamos a imagem padrão da Clima.</small></div></div></div>)}</>}
          {tab === 'showcases' && <><div className="sf-section-intro"><p>Escolha a ordem e os produtos de cada carrossel. Vitrines sem produtos ficam ocultas.</p><button type="button" className="sf-secondary" disabled={settings.showcases.length >= 8} onClick={() => edit(current => ({ ...current, showcases: [...current.showcases, { id: crypto.randomUUID(), active: true, title: 'Minha seleção de produtos', subtitle: '', mode: 'manual', productIds: [] }] }))}><Plus size={16} /> Adicionar vitrine</button></div>{settings.showcases.map((item, index) => <div className="sf-card" key={item.id}><div className="sf-block-heading"><h2>Vitrine {index + 1}</h2><div><label className="sf-check"><input type="checkbox" checked={item.active} onChange={event => showcase(item.id, { active: event.target.checked })} /> Visível</label><button type="button" disabled={index === 0} aria-label={`Subir vitrine ${index + 1}`} onClick={() => edit(current => ({ ...current, showcases: move(current.showcases, index, -1) }))}><ArrowUp size={16} /></button><button type="button" disabled={index === settings.showcases.length - 1} aria-label={`Descer vitrine ${index + 1}`} onClick={() => edit(current => ({ ...current, showcases: move(current.showcases, index, 1) }))}><ArrowDown size={16} /></button><button type="button" aria-label={`Remover vitrine ${index + 1}`} onClick={() => edit(current => ({ ...current, showcases: current.showcases.filter(s => s.id !== item.id) }))}><Trash2 size={16} /></button></div></div><div className="sf-fields"><label>Título<input value={item.title} maxLength={100} onChange={event => showcase(item.id, { title: event.target.value })} /></label><label>Tipo da vitrine<select value={item.mode} onChange={event => showcase(item.id, { mode: event.target.value as Showcase['mode'] })}><option value="manual">Escolher os produtos</option><option value="newest">Produtos mais recentes</option><option value="pix">Preço especial no Pix</option><option value="bestsellers">Mais vendidos (vendas aprovadas)</option></select></label><label className="sf-full">Subtítulo<input value={item.subtitle} maxLength={200} onChange={event => showcase(item.id, { subtitle: event.target.value })} /></label>{item.mode === 'manual' && <div className="sf-full sf-product-picker"><strong>Selecione até 24 produtos</strong>{products.map(product => <label className="sf-check" key={product.id}><input type="checkbox" checked={item.productIds.includes(product.id)} onChange={event => showcase(item.id, { productIds: event.target.checked ? [...item.productIds, product.id] : item.productIds.filter(id => id !== product.id) })} disabled={!item.productIds.includes(product.id) && item.productIds.length >= 24} /><span>{product.name}<small>{product.sku}</small></span></label>)}</div>}{item.mode === 'bestsellers' && <p className="sf-help sf-full">Essa vitrine considera apenas pedidos com pagamento aprovado. Sem vendas aprovadas, ela não será exibida.</p>}</div></div>)}</>}
          {tab === 'categories' && <><p className="sf-section-intro">As categorias vêm do seu catálogo. Personalize o texto e a imagem dos cards sem alterar os produtos.</p>{categories.map(category => { const tile = settings.categoryTiles.find(item => item.categoryId === category.id); const update = (change: { title?: string; imageUrl?: string }) => edit(current => { const existing = current.categoryTiles.find(t => t.categoryId === category.id); return { ...current, categoryTiles: [...current.categoryTiles.filter(t => t.categoryId !== category.id), { categoryId: category.id, title: existing?.title || '', imageUrl: existing?.imageUrl || '', ...change }] }; }); return <div className="sf-card" key={category.id}><h2>{category.name}</h2><label className="sf-field-title">Nome no card da página inicial<input value={tile?.title || ''} placeholder={category.name} maxLength={70} onChange={event => update({ title: event.target.value })} /></label><strong className="sf-field-title">Imagem da categoria</strong><ImageField value={tile?.imageUrl || ''} onChange={imageUrl => update({ imageUrl })} /></div> })}</>}
        </section>
      </form>
      {preview && <div style={{ '--clima-primary': settings.primaryColor, '--clima-secondary': settings.secondaryColor, '--clima-on-primary': (parseInt(settings.primaryColor.slice(1, 3), 16) * 299 + parseInt(settings.primaryColor.slice(3, 5), 16) * 587 + parseInt(settings.primaryColor.slice(5, 7), 16) * 114) / 1000 > 165 ? '#102d3a' : '#fff' } as CSSProperties}><PromotionDialog promotion={settings.promotion} preview onClose={() => setPreview(false)} /></div>}
    </main>
  )
}

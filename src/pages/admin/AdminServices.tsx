import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Save, Wrench, ImagePlus, Pencil } from 'lucide-react'
import type { Product } from '../../context/cart'
import { defaultServiceDetails, serviceTypes, type ServiceDetails } from '../../../shared/services'
import { storefrontImageUrl } from '../../utils/storefront'
import '../../components/Services.css'
type Service = Product & { serviceDetails: ServiceDetails }
const empty = () => ({ name: '', description: '', price: '', active: false, imageUrl: '', serviceDetails: { ...defaultServiceDetails } })
export default function AdminServices() {
  const [services, setServices] = useState<Service[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<Service | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  async function load() {
    setLoading(true); setError('')
    try { const response = await fetch('/api/admin/services', { cache: 'no-store' }); const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'Não foi possível carregar os serviços.'); setServices(data) }
    catch (error) { setError(error instanceof Error ? error.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  function edit(service: Service) { setEditing(service); setForm({ name: service.name, description: service.description || '', price: service.price, active: service.active, imageUrl: service.imageUrl || '', serviceDetails: service.serviceDetails }); setError(''); setMessage(''); document.getElementById('service-editor')?.scrollIntoView({ behavior: 'smooth' }) }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || uploading) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(editing ? `/api/admin/services/${editing.id}` : '/api/admin/services', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, updatedAt: editing?.updatedAt }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o serviço.')
      setServices(current => [data, ...current.filter(service => service.id !== data.id)]); setEditing(data); setForm({ ...form, price: data.price }); setMessage(data.active ? 'Serviço salvo e disponível na loja.' : 'Serviço salvo como inativo. Ative quando preço e condições estiverem conferidos.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao salvar.') }
    finally { setBusy(false) }
  }
  async function upload(file?: File) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter no máximo 5 MB.'); return }
    setUploading(true); setError('')
    try { const body = new FormData(); body.append('image', file); const response = await fetch('/api/admin/upload', { method: 'POST', body }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha no envio.'); setForm(current => ({ ...current, imageUrl: data.imageUrl })) }
    catch (error) { setError(error instanceof Error ? error.message : 'Falha no envio.') }
    finally { setUploading(false) }
  }
  const detail = <K extends keyof ServiceDetails>(key: K, value: ServiceDetails[K]) => setForm(current => ({ ...current, serviceDetails: { ...current.serviceDetails, [key]: value } }))
  return <><header className="admin-header"><div className="container admin-header-content"><div><span className="admin-kicker">PAINEL ADMINISTRATIVO</span><h1>Serviços</h1></div><Link className="admin-back-link" to="/servicos">Ver serviços na loja →</Link></div></header><main className="admin-services-page">
    <section className="admin-service-intro"><Wrench size={26} /><div><h2>Instalação, manutenção e limpeza</h2><p>Cadastre serviços com preço fixo, escopo e cidade atendida. O cliente paga no site; a data é combinada com a Clima após a compra. Não há agenda automática.</p><p>Serviços não têm estoque, embalagem ou frete. Você acompanha as vendas em Pedidos.</p></div></section>
    <div className="admin-service-toolbar"><label>Buscar serviço<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do serviço..." /></label><button type="button" className="admin-primary-button" onClick={() => { setEditing(null); setForm(empty()); setMessage(''); setError(''); document.getElementById('service-editor')?.scrollIntoView({ behavior: 'smooth' }) }}><Plus size={18} />Novo serviço</button><button type="button" className="admin-secondary-button" onClick={() => void load()} disabled={loading || busy}>Atualizar lista</button></div>
    {loading ? <p role="status">Carregando serviços...</p> : <section className="admin-service-list" aria-label="Serviços cadastrados">{services.filter(service => service.name.toLowerCase().includes(search.toLowerCase())).map(service => <article key={service.id}><div><span className={`admin-service-state ${service.active ? 'active' : ''}`}>{service.active ? 'Ativo' : 'Inativo'}</span><h3>{service.name}</h3><p>{serviceTypes[service.serviceDetails.type]} · {service.serviceDetails.city}/{service.serviceDetails.state}</p><strong>{Number(service.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><button type="button" className="admin-secondary-button" onClick={() => edit(service)} disabled={busy}><Pencil size={16} />Editar</button></article>)}{!services.length && <p>Nenhum serviço cadastrado. Comece pelo formulário abaixo.</p>}</section>}
    <form id="service-editor" className="admin-service-editor" onSubmit={save}><h2>{editing ? `Editar: ${editing.name}` : 'Cadastrar serviço'}</h2><p>Para começar, escolha um tipo. Preencha o preço e confira o que está incluído antes de ativar.</p><fieldset disabled={busy || uploading}><div className="admin-service-fields">
      <label>Nome do serviço *<input required minLength={3} maxLength={140} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Limpeza de ar-condicionado split até 12.000 BTUs" /></label>
      <label>Tipo *<select value={form.serviceDetails.type} onChange={event => detail('type', event.target.value as ServiceDetails['type'])}>{Object.entries(serviceTypes).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label>
      <label>Preço fixo (R$) *<input required type="number" min="1" max="99999999.99" step="0.01" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label>
      <label>Duração estimada (minutos) *<input required type="number" min="15" max="1440" step="1" value={form.serviceDetails.durationMinutes} onChange={event => detail('durationMinutes', Number(event.target.value))} /></label>
      <label>Cidade atendida *<input required maxLength={100} value={form.serviceDetails.city} onChange={event => detail('city', event.target.value)} /></label><label>Estado (UF) *<input required pattern="[A-Za-z]{2}" maxLength={2} value={form.serviceDetails.state} onChange={event => detail('state', event.target.value.toUpperCase())} /></label>
      <label className="wide">Descrição *<textarea required minLength={10} maxLength={6000} rows={3} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <label className="wide">O que está incluído *<textarea required maxLength={3000} rows={3} value={form.serviceDetails.included} onChange={event => detail('included', event.target.value)} placeholder="Descreva equipamentos, capacidade e atividades cobertos por este preço." /></label>
      <label className="wide">Limites e itens não incluídos *<textarea required maxLength={3000} rows={3} value={form.serviceDetails.excluded} onChange={event => detail('excluded', event.target.value)} placeholder="Ex.: peças, acesso especial ou atividades extras. Se não houver, informe que não há extras." /></label>
      <label className="wide">Imagem (opcional)<input type="url" value={form.imageUrl.startsWith('/uploads/') ? '' : form.imageUrl} onChange={event => setForm({ ...form, imageUrl: event.target.value })} placeholder={form.imageUrl.startsWith('/uploads/') ? 'Imagem enviada à loja' : 'https://...'} /></label>
    </div><label className="admin-secondary-button admin-service-upload"><ImagePlus size={17} />{uploading ? 'Enviando...' : 'Enviar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label>{form.imageUrl && <div className="admin-service-image"><img src={storefrontImageUrl(form.imageUrl)} alt="Prévia do serviço" /><button type="button" onClick={() => setForm({ ...form, imageUrl: '' })}>Remover imagem</button></div>}
    <label className="admin-service-check"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Serviço ativo e disponível para compra</label></fieldset>
    {error && <p role="alert" className="admin-form-error">{error}</p>}{message && <p role="status" className="admin-service-success">{message}</p>}<button type="submit" className="admin-primary-button" disabled={busy || uploading}><Save size={18} />{busy ? 'Salvando...' : 'Salvar serviço'}</button></form>
  </main></>
}

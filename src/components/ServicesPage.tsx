import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, MapPin, Wrench } from 'lucide-react'
import { useCart } from '../context/useCart'
import type { Product } from '../context/cart'
import { defaultServiceDetails, serviceTypes, type ServiceDetails } from '../../shared/services'
import { storefrontImageUrl } from '../utils/storefront'
import { store } from '../config/store'
import './Services.css'
type Service = Product & { serviceDetails: ServiceDetails }
export default function ServicesPage({ onAdd }: { onAdd: () => void }) {
  const [services, setServices] = useState<Service[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0), [type, setType] = useState('')
  const { addToCart } = useCart()
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); void (async () => {
    try { const response = await fetch('/api/services', { signal: controller.signal, cache: 'no-store' }); const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'Não foi possível carregar os serviços.'); if (!controller.signal.aborted) setServices(data) }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Tente novamente.') }
    finally { if (!controller.signal.aborted) setLoading(false) }
  })(); return () => controller.abort() }, [retry])
  return <section className="container clima-services-page"><div className="clima-breadcrumb"><Link to="/">Início</Link><span>/</span><span>Serviços</span></div><div className="clima-services-hero"><span className="clima-eyebrow">CUIDADO EM CADA ETAPA</span><h1>Seu equipamento em boas mãos.</h1><p>Instalação, manutenção e limpeza com a Clima. Escolha um serviço, confira as condições e pague pelo site.</p><div><span><MapPin size={17} />Confira a cidade atendida</span><span><Clock size={17} />Data combinada após a compra</span></div></div>
    <div className="clima-service-filters" aria-label="Tipos de serviço"><button className={!type ? 'active' : ''} onClick={() => setType('')}>Todos</button>{Object.entries(serviceTypes).map(([key, value]) => <button className={type === key ? 'active' : ''} aria-pressed={type === key} key={key} onClick={() => setType(key)}>{value}</button>)}</div>
    {loading ? <p role="status" className="clima-loading">Carregando serviços...</p> : error ? <div className="clima-empty"><p role="alert">{error}</p><button className="clima-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : <div className="clima-service-grid">{services.filter(service => !type || service.serviceDetails.type === type).map(service => { const details = { ...defaultServiceDetails, ...service.serviceDetails }; return <article className="clima-service-card" key={service.id}>
      <div className="clima-service-picture">{service.imageUrl ? <img src={storefrontImageUrl(service.imageUrl)} alt={service.name} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/clima-service-hero.jpg' }} /> : <Wrench size={62} strokeWidth={1.2} />}<span>{serviceTypes[details.type]}</span></div><div className="clima-service-copy"><h2>{service.name}</h2><p>{service.description}</p><ul className="clima-service-facts"><li><MapPin size={16} />{details.city} / {details.state}</li><li><Clock size={16} />Duração estimada: {details.durationMinutes} min</li></ul><details><summary>Ver escopo e condições</summary><h3>Incluído no preço</h3><p>{details.included}</p><h3>Limites e itens não incluídos</h3><p>{details.excluded}</p><p>A compra não reserva uma data automaticamente. A equipe Clima combinará o atendimento. Atividades fora deste escopo precisam de orçamento separado e sua aprovação.</p></details><div className="clima-service-price"><small>Preço fixo por serviço</small><strong>{Number(service.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><span>Sem frete · pagamento pelo site</span></div><button type="button" className="clima-button" onClick={() => { addToCart(service); onAdd() }}>Contratar serviço <ArrowRight size={17} /></button></div>
    </article> })}</div>}
    {!loading && !error && !services.some(service => !type || service.serviceDetails.type === type) && <div className="clima-empty"><Wrench size={36} /><h2>Nenhum serviço disponível nesta seleção.</h2><p>Fale com a Clima para consultar o atendimento que você precisa.</p><a className="clima-button" href={store.whatsappUrl} target="_blank" rel="noopener noreferrer">Consultar atendimento</a></div>}
    <aside className="clima-service-note"><h2>Antes de contratar</h2><p>O preço cobre o escopo descrito em cada serviço e a cidade indicada. Confira tipo, capacidade e condições do equipamento. Após pagar, entre em contato com a Clima pelo número do pedido para combinar a data; o pagamento não confirma um horário.</p></aside>
  </section>
}

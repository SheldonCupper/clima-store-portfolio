import { CustomerCoupons } from '../components/CustomerCoupons'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, Package } from 'lucide-react'
import { useCustomer } from '../context/customer'
import { StoreLogo } from '../components/StoreLogo'
import { store } from '../config/store'
import { formatPhone } from '../../shared/checkoutCustomer'
import './CustomerAccount.css'

type CustomerOrder = { id: number; status: string; paymentStatus: string; total: string; createdAt: string; shippingCompany: string | null; shippingServiceName: string | null; items: { productName: string; quantity: number }[] }
const statusLabels: Record<string, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', PROCESSING: 'Em preparação', SHIPPED: 'Enviado', DELIVERED: 'Entregue', CANCELED: 'Cancelado' }

export default function CustomerAccount() {
  const { customer, checking, logout, refreshCustomer } = useCustomer()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    void refreshCustomer().catch(() => { /* A falha de atualização não apaga uma sessão carregada. */ })
  }, [refreshCustomer])

  useEffect(() => {
    const controller = new AbortController()
    async function loadOrders() {
      try {
        setLoadingOrders(true)
        setError('')
        const response = await fetch('/api/customer/orders', { credentials: 'include', cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus pedidos.')
        if (!controller.signal.aborted) setOrders(data.orders)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Não foi possível carregar seus pedidos.') }
      finally { if (!controller.signal.aborted) setLoadingOrders(false) }
    }
    if (customer) void loadOrders()
    return () => controller.abort()
  }, [customer])

  async function leave() {
    try { setLeaving(true); await logout(); navigate('/', { replace: true }) }
    catch (err) { setLeaving(false); setError(err instanceof Error ? err.message : 'Não foi possível sair.') }
  }

  if (checking || leaving) return <div className="customer-loading">{leaving ? 'Saindo da conta...' : 'Verificando sua conta...'}</div>
  if (!customer) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />

  return (
    <div className="customer-page">
      <header className="customer-header container">
        <Link to="/" className="logo" aria-label={store.name}><StoreLogo /><span>{store.name}</span></Link>
        <Link to="/" className="customer-back"><ArrowLeft size={17} /> Voltar à loja</Link>
      </header>
      <main className="customer-account container">
        <div className="customer-heading"><div><span className="customer-kicker">MINHA CONTA</span><h1>Olá, {customer.name.split(' ')[0]}!</h1></div><button className="customer-secondary" onClick={leave} disabled={leaving}><LogOut size={17} /> {leaving ? 'Saindo...' : 'Sair da conta'}</button></div>
        {customer.emailVerificationRequired !== false && !customer.emailVerifiedAt && <div className="customer-notice"><p>Seu e-mail ainda não foi confirmado.</p><Link to="/reenviar-confirmacao" state={{ email: customer.email }}>Confirmar meu e-mail</Link></div>}
        <section className="customer-profile"><h2>Meus dados</h2><dl><div><dt>Nome</dt><dd>{customer.name}</dd></div><div><dt>E-mail</dt><dd>{customer.email}{customer.emailVerifiedAt && ' · Confirmado'}</dd></div><div><dt>Telefone</dt><dd>{formatPhone(customer.phone)}</dd></div><div><dt>CPF</dt><dd>{customer.cpf}</dd></div></dl></section>
        <CustomerCoupons wallet /><section className="customer-orders"><h2>Meus pedidos</h2><p>Acompanhe os pedidos feitos enquanto você está conectado à sua conta.</p>
          {error && <p role="alert" className="customer-error">{error}</p>}
          {loadingOrders ? <p>Carregando pedidos...</p> : orders.length === 0 ? <div className="customer-empty"><Package size={32} /><strong>Você ainda não tem pedidos nesta conta.</strong><Link to="/" className="customer-primary">Explorar produtos</Link></div> : orders.map(order => (
            <article className="customer-order" key={order.id}>
              <div className="customer-order-top"><div><strong>Pedido #{order.id}</strong><small>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</small></div><span className="customer-status">{statusLabels[order.status] || order.status}</span></div>
              <p>{order.items.map(item => `${item.quantity} × ${item.productName}`).join(' · ')}</p>
              {order.shippingCompany && <small>Entrega: {order.shippingCompany} · {order.shippingServiceName}</small>}
              <div className="customer-order-bottom"><strong>{Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><Link to={`/pedido/${order.id}`}>Ver detalhes do pedido →</Link></div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

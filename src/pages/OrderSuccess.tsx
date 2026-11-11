import ServiceOrderSummary from '../components/ServiceOrderSummary'
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MapPin,
  Package,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import OrderPayment from '../components/OrderPayment'

type Order = {
  id: number
  status: string
  paymentMethod: string
  paymentStatus: string
  paymentReviewRequired: boolean
  subtotal: string
  shipping: string
  shippingServiceName: string | null
  shippingCompany: string | null
  shippingDeliveryTime: number | null
  couponCode?: string | null
  discount: string
  total: string
  createdAt: string

  address: {
    cep: string
    street: string
    number: string
    district: string
    city: string
    state: string
    complement: string | null
  }

  items: {
    id: number
    isService?: boolean
    serviceDetails?: import('../../shared/services').ServiceDetails
    productName: string
    sku: string
    unitPrice: string
    quantity: number
    total: string
  }[]
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

function OrderSuccess() {
  const { id } = useParams()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshOrder = useCallback(async () => {
    const response = await fetch(`/api/orders/${id}`, { credentials: 'include', cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o pedido.')
    setOrder(data)
  }, [id])

  useEffect(() => {
    async function loadOrder() {
      try {
        setLoading(true)
        setError('')
        setOrder(null)

        const response = await fetch(
          `/api/orders/${id}`,
          { credentials: 'include', cache: 'no-store' }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || 'Erro ao carregar pedido'
          )
        }

        setOrder(data)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar pedido'
        )
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [id])

  if (loading) {
    return (
      <div className="order-result-page">
        <div className="order-result-card">
          <p>Carregando pedido...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="order-result-page">
        <div className="order-result-card">
          <h2>Não foi possível carregar o pedido</h2>
          <p>{error}</p>

          <Link to="/" className="order-back-button">
            <ArrowLeft size={18} />
            Voltar para a loja
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="order-result-page">
      <div className="container order-result-container">
        <div className="order-success-header">
          <CheckCircle2 size={54} />

          <h1>Pedido realizado com sucesso!</h1>

          <p>
            Seu pedido <strong>#{order.id}</strong> foi recebido.
          </p>
        </div>

        <ServiceOrderSummary orderId={order.id} items={order.items} status={order.status} paymentStatus={order.paymentStatus} />
        <div className="order-result-grid">
          <section className="order-result-main">
            <div className="order-result-box">
              <div className="order-result-box-title">
                <Package size={20} />
                <strong>Itens do pedido</strong>
              </div>

              {order.items.map((item) => (
                <div
                  className="order-result-item"
                  key={item.id}
                >
                  <div>
                    <strong>{item.productName}</strong>
                    <span>SKU: {item.sku}</span>
                  </div>

                  <div>
                    <span>
                      {item.quantity} x{' '}
                      {money(Number(item.unitPrice))}
                    </span>

                    <strong>
                      {money(Number(item.total))}
                    </strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="order-result-box">
              <div className="order-result-box-title">
                <MapPin size={20} />
                <strong>Endereço de entrega</strong>
              </div>

              <p>
                {order.address.street},{' '}
                {order.address.number}
              </p>

              <p>
                {order.address.district} -{' '}
                {order.address.city}/
                {order.address.state}
              </p>

              <p>CEP: {order.address.cep}</p>

              {order.shippingCompany && order.shippingServiceName && (
                <p>Entrega: {order.shippingCompany} · {order.shippingServiceName}</p>
              )}

              {order.shippingDeliveryTime != null && (
                <p>
                  Prazo: até {order.shippingDeliveryTime} dia{order.shippingDeliveryTime === 1 ? '' : 's'} úteis
                </p>
              )}

              {order.address.complement && (
                <p>{order.address.complement}</p>
              )}
            </div>

            <div className="order-result-box">
              <div className="order-result-box-title">
                <CreditCard size={20} />
                <strong>Pagamento</strong>
              </div>

              <OrderPayment id={order.id} method={order.paymentMethod} status={order.paymentStatus} orderStatus={order.status} review={Boolean(order.paymentReviewRequired)} refreshOrder={refreshOrder} />
            </div>
          </section>

          <aside className="order-result-summary">
            <h3>Resumo</h3>

            <div>
              <span>Subtotal</span>
              <strong>
                {money(Number(order.subtotal))}
              </strong>
            </div>

            <div>
              <span>Frete</span>
              <strong>
                {money(Number(order.shipping))}
              </strong>
            </div>

            <div>
              <span>Desconto{order.couponCode ? ` · ${order.couponCode}` : ''}</span>
              <strong>
                {money(Number(order.discount))}
              </strong>
            </div>

            <div className="order-result-total">
              <span>Total</span>
              <strong>
                {money(Number(order.total))}
              </strong>
            </div>

            <p>
              Status do pedido:
              <strong> {order.status}</strong>
            </p>

            <Link to="/" className="order-back-button">
              <ArrowLeft size={18} />
              Voltar para a loja
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default OrderSuccess

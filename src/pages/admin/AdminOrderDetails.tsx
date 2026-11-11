import ServiceOrderSummary from '../../components/ServiceOrderSummary'
import OrderCancelDialog, { type CancellationOrder } from '../../components/OrderCancelDialog'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  Package,
  User,
  MapPin,
  CreditCard,
} from 'lucide-react'

type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'

type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REFUSED'
  | 'CANCELED'
  | 'REFUNDED'

type Order = {
  id: number
  status: OrderStatus
  paymentMethod: 'PIX' | 'CREDIT_CARD'
  paymentStatus: PaymentStatus
  refundRequest?: CancellationOrder['refundRequest']
  paymentReviewRequired?: boolean
  paymentCheckouts?: { environment: string; preferenceId: string | null; expiresAt: string; lastSyncedAt: string | null }[]
  subtotal: string
  shipping: string
  shippingServiceId: string | null
  shippingServiceName: string | null
  shippingCompany: string | null
  shippingDeliveryTime: number | null
  couponCode?: string | null
  discount: string
  total: string
  createdAt: string

  customer: {
    name: string
    email: string
    phone: string
    cpf: string
  }

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
    serviceDetails?: import('../../../shared/services').ServiceDetails
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

function paymentMethodLabel(method: Order['paymentMethod']) {
  return method === 'PIX' ? 'Pix' : 'Cartão de crédito'
}

function paymentStatusLabel(status: PaymentStatus) {
  const labels = {
    PENDING: 'Pendente',
    APPROVED: 'Aprovado',
    REFUSED: 'Recusado',
    CANCELED: 'Cancelado',
    REFUNDED: 'Reembolsado',
  }

  return labels[status]
}

function AdminOrderDetails() {
  const { id } = useParams()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  function updateCancellation(updated: CancellationOrder) { setOrder(current => current ? { ...current, ...updated, status: updated.status as OrderStatus, paymentStatus: updated.paymentStatus as PaymentStatus } : current) }

  async function refreshPayment() {
    if (!order || saving) return
    setSaving(true); setPaymentError('')
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/payment/refresh`, { method: 'POST', credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o pagamento.')
      const updated = await fetch(`/api/admin/orders/${order.id}`, { credentials: 'include', cache: 'no-store' })
      if (!updated.ok) throw new Error('Não foi possível atualizar o pedido.')
      setOrder(await updated.json())
    } catch (err) { setPaymentError(err instanceof Error ? err.message : 'Não foi possível atualizar o pagamento.') }
    finally { setSaving(false) }
  }

  useEffect(() => {
    async function loadOrder() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          `/api/admin/orders/${id}`,
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

  async function handleStatusChange(
    newStatus: OrderStatus
  ) {
    if (!order || saving) return
    if (newStatus === 'CANCELED') { setCancelOpen(true); return }

    try {
      setSaving(true)

      const response = await fetch(
        `/api/orders/${order.id}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao atualizar status'
        )
      }

      setOrder((current) =>
        current
          ? {
              ...current,
              status: data.status,
              paymentStatus: data.paymentStatus,
            }
          : current
      )
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar status'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <main className="container admin-content">
          <div className="admin-empty">
            Carregando pedido...
          </div>
        </main>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="admin-page">
        <main className="container admin-content">
          <div className="admin-empty">
            <strong>Erro ao carregar pedido</strong>
            <span>{error}</span>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Pedido #{order.id}</h1>
          </div>

          <Link
            to="/admin/pedidos"
            className="admin-back-link"
          >
            <ArrowLeft size={18} />
            Voltar para pedidos
          </Link>
        </div>
      </header>

      <main className="container admin-content">
        <ServiceOrderSummary orderId={order.id} items={order.items} status={order.status} paymentStatus={order.paymentStatus} admin />
        {cancelOpen && <OrderCancelDialog orderId={order.id} onClose={() => setCancelOpen(false)} onUpdate={updateCancellation} />}
        <div className="admin-order-detail-grid">
          <section className="admin-form-card">
            <div className="admin-card-header">
              <div>
                <strong>Resumo do pedido</strong>
                <span>
                  {new Date(order.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>

              <ClipboardList size={22} />
            </div>

            <div className="admin-order-status-area">
              <label>Status do pedido</label>

              <select
                className="admin-order-status-select"
                value={order.status}
                disabled={saving || order.status === 'CANCELED' || order.refundRequest?.status === 'REQUESTED'}
                onChange={(e) =>
                  handleStatusChange(
                    e.target.value as OrderStatus
                  )
                }
              >
                <option value="PENDING">Pendente</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="PROCESSING">
                  {order.items.every(item => item.isService) ? 'Em execução' : 'Em preparação'}
                </option>
                <option value="SHIPPED">Enviado</option>
                <option value="DELIVERED">{order.items.every(item => item.isService) ? 'Concluído' : 'Entregue'}</option>
                <option value="CANCELED">Cancelado</option>
              </select>
              {order.refundRequest?.status === 'REQUESTED' && <p role="status">Estorno em conferência. O estoque permanece reservado. <button type="button" className="admin-secondary-button" onClick={() => setCancelOpen(true)}>Conferir estorno</button></p>}
              <small>{order.status === 'CANCELED' ? 'Pedidos cancelados não podem ser reabertos.' : 'Pedidos pagos exigem confirmação do estorno integral para cancelar e devolver o estoque.'}</small>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-header">
              <strong>Cliente</strong>
              <User size={22} />
            </div>

            <div className="admin-detail-list">
              <span>
                <strong>Nome:</strong> {order.customer.name}
              </span>

              <span>
                <strong>E-mail:</strong> {order.customer.email}
              </span>

              <span>
                <strong>Telefone:</strong> {order.customer.phone}
              </span>

              <span>
                <strong>CPF:</strong> {order.customer.cpf}
              </span>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-header">
              <strong>Endereço</strong>
              <MapPin size={22} />
            </div>

            <div className="admin-detail-list">
              <span>
                {order.address.street}, {order.address.number}
              </span>

              <span>{order.address.district}</span>

              <span>
                {order.address.city} - {order.address.state}
              </span>

              <span>CEP: {order.address.cep}</span>

              {order.address.complement && (
                <span>
                  Complemento: {order.address.complement}
                </span>
              )}
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-header">
              <strong>Pagamento</strong>
              <CreditCard size={22} />
            </div>

            <div className="admin-detail-list">
              <span>
                <strong>Forma:</strong>{' '}
                {paymentMethodLabel(order.paymentMethod)}
              </span>

              <span>
                <strong>Status:</strong>{' '}
                {paymentStatusLabel(order.paymentStatus)}
              </span>
              {order.paymentReviewRequired && <p role="alert">Pagamento em conferência: verifique cobranças duplicadas, contestação ou aprovação após cancelamento no Mercado Pago antes de separar produtos.</p>}
              {!!order.paymentCheckouts?.length && <>
                <span><strong>Provedor:</strong> Mercado Pago · {order.paymentCheckouts[0].environment === 'sandbox' ? 'Teste' : 'Produção'}</span>
                <button type="button" className="admin-back-link" disabled={saving} onClick={() => void refreshPayment()}>{saving ? 'Consultando...' : 'Atualizar pagamento no Mercado Pago'}</button>
              </>}
              {paymentError && <p role="alert">{paymentError}</p>}
            </div>
          </section>
        </div>

        <section className="admin-card admin-order-products">
          <div className="admin-card-header">
            <div>
              <strong>Produtos do pedido</strong>
              <span>
                {order.items.length} item
                {order.items.length === 1 ? '' : 's'}
              </span>
            </div>

            <Package size={22} />
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Preço unitário</th>
                  <th>Qtd.</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.productName}</strong>
                    </td>

                    <td>{item.sku}</td>

                    <td>
                      {money(Number(item.unitPrice))}
                    </td>

                    <td>{item.quantity}</td>

                    <td>
                      {money(Number(item.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-form-card admin-order-totals">
          <div>
            <span>Subtotal</span>
            <strong>
              {money(Number(order.subtotal))}
            </strong>
          </div>

          <div>
            <span>
              Frete
              {order.shippingCompany &&
                order.shippingServiceName && (
                  <>
                    {' '}· {order.shippingCompany} / {order.shippingServiceName}
                  </>
                )}
            </span>
            <strong>
              {money(Number(order.shipping))}
            </strong>
          </div>

          <div>
            <span>Prazo de entrega</span>
            <strong>
              {order.shippingDeliveryTime != null
                ? `Até ${order.shippingDeliveryTime} dia${order.shippingDeliveryTime === 1 ? '' : 's'} úteis`
                : 'Não informado'}
            </strong>
          </div>

          <div>
            <span>Desconto{order.couponCode ? ` · ${order.couponCode}` : ''}</span>
            <strong>
              - {money(Number(order.discount))}
            </strong>
          </div>

          <div className="admin-order-total-final">
            <span>Total</span>
            <strong>
              {money(Number(order.total))}
            </strong>
          </div>
        </section>
      </main>
    </div>
  )
}

export default AdminOrderDetails

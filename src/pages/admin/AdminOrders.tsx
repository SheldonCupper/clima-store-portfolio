import OrderCancelDialog, { type CancellationOrder } from '../../components/OrderCancelDialog'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  Search,
} from 'lucide-react'

type Order = {
  refundRequest?: CancellationOrder['refundRequest']
  paymentReviewRequired?: boolean
  id: number

  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELED'

  paymentMethod: 'PIX' | 'CREDIT_CARD'

  paymentStatus:
    | 'PENDING'
    | 'APPROVED'
    | 'REFUSED'
    | 'CANCELED'
    | 'REFUNDED'

  total: string
  createdAt: string

  customer: {
    id: number
    name: string
    email: string
    phone: string
  }

  items: {
    id: number
    isService?: boolean
    productName: string
    quantity: number
  }[]
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

function formatDate(date: string) {
  return new Date(date).toLocaleString('pt-BR')
}

function translatePaymentStatus(
  status: Order['paymentStatus']
) {
  const statuses = {
    PENDING: 'Pendente',
    APPROVED: 'Aprovado',
    REFUSED: 'Recusado',
    CANCELED: 'Cancelado',
    REFUNDED: 'Reembolsado',
  }

  return statuses[status]
}

function translatePaymentMethod(
  method: Order['paymentMethod']
) {
  if (method === 'PIX') {
    return 'Pix'
  }

  return 'Cartão'
}

function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  function updateCancellation(updated: CancellationOrder) { setOrders(current => current.map(order => order.id === updated.id ? { ...order, ...updated, status: updated.status as Order['status'], paymentStatus: updated.paymentStatus as Order['paymentStatus'] } : order)) }

  useEffect(() => {
    async function loadOrders() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          '/api/orders',
          {
            credentials: 'include',
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || 'Erro ao carregar pedidos'
          )
        }

        setOrders(data)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar pedidos'
        )
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [])

  async function handleStatusChange(
    orderId: number,
    newStatus: Order['status']
  ) {
    if (savingId !== null) return
    if (newStatus === 'CANCELED') { setCancelId(orderId); return }
    try {
      setSavingId(orderId)
      const response = await fetch(
        `/api/orders/${orderId}/status`,
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

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: data.status,
                paymentStatus: data.paymentStatus,
              }
            : order
        )
      )
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar status'
      )
    } finally { setSavingId(null) }
  }

  const filteredOrders = useMemo(() => {
    const term = search.toLowerCase().trim()

    if (!term) {
      return orders
    }

    return orders.filter((order) => {
      return (
        String(order.id).includes(term) ||
        order.customer.name
          .toLowerCase()
          .includes(term) ||
        order.customer.email
          .toLowerCase()
          .includes(term)
      )
    })
  }, [orders, search])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Pedidos</h1>
          </div>

          <Link
            to="/"
            className="admin-back-link"
          >
            <ArrowLeft size={18} />
            Voltar para a loja
          </Link>
        </div>
      </header>

      <main className="container admin-content">
        {cancelId !== null && <OrderCancelDialog orderId={cancelId} onClose={() => setCancelId(null)} onUpdate={updateCancellation} />}
        <section className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Buscar pedido ou cliente..."
            />
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <strong>
                Pedidos realizados
              </strong>

              <span>
                {orders.length} pedido
                {orders.length === 1 ? '' : 's'}
              </span>
            </div>

            <ClipboardList size={24} />
          </div>

          {loading && (
            <div className="admin-empty">
              <ClipboardList size={40} />

              <strong>
                Carregando pedidos...
              </strong>
            </div>
          )}

          {error && (
            <div className="admin-empty">
              <ClipboardList size={40} />

              <strong>
                Erro ao carregar pedidos
              </strong>

              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Data</th>
                    <th>Pagamento</th>
                    <th>Total</th>
                    <th>Status pagamento</th>
                    <th>Status pedido</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>
                          #{order.id}
                        </strong>
                      </td>

                      <td>
                        <div>
                          <strong>
                            {order.customer.name}
                          </strong>

                          <div
                            style={{
                              fontSize: '11px',
                              opacity: 0.65,
                              marginTop: 3,
                            }}
                          >
                            {order.customer.email}
                          </div>
                        </div>
                      </td>

                      <td>
                        {formatDate(
                          order.createdAt
                        )}
                      </td>

                      <td>
                        {translatePaymentMethod(
                          order.paymentMethod
                        )}
                      </td>

                      <td>
                        {money(
                          Number(order.total)
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            order.paymentStatus ===
                            'APPROVED'
                              ? 'admin-status active'
                              : 'admin-status inactive'
                          }
                        >
                          {translatePaymentStatus(
                            order.paymentStatus
                          )}
                        </span>
                      </td>

                      <td>
                        <select
                          value={order.status}
                          disabled={order.status === 'CANCELED' || savingId !== null || order.refundRequest?.status === 'REQUESTED'}
                          onChange={(e) =>
                            handleStatusChange(
                              order.id,
                              e.target.value as Order['status']
                            )
                          }
                          className="admin-order-status-select"
                        >
                          <option value="PENDING">
                            Pendente
                          </option>

                          <option value="CONFIRMED">
                            Confirmado
                          </option>

                          <option value="PROCESSING">
                            {order.items.length > 0 && order.items.every(item => item.isService) ? 'Em execução' : 'Em preparação'}
                          </option>

                          <option value="SHIPPED">
                            Enviado
                          </option>

                          <option value="DELIVERED">
                            {order.items.length > 0 && order.items.every(item => item.isService) ? 'Concluído' : 'Entregue'}
                          </option>

                          <option value="CANCELED">
                            Cancelado
                          </option>
                        </select>
                        {order.refundRequest?.status === 'REQUESTED' && <p><button type="button" className="admin-secondary-button" onClick={() => setCancelId(order.id)}>Conferir estorno</button></p>}
                      </td>

                      <td>
                        <Link
                            to={`/admin/pedidos/${order.id}`}
                            className="admin-edit-button"
                            title="Ver pedido"
                          >
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredOrders.length === 0 && (
                <div className="admin-empty">
                  <Search size={36} />

                  <strong>
                    Nenhum pedido encontrado
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

export default AdminOrders

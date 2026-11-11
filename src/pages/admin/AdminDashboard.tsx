import {
  useEffect,
  useState,
} from 'react'

import {
  Package,
  ClipboardList,
  Users,
  DollarSign,
  AlertTriangle,
  Clock3,
  ArrowRight,
} from 'lucide-react'

import { Link } from 'react-router-dom'

type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'

type PaymentMethod =
  | 'PIX'
  | 'CREDIT_CARD'

type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REFUSED'
  | 'CANCELED'
  | 'REFUNDED'

type RecentOrder = {
  id: number
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  total: number
  createdAt: string

  customer: {
    id: number
    name: string
    email: string
  }
}

type DashboardData = {
  totalProducts: number
  totalOrders: number
  totalCustomers: number
  pendingOrders: number
  lowStockProducts: number
  totalSales: number
  recentOrders: RecentOrder[]
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

function formatDate(date: string) {
  return new Date(date).toLocaleString(
    'pt-BR'
  )
}

function orderStatusLabel(
  status: OrderStatus
) {
  const labels = {
    PENDING: 'Pendente',
    CONFIRMED: 'Confirmado',
    PROCESSING: 'Em preparação',
    SHIPPED: 'Enviado',
    DELIVERED: 'Entregue',
    CANCELED: 'Cancelado',
  }

  return labels[status]
}

function paymentMethodLabel(
  paymentMethod: PaymentMethod
) {
  return paymentMethod === 'PIX'
    ? 'Pix'
    : 'Cartão'
}

function AdminDashboard() {
  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null)

  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    fetch(
      '/api/admin/dashboard',
      {
        credentials: 'include',
      }
    )
      .then(async (response) => {
        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Erro ao carregar dashboard'
          )
        }

        if (!cancelled) {
          setDashboard(data)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar dashboard'
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="admin-page">
        <main className="container admin-content">
          <div className="admin-empty">
            <strong>
              Erro ao carregar dashboard
            </strong>

            <span>{error}</span>
          </div>
        </main>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="admin-page">
        <main className="container admin-content">
          <div className="admin-empty">
            Carregando dashboard...
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

            <h1>Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="container admin-content">
        <div className="admin-dashboard-grid">
          <div className="admin-dashboard-card">
            <div>
              <span>
                Produtos ativos
              </span>

              <strong>
                {dashboard.totalProducts}
              </strong>
            </div>

            <Package size={28} />
          </div>

          <div className="admin-dashboard-card">
            <div>
              <span>
                Pedidos
              </span>

              <strong>
                {dashboard.totalOrders}
              </strong>
            </div>

            <ClipboardList size={28} />
          </div>

          <div className="admin-dashboard-card">
            <div>
              <span>
                Clientes
              </span>

              <strong>
                {dashboard.totalCustomers}
              </strong>
            </div>

            <Users size={28} />
          </div>

          <div className="admin-dashboard-card">
            <div>
              <span>
                Valor em pedidos
              </span>

              <strong>
                {money(
                  dashboard.totalSales
                )}
              </strong>
            </div>

            <DollarSign size={28} />
          </div>

          <div className="admin-dashboard-card">
            <div>
              <span>
                Pedidos pendentes
              </span>

              <strong>
                {dashboard.pendingOrders}
              </strong>
            </div>

            <Clock3 size={28} />
          </div>

          <div className="admin-dashboard-card">
            <div>
              <span>
                Estoque baixo
              </span>

              <strong>
                {dashboard.lowStockProducts}
              </strong>
            </div>

            <AlertTriangle size={28} />
          </div>
        </div>

        <section className="admin-card admin-dashboard-orders">
          <div className="admin-card-header">
            <div>
              <strong>
                Pedidos recentes
              </strong>

              <span>
                Últimos pedidos realizados
              </span>
            </div>

            <Link
              to="/admin/pedidos"
              className="admin-dashboard-view-all"
            >
              Ver todos

              <ArrowRight size={15} />
            </Link>
          </div>

          {dashboard.recentOrders.length === 0 ? (
            <div className="admin-empty">
              Nenhum pedido realizado
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Data</th>
                    <th>Pagamento</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.recentOrders.map(
                    (order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>
                            #{order.id}
                          </strong>
                        </td>

                        <td>
                          <div>
                            <strong>
                              {
                                order.customer
                                  .name
                              }
                            </strong>

                            <div className="admin-dashboard-customer-email">
                              {
                                order.customer
                                  .email
                              }
                            </div>
                          </div>
                        </td>

                        <td>
                          {formatDate(
                            order.createdAt
                          )}
                        </td>

                        <td>
                          {paymentMethodLabel(
                            order.paymentMethod
                          )}
                        </td>

                        <td>
                          <strong>
                            {money(
                              order.total
                            )}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={
                              order.status ===
                              'DELIVERED'
                                ? 'admin-status active'
                                : 'admin-status inactive'
                            }
                          >
                            {orderStatusLabel(
                              order.status
                            )}
                          </span>
                        </td>

                        <td>
                          <Link
                            to={`/admin/pedidos/${order.id}`}
                            className="admin-dashboard-order-link"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminDashboard
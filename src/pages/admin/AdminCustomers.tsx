import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Search,
  ShoppingBag,
} from 'lucide-react'

type Customer = {
  id: number | string
  name: string
  email: string
  phone: string
  cpf: string
  createdAt: string

  _count: {
    orders: number
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR')
}

function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          '/api/admin/customers',
          {
            credentials: 'include',
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || 'Erro ao carregar clientes'
          )
        }

        setCustomers(data)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar clientes'
        )
      } finally {
        setLoading(false)
      }
    }

    loadCustomers()
  }, [])

  const filteredCustomers = useMemo(() => {
    const term = search.toLowerCase().trim()

    if (!term) {
      return customers
    }

    return customers.filter((customer) => {
      return (
        customer.name
          .toLowerCase()
          .includes(term) ||
        customer.email
          .toLowerCase()
          .includes(term) ||
        customer.phone.includes(term) ||
        customer.cpf.includes(term)
      )
    })
  }, [customers, search])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="container admin-header-content">
          <div>
            <span className="admin-kicker">
              PAINEL ADMINISTRATIVO
            </span>

            <h1>Clientes</h1>
          </div>
        </div>
      </header>

      <main className="container admin-content">
        <section className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Buscar cliente..."
            />
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <strong>Clientes cadastrados</strong>

              <span>
                {customers.length} cliente
                {customers.length === 1 ? '' : 's'}
              </span>
            </div>

            <Users size={24} />
          </div>

          {loading && (
            <div className="admin-empty">
              <Users size={40} />

              <strong>
                Carregando clientes...
              </strong>
            </div>
          )}

          {error && (
            <div className="admin-empty">
              <strong>
                Erro ao carregar clientes
              </strong>

              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>CPF</th>
                    <th>Pedidos</th>
                    <th>Cadastro</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <div>
                          <strong>
                            {customer.name}
                          </strong>

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              opacity: 0.65,
                            }}
                          >
                            {customer.email}
                          </div>
                        </div>
                      </td>

                      <td>
                        {customer.phone}
                      </td>

                      <td>
                        {customer.cpf}
                      </td>

                      <td>
                        <span className="admin-customer-orders">
                          <ShoppingBag size={14} />

                          {customer._count.orders}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          customer.createdAt
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredCustomers.length === 0 && (
                <div className="admin-empty">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminCustomers
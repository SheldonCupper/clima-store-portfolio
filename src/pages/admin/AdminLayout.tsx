import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { store } from '../../config/store'
import { StoreLogo } from '../../components/StoreLogo'
import {
  RefreshCw,
  ChartNoAxesCombined,
  Wrench,
  LayoutDashboard,
  Package,
  ClipboardList,
  Tags,
  Users,
  Store,
  LogOut,
  Palette,
  TicketPercent,
} from 'lucide-react'

function AdminLayout() {
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      const response = await fetch(
        '/api/admin/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      )
      if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.')
      navigate('/entrar', {
        replace: true,
      })
    } catch {
      setLogoutError('Não foi possível sair. Tente novamente.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <StoreLogo />
          <div>
            <strong>{store.shortName}</strong>
            <span>E Climatização · Admin</span>
          </div>
        </div>

        <nav className="admin-sidebar-menu">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              isActive
                ? 'admin-sidebar-link active'
                : 'admin-sidebar-link'
            }
          >
            <LayoutDashboard size={19} />
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/produtos"
            className={({ isActive }) =>
              isActive
                ? 'admin-sidebar-link active'
                : 'admin-sidebar-link'
            }
          >
            <Package size={19} />
            Produtos
          </NavLink>

          <NavLink to="/admin/servicos" className={({ isActive }) => isActive ? 'admin-sidebar-link active' : 'admin-sidebar-link'}><Wrench size={19} />Serviços</NavLink>
          <NavLink
            to="/admin/pedidos"
            className={({ isActive }) =>
              isActive
                ? 'admin-sidebar-link active'
                : 'admin-sidebar-link'
            }
          >
            <ClipboardList size={19} />
            Pedidos
          </NavLink>

          <NavLink
            to="/admin/categorias"
            className={({ isActive }) =>
              isActive
                ? 'admin-sidebar-link active'
                : 'admin-sidebar-link'
            }
          >
            <Tags size={19} />
            Categorias
          </NavLink>

          <NavLink
            to="/admin/clientes"
            className={({ isActive }) =>
              isActive
                ? 'admin-sidebar-link active'
                : 'admin-sidebar-link'
            }
          >
            <Users size={19} />
            Clientes
          </NavLink>
          <NavLink to="/admin/cupons" className={({ isActive }) => isActive ? 'admin-sidebar-link active' : 'admin-sidebar-link'}><TicketPercent size={19} />Cupons</NavLink>
          <NavLink to="/admin/personalizar" className={({ isActive }) => isActive ? 'admin-sidebar-link active' : 'admin-sidebar-link'}><Palette size={19} />Personalizar loja</NavLink>
          <NavLink to="/admin/financeiro" className={({ isActive }) => isActive ? 'admin-sidebar-link active' : 'admin-sidebar-link'}><ChartNoAxesCombined size={19} />Financeiro e relatórios</NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <NavLink
            to="/"
            className="admin-sidebar-store"
          >
            <Store size={18} />
            Voltar para loja
          </NavLink>

          <button
            type="button"
            className="admin-sidebar-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={18} />
            {loggingOut ? 'Saindo...' : 'Sair'}
          </button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      </aside>

      <div className="admin-layout-content">
        <div className="admin-refresh-toolbar"><button type="button" disabled={refreshing} title="Recarregar esta tela; alterações não salvas serão descartadas." onClick={() => { setRefreshing(true); window.location.reload() }}><RefreshCw size={16} />{refreshing ? 'Atualizando...' : 'Atualizar página'}</button></div>
        <Outlet />
      </div>
    </div>
  )
}

export default AdminLayout

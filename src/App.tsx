const AdminSales = lazy(() => import('./pages/admin/AdminSales'))
import { lazy, Suspense } from 'react'
const AdminServices = lazy(() => import('./pages/admin/AdminServices'))
import AdminCoupons from './pages/admin/AdminCoupons'
import { Route, Routes } from 'react-router-dom'

import Home from './pages/Home'
import Checkout from './pages/Checkout'
import OrderSuccess from './pages/OrderSuccess'
import CustomerAuth from './pages/CustomerAuth'
import CustomerAccount from './pages/CustomerAccount'
import CustomerRecovery from './pages/CustomerRecovery'

import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminProducts from './pages/admin/AdminProducts'
import AdminProductNew from './pages/admin/AdminProductNew'
import AdminProductEdit from './pages/admin/AdminProductEdit'
import AdminOrders from './pages/admin/AdminOrders'
import AdminOrderDetails from './pages/admin/AdminOrderDetails'
import AdminCategories from './pages/admin/AdminCategories'
import AdminCustomers from './pages/admin/AdminCustomers'
import AdminLogin from './pages/admin/AdminLogin'
import AdminProtectedRoute from './pages/admin/AdminProtectedRoute'
import AdminStorefront from './pages/admin/AdminStorefront'

import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/produto/:productSlug" element={<Home />} />
      <Route path="/orcamento" element={<Home />} />
      <Route path="/favoritos" element={<Home />} />
      <Route path="/servicos" element={<Home />} />
      <Route path="/catalogo" element={<Home />} />
      <Route path="/categoria/:slug" element={<Home />} />
      <Route path="/entrar" element={<CustomerAuth />} />
      <Route path="/cadastro" element={<CustomerAuth register />} />
      <Route path="/conta" element={<CustomerAccount />} />
      <Route path="/meus-pedidos" element={<CustomerAccount />} />
      <Route path="/esqueci-senha" element={<CustomerRecovery key="forgot" mode="forgot" />} />
      <Route path="/redefinir-senha" element={<CustomerRecovery key="reset" mode="reset" />} />
      <Route path="/confirmar-email" element={<CustomerRecovery key="verify" mode="verify" />} />
      <Route path="/reenviar-confirmacao" element={<CustomerRecovery key="resend" mode="resend" />} />

      <Route
        path="/checkout"
        element={<Checkout />}
      />

      <Route
        path="/pedido/:id"
        element={<OrderSuccess />}
      />

      <Route
        path="/admin/login"
        element={<AdminLogin />}
      />

      <Route element={<AdminProtectedRoute />}>
        <Route
          path="/admin"
          element={<AdminLayout />}
        >
          <Route
            index
            element={<AdminDashboard />}
          />

          <Route
            path="produtos"
            element={<AdminProducts />}
          />

          <Route
            path="produtos/novo"
            element={<AdminProductNew />}
          />

          <Route
            path="produtos/:id/editar"
            element={<AdminProductEdit />}
          />

          <Route
            path="pedidos"
            element={<AdminOrders />}
          />

          <Route
            path="pedidos/:id"
            element={<AdminOrderDetails />}
          />

          <Route
            path="categorias"
            element={<AdminCategories />}
          />

          <Route
            path="clientes"
            element={<AdminCustomers />}
          />
          <Route path="servicos" element={<Suspense fallback={<p>Carregando serviços...</p>}><AdminServices /></Suspense>} />
          <Route path="cupons" element={<AdminCoupons />} />
          <Route path="personalizar" element={<AdminStorefront />} />
          <Route path="financeiro" element={<Suspense fallback={<p>Carregando relatórios...</p>}><AdminSales /></Suspense>} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App

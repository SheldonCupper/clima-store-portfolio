import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

function AdminProtectedRoute() {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(
      '/api/admin/me',
      {
        credentials: 'include',
      }
    )
      .then((response) => {
        if (!cancelled) {
          setAuthenticated(response.ok)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthenticated(false)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (checking) {
    return (
      <div className="admin-auth-loading">
        Verificando acesso...
      </div>
    )
  }

  if (!authenticated) {
    return (
      <Navigate
        to="/entrar"
        replace
      />
    )
  }

  return <Outlet />
}

export default AdminProtectedRoute

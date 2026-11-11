import { Navigate } from 'react-router-dom'

// Preserva o endereço antigo usando o mesmo acesso da loja.
export default function AdminLogin() {
  return <Navigate to="/entrar" replace />
}

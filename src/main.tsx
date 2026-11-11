import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { CustomerProvider } from './context/CustomerProvider'
import './index.css'
import App from './App'


if (import.meta.env.MODE === 'demo') {
  const { installDemo } = await import('./demo/install')
  installDemo()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {import.meta.env.MODE === 'demo' && <aside className="portfolio-demo" aria-label="Demonstração de portfólio"><strong>PROJETO DEMONSTRATIVO</strong><span>Marca, produtos e valores fictícios · Sem compras reais</span><a href="/">Loja</a><a href="/admin">Painel demo</a></aside>}
      <CustomerProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </CustomerProvider>
    </BrowserRouter>
  </StrictMode>,
)

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { useQuote } from '../hooks/useQuote'

export default function QuoteButton({ productId, quantity = 1 }: { productId: number; quantity?: number }) {
  const { items, add } = useQuote()
  const [full, setFull] = useState(false)
  const present = items.some(item => item.productId === productId)
  return <div className="clima-quote-button-wrap">{present ? <Link className="clima-quote-button" to="/orcamento"><ClipboardList size={16} />Ver no orçamento</Link> : <button type="button" className="clima-quote-button" onClick={() => setFull(!add(productId, quantity))}><ClipboardList size={16} />Adicionar ao orçamento</button>}{full && <span role="alert">A lista aceita até 20 produtos. <Link to="/orcamento">Revise seu orçamento.</Link></span>}</div>
}

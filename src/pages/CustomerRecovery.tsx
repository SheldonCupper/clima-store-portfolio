import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { StoreLogo } from '../components/StoreLogo'
import { store } from '../config/store'
import { useCustomer } from '../context/customer'
import './CustomerAccount.css'

type Mode = 'forgot' | 'reset' | 'verify' | 'resend'
const options = {
  forgot: { title: 'Esqueci minha senha', description: 'Informe seu Gmail para solicitar um link de recuperação.', endpoint: 'forgot-password', button: 'Enviar link de recuperação' },
  reset: { title: 'Criar nova senha', description: 'Escolha uma nova senha para sua conta.', endpoint: 'reset-password', button: 'Salvar nova senha' },
  verify: { title: 'Confirmar meu e-mail', description: 'Confirme abaixo para concluir a verificação do seu e-mail.', endpoint: 'verify-email', button: 'Confirmar e-mail' },
  resend: { title: 'Confirmar meu e-mail', description: 'Informe seu Gmail para solicitar um novo link de confirmação.', endpoint: 'resend-verification', button: 'Enviar link de confirmação' },
}

export default function CustomerRecovery({ mode }: { mode: Mode }) {
  const location = useLocation()
  const { setCustomer, refreshCustomer } = useCustomer()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [email, setEmail] = useState(typeof location.state?.email === 'string' ? location.state.email : '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const config = options[mode]
  const needsToken = mode === 'reset' || mode === 'verify'
  const validToken = /^[a-f0-9]{64}$/.test(token)

  useEffect(() => {
    if (needsToken && window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [needsToken])

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    if (needsToken && !validToken) { setError('Abra o link recebido por e-mail ou solicite um novo.'); return }
    if (!needsToken && !/^[^\s@]+@gmail\.com$/i.test(email.trim())) { setError('Informe um endereço @gmail.com válido.'); return }
    if (mode === 'reset' && (password.length < 8 || new TextEncoder().encode(password).length > 72)) { setError('Use uma senha com pelo menos 8 caracteres e no máximo 72 bytes.'); return }
    if (mode === 'reset' && password !== confirmation) { setError('As senhas precisam ser iguais.'); return }
    try {
      setSaving(true)
      const response = await fetch(`/api/customer/${config.endpoint}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsToken ? { token, ...(mode === 'reset' ? { password } : {}) } : { email: email.trim().toLowerCase() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.')
      if (mode === 'verify') await refreshCustomer().catch(() => { /* A confirmação já foi salva; a conta consulta novamente ao abrir. */ })
      if (mode === 'reset') { setCustomer(null); setPassword(''); setConfirmation('') }
      setMessage(data.message)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.') }
    finally { setSaving(false) }
  }

  return <div className="customer-page">
    <header className="customer-header container"><Link to="/" className="logo" aria-label={store.name}><StoreLogo /><span>{store.name}</span></Link><Link to="/entrar" className="customer-back"><ArrowLeft size={17} /> Voltar para entrar</Link></header>
    <main className="customer-auth-card"><span className="customer-kicker">SUA CONTA CLIMA STORE</span><h1>{config.title}</h1><p>{config.description}</p>
      {message ? <div className="customer-notice" role="status"><p>{message}</p><Link to="/entrar">Entrar na minha conta</Link></div> : needsToken && !validToken ? <div className="customer-notice"><p>Abra o link recebido por e-mail. Se ele expirou, solicite outro.</p><Link to={mode === 'reset' ? '/esqueci-senha' : '/reenviar-confirmacao'}>Solicitar novo link</Link></div> : <form onSubmit={submit} noValidate>
        {!needsToken && <div className="customer-field"><label htmlFor="recovery-email">E-mail Gmail</label><input id="recovery-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="seuemail@gmail.com" required /></div>}
        {mode === 'reset' && <><div className="customer-field"><label htmlFor="new-password">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} placeholder="Pelo menos 8 caracteres" required /></div><div className="customer-field"><label htmlFor="confirm-password">Confirmar nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></div></>}
        {error && <p role="alert" className="customer-error">{error}</p>}<button className="customer-primary" disabled={saving}>{saving ? 'Aguarde...' : config.button}</button>
      </form>}
      {error && needsToken && <p className="customer-auth-switch"><Link to={mode === 'reset' ? '/esqueci-senha' : '/reenviar-confirmacao'}>Solicitar novo link</Link></p>}
      <p className="customer-security"><LockKeyhole size={14} /> Os links são temporários e de uso único.</p>
    </main>
  </div>
}

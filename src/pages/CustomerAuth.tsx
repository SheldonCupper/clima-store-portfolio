import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { StoreLogo } from '../components/StoreLogo'
import { store } from '../config/store'
import { useCustomer } from '../context/customer'
import { checkoutCustomerErrors, cpfDigits, formatPhone, normalizeCheckoutCustomer } from '../../shared/checkoutCustomer'
import './CustomerAccount.css'

export default function CustomerAuth({ register = false }: { register?: boolean }) {
  const { customer, checking, setCustomer } = useCustomer()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destination = ['/checkout', '/conta', '/meus-pedidos'].includes(params.get('next') || '') ? params.get('next')! : '/conta'
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpf: '', password: '', confirmation: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState('')
  const [googleEnabled, setGoogleEnabled] = useState(false)
  useEffect(() => { const controller = new AbortController(); fetch('/api/customer/google/status', { signal: controller.signal, cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (!controller.signal.aborted) setGoogleEnabled(data?.enabled === true) }).catch(() => {}); return () => controller.abort() }, [])
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const fieldErrors = checkoutCustomerErrors(form)
  const emailError = register ? fieldErrors.email : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 254 ? 'Informe um e-mail válido.' : undefined)
  const setField = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }))

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/me', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setAdminAuthenticated(response.ok) })
      .catch(() => { /* O formulário permite uma nova tentativa se a consulta falhar. */ })
      .finally(() => { if (!controller.signal.aborted) setCheckingAdmin(false) })
    return () => controller.abort()
  }, [])

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setAttempted(true)
    setError('')
    const validation = register ? Object.values(fieldErrors)[0] : emailError
    if (validation) { setError(validation); return }
    if (!form.password || (register && form.password.length < 8)) { setError('Use uma senha com pelo menos 8 caracteres.'); return }
    if (register && form.password !== form.confirmation) { setError('As senhas precisam ser iguais.'); return }
    try {
      setSaving(true)
      const response = await fetch(`/api/customer/${register ? 'register' : 'login'}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...normalizeCheckoutCustomer(form), password: form.password }),
      })
      const data = await response.json()
      if (data.requiresVerification) {
        setVerificationMessage(data.message || data.error || 'Confirme seu e-mail para entrar.')
        return
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível acessar sua conta.')
      if (data.role === 'ADMIN') {
        setCustomer(null)
        navigate('/admin', { replace: true })
        return
      }
      setCustomer(data.customer)
      navigate(destination, { replace: true })
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível acessar sua conta.') }
    finally { setSaving(false) }
  }

  if (checking || checkingAdmin) return <div className="customer-loading">Verificando sua conta...</div>
  if (!register && adminAuthenticated) return <Navigate to="/admin" replace />
  if (customer) return <Navigate to={destination} replace />

  return (
    <div className="customer-page">
      <header className="customer-header container">
        <Link to="/" className="logo" aria-label={store.name}><StoreLogo /><span>{store.name}</span></Link>
        <Link to="/" className="customer-back"><ArrowLeft size={17} /> Voltar à loja</Link>
      </header>
      <main className="customer-auth-card">
        <span className="customer-kicker">SUA CONTA CLIMA STORE</span>
        <h1>{register ? 'Criar minha conta' : 'Bem-vindo de volta'}</h1>
        <p>{register ? 'Cadastre-se para acompanhar os pedidos feitos com sua conta.' : 'Entre com seu e-mail e senha para acessar sua área.'}</p>
        {params.get('google') === 'error' && <p role="alert" className="customer-error">Não foi possível entrar com Google. Use uma conta Gmail; se já possui cadastro, confirme seu e-mail e tente novamente. Você também pode entrar com sua senha.</p>}
        {googleEnabled && <p><a className="customer-primary customer-google" href={`/api/customer/google/start?next=${encodeURIComponent(destination)}`}>Continuar com Google</a></p>}
        {verificationMessage && <div className="customer-notice" role="status"><p>{verificationMessage}</p><Link to="/reenviar-confirmacao" state={{ email: form.email }}>Solicitar novo link de confirmação</Link><p><button type="button" className="customer-secondary" onClick={() => setVerificationMessage('')}>Voltar ao formulário</button></p></div>}
        {!verificationMessage && <form onSubmit={submit} noValidate>
          {register && (
            <div className="customer-field">
              <label htmlFor="customer-name">Nome completo</label>
              <input id="customer-name" autoComplete="name" value={form.name} onChange={e => setField('name', e.target.value)} required />
              {attempted && fieldErrors.name && <small className="customer-error">{fieldErrors.name}</small>}
            </div>
          )}
          <div className="customer-field">
            <label htmlFor="customer-email">{register ? 'E-mail Gmail' : 'E-mail'}</label>
            <input id="customer-email" type="email" autoComplete={register ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} maxLength={254} placeholder={register ? 'seuemail@gmail.com' : 'Seu e-mail'} value={form.email} onChange={e => setField('email', e.target.value)} required />
            {attempted && emailError && <small className="customer-error">{emailError}</small>}
          </div>
          {register && (
            <div className="customer-form-row">
              <div className="customer-field">
                <label htmlFor="customer-phone">Telefone com DDD</label>
                <input id="customer-phone" type="tel" autoComplete="tel-national" maxLength={13} placeholder="11 00000-0000" value={form.phone} onChange={e => setField('phone', formatPhone(e.target.value))} onPaste={e => { e.preventDefault(); setField('phone', formatPhone(e.clipboardData.getData('text'))) }} required />
                {attempted && fieldErrors.phone && <small className="customer-error">{fieldErrors.phone}</small>}
              </div>
              <div className="customer-field">
                <label htmlFor="customer-cpf">CPF</label>
                <input id="customer-cpf" inputMode="numeric" maxLength={11} placeholder="11 números" value={form.cpf} onChange={e => setField('cpf', cpfDigits(e.target.value))} onPaste={e => { e.preventDefault(); setField('cpf', cpfDigits(e.clipboardData.getData('text'))) }} required />
                {attempted && fieldErrors.cpf && <small className="customer-error">{fieldErrors.cpf}</small>}
              </div>
            </div>
          )}
          <div className="customer-field">
            <label htmlFor="customer-password">Senha</label>
            <div className="customer-password">
              <input id="customer-password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} maxLength={72} value={form.password} onChange={e => setField('password', e.target.value)} placeholder={register ? 'Pelo menos 8 caracteres' : 'Sua senha'} required />
              <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          {register && <div className="customer-field"><label htmlFor="customer-confirmation">Confirmar senha</label><input id="customer-confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={72} value={form.confirmation} onChange={e => setField('confirmation', e.target.value)} required /></div>}
          {error && <p role="alert" className="customer-error">{error}</p>}
          {!register && <Link className="customer-recovery-link" to="/esqueci-senha">Esqueci minha senha</Link>}
          <button className="customer-primary" disabled={saving}>{saving ? 'Aguarde...' : register ? 'Criar conta' : 'Entrar'}</button>
        </form>}
        <p className="customer-auth-switch">{register ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <Link to={`${register ? '/entrar' : '/cadastro'}?next=${encodeURIComponent(destination)}`}>{register ? 'Entrar' : 'Criar conta'}</Link></p>
        <p className="customer-security"><LockKeyhole size={14} /> Sua senha fica protegida.</p>
      </main>
    </div>
  )
}

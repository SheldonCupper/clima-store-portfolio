import { defaultServiceDetails } from '../../shared/services'
import '../components/Services.css'
import { WelcomeCouponOffer } from '../components/WelcomeCouponOffer'
import { useCheckoutCoupon } from '../hooks/useCheckoutCoupon'
import { storefrontImageUrl } from '../utils/storefront'
import {
  ArrowLeft,
  CreditCard,
  MapPin,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import {
  Link,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useCart } from '../context/useCart'
import { useCustomer } from '../context/customer'
import {
  checkoutCustomerErrors,
  cpfDigits,
  formatPhone,
  normalizeCheckoutCustomer,
  type CustomerField,
} from '../../shared/checkoutCustomer'

const money = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

type ShippingOption = {
  id: string
  name: string
  price: number
  deliveryTime: number | null
  company: string
  companyPicture: string | null
}

function Checkout() {
  const { cart, clearCart } = useCart()
  const serviceItems = cart.filter(item => item.product.isService)
  const requiresShipping = cart.some(item => !item.product.isService)
  const [acceptServiceTerms, setAcceptServiceTerms] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialCoupon = (searchParams.get('cupom') ?? '').slice(0, 30).trim().toUpperCase()
  const { customer: account, checking } = useCustomer()

  const [nameValue, setName] = useState<string | null>(null)
  const [emailValue, setEmail] = useState<string | null>(null)
  const [phoneValue, setPhone] = useState<string | null>(null)
  const [cpfValue, setCpf] = useState<string | null>(null)
  const name = nameValue ?? account?.name ?? ''
  const email = account?.email ?? emailValue ?? ''
  const phone = phoneValue ?? (account ? formatPhone(account.phone) : '')
  const cpf = cpfValue ?? account?.cpf ?? ''
  const [touchedCustomerFields, setTouchedCustomerFields] = useState<Partial<Record<CustomerField, boolean>>>({})
  const customer = { name, email, phone, cpf }
  const customerErrors = checkoutCustomerErrors(customer)

  function touchCustomerField(field: CustomerField) {
    setTouchedCustomerFields((current) => ({ ...current, [field]: true }))
  }

  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [complement, setComplement] = useState('')

  const [paymentMethod, setPaymentMethod] = useState<
    'PIX' | 'CREDIT_CARD'
  >('PIX')

  const [cepLoading, setCepLoading] = useState(false)
  const [cepMessage, setCepMessage] = useState('')

  const [shippingResult, setShippingResult] = useState<{
    request: string
    status: 'loading' | 'success' | 'error'
    options: ShippingOption[]
    error: string
  } | null>(null)
  const [selectedShippingId, setSelectedShippingId] = useState<string | null>(null)
  const [shippingRetry, setShippingRetry] = useState(0)
  const cepRequest = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const coupon = useCheckoutCoupon(cart.map(item => ({ productId: item.product.id, quantity: item.quantity })), paymentMethod, initialCoupon)

  const cleanCep = cep.replace(/\D/g, '')
  const canCalculateShipping = cleanCep.length === 8 && cart.length > 0 && requiresShipping
  const shippingRequest = JSON.stringify({
    cep: cleanCep,
    paymentMethod,
    items: cart.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    })),
  })
  const currentShipping = shippingResult?.request === shippingRequest
    ? shippingResult
    : null
  const shippingOptions = canCalculateShipping && currentShipping?.status === 'success'
    ? currentShipping.options
    : []
  const selectedShipping = shippingOptions.find((option) => option.id === selectedShippingId) ?? null
  const shippingLoading = canCalculateShipping &&
    (!currentShipping || currentShipping.status === 'loading')
  const shippingError = currentShipping?.error || ''

  useEffect(() => {
    const controller = new AbortController()

    async function calculateShipping() {
      setError('')
      setSelectedShippingId(null)
      setShippingResult({ request: shippingRequest, status: 'loading', options: [], error: '' })
      try {
        const response = await fetch('/api/shipping/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: shippingRequest,
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Erro ao calcular frete')
        }
        if (!Array.isArray(data.quotes) || data.quotes.length === 0) {
          throw new Error('Nenhuma opção de frete disponível para este CEP.')
        }
        if (controller.signal.aborted) return
        setShippingResult({ request: shippingRequest, status: 'success', options: data.quotes, error: '' })
      } catch (err) {
        if (controller.signal.aborted) return
        setShippingResult({
          request: shippingRequest,
          status: 'error',
          options: [],
          error: err instanceof Error ? err.message : 'Erro ao calcular frete',
        })
      }
    }

    if (canCalculateShipping) void calculateShipping()
    return () => controller.abort()
  }, [shippingRequest, canCalculateShipping, shippingRetry])

  useEffect(() => () => cepRequest.current?.abort(), [])

  function formatCep(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`
  }

  async function lookupCep(value: string) {
    cepRequest.current?.abort()
    const controller = new AbortController()
    cepRequest.current = controller
    const digits = value.replace(/\D/g, '')
    setCepMessage('')
    setStreet('')
    setDistrict('')
    setCity('')
    setState('')

    if (digits.length !== 8) {
      setCepLoading(false)
      return
    }

    try {
      setCepLoading(true)
      setError('')
      const response = await fetch(`/api/cep/${digits}`, {
        signal: controller.signal,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'CEP não encontrado')
      }
      if (controller.signal.aborted) return
      setStreet(data.street || '')
      setDistrict(data.district || '')
      setCity(data.city || '')
      setState(data.state || '')
      setCepMessage('Endereço encontrado. Confira o número e o complemento.')
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Erro ao consultar CEP')
    } finally {
      if (!controller.signal.aborted) setCepLoading(false)
    }
  }

  function handleCepChange(value: string) {
    const formatted = formatCep(value)
    setCep(formatted)
    setSelectedShippingId(null)
    void lookupCep(formatted)
  }

  function handlePaymentChange(method: 'PIX' | 'CREDIT_CARD') {
    if (method === paymentMethod) return
    setSelectedShippingId(null)
    setPaymentMethod(method)
  }

  const checkoutSubtotal = cart.reduce(
    (total, item) => {
      const unitPrice =
        paymentMethod === 'PIX' &&
        item.product.pixPrice
          ? Number(item.product.pixPrice)
          : Number(item.product.price)

      return total + unitPrice * item.quantity
    },
    0
  )

  const shippingValue =
    selectedShipping?.price ?? 0

  const checkoutTotal =
    (coupon.subtotal ?? checkoutSubtotal) + shippingValue - coupon.discount

  async function handleConfirmOrder() {
    setMessage('')
    setError('')

    if (!account) { navigate('/entrar?next=%2Fcheckout'); return }
    if (cart.length === 0) {
      setError('Seu carrinho está vazio.')
      return
    }

    setTouchedCustomerFields({ name: true, email: true, phone: true, cpf: true })
    if (Object.keys(customerErrors).length > 0) {
      setError(Object.values(customerErrors)[0]!)
      const field = Object.keys(customerErrors)[0]
      document.getElementById(`checkout-${field}`)?.focus()
      return
    }

    if (
      !cep ||
      !street ||
      !number ||
      !district ||
      !city ||
      !state
    ) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }

    if (serviceItems.length && !acceptServiceTerms) { setError('Confirme as condições dos serviços para continuar.'); return }

    if (coupon.blocked) { setError('Valide o cupom ou remova-o para continuar.'); return }

    if (loading || shippingLoading || cepLoading || (requiresShipping && !selectedShipping)) {
      setError('Selecione uma opção de entrega.')
      return
    }

    try {
      setLoading(true)

      const response = await fetch(
        '/api/orders',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer: normalizeCheckoutCustomer(customer),
            address: {
              cep,
              street,
              number,
              district,
              city,
              state,
              complement,
            },
            paymentMethod,
            couponCode: coupon.code || undefined,
            acceptServiceTerms: serviceItems.length ? acceptServiceTerms : undefined,
            shippingOption: selectedShipping ? { serviceId: selectedShipping.id } : undefined,
            items: cart.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
            })),
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erro ao criar pedido'
        )
      }

      clearCart()
      navigate(`/pedido/${data.orderId}`)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao criar pedido'
      )
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <div className="customer-loading">Verificando sua conta...</div>
  if (!account) return <main className="customer-auth-card"><h1>Entre para finalizar sua compra</h1><p>Crie uma conta ou entre para comprar e acompanhar seus pedidos. Seu carrinho será mantido.</p><p><Link className="customer-primary" to="/entrar?next=%2Fcheckout">Entrar na minha conta</Link></p><p><Link className="customer-secondary" to="/cadastro?next=%2Fcheckout">Criar minha conta</Link></p><p><Link to="/orcamento">Solicitar orçamento sem cadastro</Link></p><Link to="/carrinho">Voltar ao carrinho</Link></main>
  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <div className="container checkout-header-content">
          <Link to="/" className="checkout-back">
            <ArrowLeft size={18} />
            Voltar para a loja
          </Link>

          <strong>Finalizar compra</strong>
        </div>
      </header>

      <main className="container checkout-layout">
        <section className="checkout-main">
          <div className="checkout-box">
            <div className="checkout-box-title">
              <MapPin size={20} />
              <div>
                <strong>Dados do cliente</strong>
                <span>{account ? 'Confira os dados da sua conta' : 'Informe seus dados para continuar'}</span>
              </div>
            </div>


            <div className="checkout-form">
              <div className="form-group">
                <label htmlFor="checkout-name">Nome completo</label>
                <input
                  id="checkout-name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => touchCustomerField('name')}
                  aria-invalid={Boolean(touchedCustomerFields.name && customerErrors.name)}
                  aria-describedby={touchedCustomerFields.name && customerErrors.name ? 'checkout-name-error' : undefined}
                  placeholder="Digite seu nome completo"
                />
                {touchedCustomerFields.name && customerErrors.name && (
                  <span id="checkout-name-error" className="checkout-field-error">{customerErrors.name}</span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="checkout-email">E-mail Gmail</label>
                  <input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    required
                    readOnly={Boolean(account)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => {
                      setEmail(email.trim().toLowerCase())
                      touchCustomerField('email')
                    }}
                    aria-invalid={Boolean(touchedCustomerFields.email && customerErrors.email)}
                    aria-describedby="checkout-email-help"
                    placeholder="seuemail@gmail.com"
                  />
                  <span id="checkout-email-help" className={touchedCustomerFields.email && customerErrors.email ? 'checkout-field-error' : 'checkout-field-help'}>
                    {touchedCustomerFields.email && customerErrors.email ? customerErrors.email : 'Use um endereço @gmail.com.'}
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-phone">Telefone</label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={13}
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault()
                      setPhone(formatPhone(e.clipboardData.getData('text')))
                    }}
                    onBlur={() => touchCustomerField('phone')}
                    aria-invalid={Boolean(touchedCustomerFields.phone && customerErrors.phone)}
                    aria-describedby="checkout-phone-help"
                    placeholder="34 99256-2467"
                  />
                  <span id="checkout-phone-help" className={touchedCustomerFields.phone && customerErrors.phone ? 'checkout-field-error' : 'checkout-field-help'}>
                    {touchedCustomerFields.phone && customerErrors.phone ? customerErrors.phone : 'Informe o DDD e o telefone (10 ou 11 números).'}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="checkout-cpf">CPF</label>
                <input
                  id="checkout-cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  minLength={11}
                  maxLength={11}
                  pattern="[0-9]{11}"
                  required
                  value={cpf}
                  onChange={(e) => setCpf(cpfDigits(e.target.value))}
                  onPaste={(e) => {
                    e.preventDefault()
                    setCpf(cpfDigits(e.clipboardData.getData('text')))
                  }}
                  onBlur={() => touchCustomerField('cpf')}
                  aria-invalid={Boolean(touchedCustomerFields.cpf && customerErrors.cpf)}
                  aria-describedby="checkout-cpf-help"
                  placeholder="00000000000"
                />
                <span id="checkout-cpf-help" className={touchedCustomerFields.cpf && customerErrors.cpf ? 'checkout-field-error' : 'checkout-field-help'}>
                  {touchedCustomerFields.cpf && customerErrors.cpf ? customerErrors.cpf : 'Somente números, exatamente 11 dígitos.'}
                </span>
              </div>
            </div>
          </div>

          <div className="checkout-box">
            <div className="checkout-box-title">
              <MapPin size={20} />
              <div>
                <strong>{serviceItems.length ? 'Endereço de entrega / execução do serviço' : 'Endereço de entrega'}</strong>
                <span>{serviceItems.length ? 'Informe o local de execução dos serviços e de entrega dos produtos, se houver.' : 'Onde você deseja receber seu pedido?'}</span>
              </div>
            </div>

            <div className="checkout-form">
              <div className="form-row">
                <div className="form-group">
                  <label>CEP</label>
                  <input
                    value={cep}
                    onChange={(e) =>
                      handleCepChange(e.target.value)
                    }
                    placeholder="00000-000"
                    maxLength={9}
                  />

                  {cepLoading && (
                    <span className="checkout-field-help">
                      Buscando CEP...
                    </span>
                  )}

                  {!cepLoading && cepMessage && (
                    <span className="checkout-field-success">
                      {cepMessage}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label>Número</label>
                  <input
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="123"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Rua</label>
                <input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Nome da rua"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Bairro</label>
                  <input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Bairro"
                  />
                </div>

                <div className="form-group">
                  <label>Cidade</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Estado</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="MG"
                    maxLength={2}
                  />
                </div>

                <div className="form-group">
                  <label>Complemento</label>
                  <input
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto, bloco..."
                  />
                </div>
              </div>
            </div>
          </div>

          {requiresShipping && <div className="checkout-box">
            <div className="checkout-box-title">
              <Truck size={20} />
              <div>
                <strong>Opções de entrega</strong>
                <span>Escolha a transportadora e o prazo</span>
              </div>
            </div>

            {shippingLoading ? (
              <div className="shipping-loading">
                Consultando transportadoras...
              </div>
            ) : shippingOptions.length > 0 ? (
              <div className="shipping-options">
                {shippingOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`shipping-option ${
                      selectedShipping?.id === option.id
                        ? 'active'
                        : ''
                    }`}
                    disabled={loading}
                    aria-pressed={selectedShipping?.id === option.id}
                    onClick={() => setSelectedShippingId(option.id)}
                  >
                    <div className="shipping-option-company">
                      {option.companyPicture && (
                        <img
                          src={option.companyPicture}
                          alt={option.company}
                        />
                      )}

                      <div>
                        <strong>{option.company}</strong>
                        <span>{option.name}</span>
                      </div>
                    </div>

                    <div className="shipping-option-info">
                      <strong>{money(option.price)}</strong>
                      <span>
                        {option.deliveryTime != null
                          ? `até ${option.deliveryTime} dia${
                              option.deliveryTime === 1
                                ? ''
                                : 's'
                            } úteis`
                          : 'Prazo informado pela transportadora'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="shipping-empty">
                {shippingError || 'Informe um CEP válido para consultar as entregas.'}
              </div>
            )}

            {canCalculateShipping && !shippingLoading && (
              <button
                type="button"
                className="checkout-back"
                disabled={loading}
                onClick={() => setShippingRetry((value) => value + 1)}
              >
                {shippingError ? 'Tentar novamente' : 'Recalcular frete'}
              </button>
            )}
          </div>}

          <div className="checkout-box">
            <div className="checkout-box-title">
              <CreditCard size={20} />
              <div>
                <strong>Forma de pagamento</strong>
                <span>Escolha como deseja pagar</span>
              </div>
            </div>

            <div className="payment-options">
              <button
                type="button"
                className={`payment-option ${
                  paymentMethod === 'PIX'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  handlePaymentChange('PIX')
                }
              >
                <strong>Pix</strong>
                <span>{requiresShipping ? 'Pagamento rápido e com desconto' : 'Pagamento pelo Mercado Pago'}</span>
              </button>

              <button
                type="button"
                className={`payment-option ${
                  paymentMethod === 'CREDIT_CARD'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  handlePaymentChange('CREDIT_CARD')
                }
              >
                <strong>Cartão de crédito</strong>
                <span>{serviceItems.length ? 'Pagamento pelo Mercado Pago' : 'Parcele sua compra'}</span>
              </button>
            </div>
          </div>
        </section>

        <aside className="checkout-summary">
          <div className="checkout-summary-title">
            <ShoppingBag size={20} />
            <strong>Resumo do pedido</strong>
          </div>

          {cart.length === 0 ? (
            <div className="summary-placeholder">
              <span>Seu carrinho está vazio.</span>
            </div>
          ) : (
            <div className="checkout-items">
              {cart.map((item) => {
                const officialPrice = coupon.itemPrices.find(price => price.productId === item.product.id)?.unitPrice
                const unitPrice = officialPrice ?? (
                  paymentMethod === 'PIX' &&
                  item.product.pixPrice
                    ? Number(item.product.pixPrice)
                    : Number(item.product.price))

                return (
                  <div
                    className="checkout-item"
                    key={item.product.id}
                  >
                    <img
                      src={
                        storefrontImageUrl(item.product.imageUrl) ||
                        '/product-placeholder.svg'
                      }
                      alt={item.product.name}
                    />

                    <div>
                      <strong>{item.product.name}</strong>
                      <span>
                        {item.quantity} x {money(unitPrice)}
                      </span>
                    </div>

                    <strong>
                      {money(unitPrice * item.quantity)}
                    </strong>
                  </div>
                )
              })}
            </div>
          )}

          <div className="summary-line">
            <span>Subtotal</span>
            <strong>{money(coupon.subtotal ?? checkoutSubtotal)}</strong>
          </div>

          <div className="summary-line">
            <span>Frete</span>
            <strong>
              {!requiresShipping ? 'Não se aplica (serviços)' : shippingLoading
                ? 'Calculando...'
                : selectedShipping
                  ? money(selectedShipping.price)
                  : 'A calcular'}
            </strong>
          </div>

          {selectedShipping && (
            <div className="summary-shipping-service">
              <span>
                {selectedShipping.company} · {selectedShipping.name}
              </span>

              {selectedShipping.deliveryTime != null && (
                <span>
                  Prazo: até {selectedShipping.deliveryTime}{' '}
                  dia
                  {selectedShipping.deliveryTime === 1
                    ? ''
                    : 's'}{' '}
                  úteis
                </span>
              )}
            </div>
          )}

          <WelcomeCouponOffer accountId={account.id} apply={coupon.select} currentCode={coupon.code} />
          <form className="checkout-coupon" onSubmit={coupon.apply}>
            <label htmlFor="checkout-coupon-code">Cupom de desconto</label>
            <div><input id="checkout-coupon-code" value={coupon.input} maxLength={30} autoCapitalize="characters" autoComplete="off" placeholder="Digite o código" onChange={event => coupon.setInput(event.target.value.toUpperCase())} disabled={loading} /><button type="submit" disabled={loading || coupon.busy || !coupon.input.trim()}>{coupon.busy ? 'Validando...' : 'Aplicar'}</button></div>
            {coupon.code && <button type="button" onClick={coupon.remove} disabled={loading}>Remover cupom {coupon.code}</button>}
            {coupon.error && <p role="alert">{coupon.error}</p>}
            {coupon.discount > 0 && <p role="status">Cupom {coupon.code} aplicado. O desconto será conferido ao finalizar.</p>}
          </form>
          {coupon.discount > 0 && <div className="summary-line"><span>Desconto · {coupon.code}</span><strong>− {money(coupon.discount)}</strong></div>}

          <div className="summary-total">
            <span>Total</span>
            <strong>{money(checkoutTotal)}</strong>
          </div>

          {serviceItems.length > 0 && <section className="checkout-service-terms"><h3>Condições dos serviços</h3>{serviceItems.map(item => { const details = { ...defaultServiceDetails, ...item.product.serviceDetails }; return <details key={item.product.id}><summary>{item.product.name} · {details.city}/{details.state}</summary><p><strong>Incluído:</strong> {details.included}</p><p><strong>Limites:</strong> {details.excluded}</p><p>Duração estimada: {details.durationMinutes} minutos.</p></details> })}<p>O endereço informado será usado para o atendimento. A compra não reserva uma data. Após o pagamento, combine o agendamento com a Clima. Serviços extras exigem orçamento separado.</p><label><input type="checkbox" checked={acceptServiceTerms} onChange={event => setAcceptServiceTerms(event.target.checked)} disabled={loading} />Li o escopo, os limites e a área atendida dos serviços e concordo em combinar a data com a Clima após a compra.</label></section>}
          {(error || shippingError) && (
            <p className="checkout-error-message" role="alert">
              {error || shippingError}
            </p>
          )}

          {message && (
            <p className="checkout-success-message">
              {message}
            </p>
          )}

          <button
            className="checkout-confirm-button"
            disabled={
              cart.length === 0 ||
              loading ||
              cepLoading ||
              shippingLoading ||
              coupon.blocked ||
              (requiresShipping && !selectedShipping) ||
              (serviceItems.length > 0 && !acceptServiceTerms)
            }
            onClick={handleConfirmOrder}
          >
            {loading
              ? 'Criando pedido...'
              : 'Confirmar pedido'}
          </button>
        </aside>
      </main>
    </div>
  )
}

export default Checkout

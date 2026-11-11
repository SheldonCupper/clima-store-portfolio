export type CouponKind = 'PERCENT' | 'FIXED'
export type CouponRules = { code: string; kind: CouponKind; value: string | number; minSubtotal: string | number; maxDiscount: string | number | null; active: boolean; startsAt: Date | string | null; expiresAt: Date | string | null; usageLimit: number | null; usedCount: number }
export function couponCode(value: unknown) {
  if (typeof value !== 'string') throw new Error('Informe o código do cupom.')
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code)) throw new Error('Use um código de 3 a 30 letras, números, hífen ou sublinhado.')
  return code
}
export function moneyCents(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Valor monetário inválido.')
  const text = String(value)
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Use valores positivos com até duas casas decimais.')
  const [whole, decimal = ''] = text.split('.')
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
}
export function couponDiscount(coupon: CouponRules, subtotal: number, now = new Date()) {
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > 9999999999) throw new Error('Subtotal inválido.')
  if (!coupon.active || (coupon.startsAt && new Date(coupon.startsAt) > now) || (coupon.expiresAt && new Date(coupon.expiresAt) <= now)) throw new Error('Cupom inválido, inativo ou fora da validade.')
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new Error('Este cupom atingiu o limite de utilizações.')
  if (subtotal < moneyCents(coupon.minSubtotal)) throw new Error(`Este cupom exige pelo menos ${(moneyCents(coupon.minSubtotal) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em produtos.`)
  const value = moneyCents(coupon.value)
  if (value <= 0 || (coupon.kind === 'PERCENT' && value > 10000) || !['PERCENT', 'FIXED'].includes(coupon.kind)) throw new Error('Condições do cupom inválidas.')
  const discount = coupon.kind === 'PERCENT' ? Math.floor((subtotal * value + 5000) / 10000) : value
  return Math.min(subtotal, discount, coupon.maxDiscount === null ? subtotal : moneyCents(coupon.maxDiscount))
}
export function parseCouponInput(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Cupom inválido.')
  const value = input as Record<string, unknown>
  const code = couponCode(value.code)
  if (value.kind !== 'PERCENT' && value.kind !== 'FIXED') throw new Error('Escolha porcentagem ou valor fixo.')
  const amount = moneyCents(value.value)
  const min = moneyCents(value.minSubtotal ?? '0')
  const max = value.maxDiscount === '' || value.maxDiscount == null ? null : moneyCents(value.maxDiscount)
  if (amount <= 0 || (value.kind === 'PERCENT' && amount > 10000) || max === 0) throw new Error('Informe um desconto positivo; porcentagem deve ser no máximo 100%.')
  if (value.active !== undefined && typeof value.active !== 'boolean') throw new Error('Ativação inválida.')
  if (value.published !== undefined && typeof value.published !== 'boolean') throw new Error('Divulgação inválida.')
  const limit = value.usageLimit === '' || value.usageLimit == null ? null : value.usageLimit
  if (limit !== null && (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 1000000)) throw new Error('O limite deve ser um inteiro entre 1 e 1.000.000, ou ficar vazio.')
  function date(raw: unknown) {
    if (raw === '' || raw == null) return null
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) throw new Error('Data inválida.')
    const parsed = new Date(raw)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== raw) throw new Error('Data inválida.')
    return parsed
  }
  const startsAt = date(value.startsAt), expiresAt = date(value.expiresAt)
  if (startsAt && expiresAt && startsAt >= expiresAt) throw new Error('A data final deve ser posterior ao início.')
  return { code, kind: value.kind as CouponKind, value: amount / 100, minSubtotal: min / 100, maxDiscount: max === null ? null : max / 100, active: value.active === true, published: value.published === true, startsAt, expiresAt, usageLimit: limit as number | null }
}

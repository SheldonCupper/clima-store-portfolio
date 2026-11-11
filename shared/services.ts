import { validProductImage } from './productMedia'
export const serviceTypes = { INSTALLATION: 'Instalação', MAINTENANCE: 'Manutenção', CLEANING: 'Limpeza', OTHER: 'Outros serviços' } as const
export type ServiceDetails = { type: keyof typeof serviceTypes; city: string; state: string; durationMinutes: number; included: string; excluded: string }
export const defaultServiceDetails: ServiceDetails = { type: 'INSTALLATION', city: 'Uberlândia', state: 'MG', durationMinutes: 120, included: '', excluded: '' }
export const SERVICE_QUANTITY_LIMIT = 20
export function serviceAreaMatches(details: ServiceDetails, address: { city: string; state: string }) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
  return normalize(details.city) === normalize(address.city) && details.state === address.state.trim().toUpperCase()
}
export function parseServiceDetails(value: unknown): ServiceDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Informe as condições do serviço.')
  const input = value as Record<string, unknown>
  const text = (key: string, max: number) => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new Error(`Confira o campo ${key}: obrigatório, até ${max} caracteres.`)
    return input[key].trim()
  }
  const type = text('type', 20) as ServiceDetails['type']
  if (!Object.hasOwn(serviceTypes, type)) throw new Error('Tipo de serviço inválido.')
  const state = text('state', 2).toUpperCase()
  if (!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(state)) throw new Error('Estado inválido.')
  if (!Number.isSafeInteger(input.durationMinutes) || Number(input.durationMinutes) < 15 || Number(input.durationMinutes) > 1440) throw new Error('Duração estimada deve ser de 15 a 1440 minutos.')
  return { type, state, city: text('city', 100), durationMinutes: Number(input.durationMinutes), included: text('included', 3000), excluded: text('excluded', 3000) }
}
export function parseServiceInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Serviço inválido.')
  const input = value as Record<string, unknown>
  if (typeof input.name !== 'string' || input.name.trim().length < 3 || input.name.length > 140) throw new Error('Informe um nome de 3 a 140 caracteres.')
  if (typeof input.description !== 'string' || input.description.trim().length < 10 || input.description.length > 6000) throw new Error('Descreva o serviço em 10 a 6000 caracteres.')
  const price = String(input.price).replace(',', '.')
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(price) || Number(price) < 1) throw new Error('Informe um preço fixo a partir de R$ 1,00, com até duas casas decimais.')
  if (typeof input.active !== 'boolean') throw new Error('Informe se o serviço está ativo.')
  const imageUrl = input.imageUrl === '' || input.imageUrl === null ? null : input.imageUrl
  if (imageUrl !== null && !validProductImage(imageUrl)) throw new Error('Use uma imagem enviada à loja ou um link HTTPS.')
  return { name: input.name.trim(), description: input.description.trim(), price, active: input.active, imageUrl: imageUrl as string | null, serviceDetails: parseServiceDetails(input.serviceDetails) }
}

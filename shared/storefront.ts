import { defaultHeaderSettings, headerColorFields, type HeaderSettings } from './header'
export type Banner = { id: string; active: boolean; eyebrow: string; title: string; description: string; buttonText: string; link: string; imageUrl: string }
export type ShowcaseMode = 'newest' | 'pix' | 'manual' | 'bestsellers'
export type Showcase = { id: string; active: boolean; title: string; subtitle: string; mode: ShowcaseMode; productIds: number[] }
export type CategoryTile = { categoryId: number; title: string; imageUrl: string }
export type Promotion = {
  id: string; active: boolean; title: string; description: string; imageUrl: string
  buttonText: string; link: string; dismissText: string
  frequency: 'session' | 'daily' | 'weekly'; delaySeconds: number
}
export type StorefrontSettings = {
  header: HeaderSettings
  announcement: string
  primaryColor: string
  secondaryColor: string
  autoplay: boolean
  slideSeconds: number
  showCategories: boolean
  banners: Banner[]
  showcases: Showcase[]
  categoryTiles: CategoryTile[]
  promotion: Promotion
}

export const defaultStorefrontSettings: StorefrontSettings = {
  header: defaultHeaderSettings,
  announcement: 'Precisa de uma mão no seu projeto? Converse com a equipe Clima pelo WhatsApp.',
  primaryColor: '#07566e', secondaryColor: '#249a78', autoplay: true, slideSeconds: 6, showCategories: true,
  banners: [
    { id: 'projetos', active: true, eyebrow: 'PARA QUEM FAZ ACONTECER', title: 'O próximo projeto começa com a escolha certa.', description: 'Ferramentas, peças e soluções em refrigeração e climatização. Conte com a Clima, para o seu projeto.', buttonText: 'Explorar o catálogo', link: '/catalogo', imageUrl: '' },
    { id: 'ferramentas', active: true, eyebrow: 'DO PRIMEIRO AJUSTE AO ACABAMENTO', title: 'Mais precisão. Mais possibilidades.', description: 'Encontre o que falta na sua bancada e prepare-se para o próximo serviço.', buttonText: 'Encontrar produtos', link: '/catalogo', imageUrl: '' },
    { id: 'atendimento', active: true, eyebrow: 'ATENDIMENTO DE PERTO', title: 'Uma boa escolha começa com uma conversa.', description: 'Está em dúvida sobre um produto? Fale com nossa equipe e encontre a solução para o seu dia a dia.', buttonText: 'Conversar com a Clima', link: 'https://example.com/contato', imageUrl: '' },
  ],
  showcases: [
    { id: 'selecionados', active: true, title: 'Escolhas para o seu próximo projeto', subtitle: 'Explore os produtos disponíveis na Clima.', mode: 'newest', productIds: [] },
    { id: 'pix', active: true, title: 'Uma boa escolha também no preço', subtitle: 'Produtos com preço especial no Pix.', mode: 'pix', productIds: [] },
    { id: 'novidades', active: true, title: 'Acabaram de chegar', subtitle: 'Os cadastros mais recentes do nosso catálogo.', mode: 'newest', productIds: [] },
  ],
  categoryTiles: [],
  promotion: { id: 'primeira-campanha', active: false, title: 'Uma seleção especial para seu próximo projeto.', description: 'Conheça os produtos e novidades da Clima.', imageUrl: '', buttonText: 'Explorar produtos', link: '/catalogo', dismissText: 'Em outro momento', frequency: 'daily', delaySeconds: 3 },
}

export function safeStorefrontLink(value: string, image = false) {
  if (!value) return image
  if ([...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true
  if (!image && /^#[a-z][\w-]*$/i.test(value)) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}

export function parseStorefrontSettings(input: unknown): StorefrontSettings {
  if (!input || typeof input !== 'object') throw new Error('Configuração da loja inválida.')
  const value = input as Record<string, unknown>
  const text = (raw: unknown, max: number, required = false): string => {
    if (typeof raw !== 'string' || raw.length > max || (required && !raw.trim())) throw new Error('Revise os textos da personalização: há um campo vazio ou longo demais.')
    return raw.trim()
  }
  const bool = (raw: unknown) => { if (typeof raw !== 'boolean') throw new Error('Opção de exibição inválida.'); return raw }
  const array = (raw: unknown, max: number) => { if (!Array.isArray(raw) || raw.length > max) throw new Error('Quantidade de blocos inválida.'); return raw }
  const object = (raw: unknown): Record<string, unknown> => { if (!raw || typeof raw !== 'object') throw new Error('Bloco inválido.'); return raw as Record<string, unknown> }
  const link = (raw: unknown, image = false) => { const result = text(raw, 1500); if (!safeStorefrontLink(result, image)) throw new Error('Use links HTTPS ou caminhos internos da loja.'); return result }
  const color = (raw: unknown) => { const result = text(raw, 7); if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error('Cor inválida.'); return result }
  const id = (raw: unknown) => { const result = text(raw, 60, true); if (!/^[a-z0-9_-]+$/i.test(result)) throw new Error('Identificador de bloco inválido.'); return result }
  const uniqueIds = (blocks: { id: string }[]) => { if (new Set(blocks.map(block => block.id)).size !== blocks.length) throw new Error('Há blocos com identificadores repetidos.') }
  const banners = array(value.banners, 8).map(raw => {
    const item = object(raw)
    return { id: id(item.id), active: bool(item.active), eyebrow: text(item.eyebrow, 70), title: text(item.title, 110, true), description: text(item.description, 260), buttonText: text(item.buttonText, 45, true), link: link(item.link), imageUrl: link(item.imageUrl, true) }
  })
  const showcases = array(value.showcases, 8).map(raw => {
    const item = object(raw)
    if (typeof item.mode !== 'string' || !['newest', 'pix', 'manual', 'bestsellers'].includes(item.mode)) throw new Error('Tipo de vitrine inválido.')
    const productIds = array(item.productIds, 24).map(rawId => { if (!Number.isSafeInteger(rawId) || Number(rawId) <= 0) throw new Error('Produto inválido na vitrine.'); return Number(rawId) })
    return { id: id(item.id), active: bool(item.active), title: text(item.title, 100, true), subtitle: text(item.subtitle, 200), mode: item.mode as ShowcaseMode, productIds: [...new Set(productIds)] }
  })
  uniqueIds(banners); uniqueIds(showcases)
  const categoryTiles = array(value.categoryTiles, 30).map(raw => {
    const item = object(raw)
    if (!Number.isSafeInteger(item.categoryId) || Number(item.categoryId) <= 0) throw new Error('Categoria inválida.')
    return { categoryId: Number(item.categoryId), title: text(item.title, 70), imageUrl: link(item.imageUrl, true) }
  })
  if (new Set(categoryTiles.map(tile => tile.categoryId)).size !== categoryTiles.length) throw new Error('Categoria repetida na personalização.')
  if (!Number.isInteger(value.slideSeconds) || Number(value.slideSeconds) < 4 || Number(value.slideSeconds) > 15) throw new Error('Use um intervalo de 4 a 15 segundos para os banners.')
  // Configurações anteriores continuam válidas, com o pop-up desativado.
  const rawPromotion = value.promotion === undefined ? defaultStorefrontSettings.promotion : object(value.promotion)
  if (typeof rawPromotion.frequency !== 'string' || !['session', 'daily', 'weekly'].includes(rawPromotion.frequency)) throw new Error('Frequência do pop-up inválida.')
  if (!Number.isInteger(rawPromotion.delaySeconds) || Number(rawPromotion.delaySeconds) < 0 || Number(rawPromotion.delaySeconds) > 60) throw new Error('Use uma espera de 0 a 60 segundos para o pop-up.')
  const promotion: Promotion = {
    id: id(rawPromotion.id), active: bool(rawPromotion.active), title: text(rawPromotion.title, 110, true),
    description: text(rawPromotion.description, 400), imageUrl: link(rawPromotion.imageUrl, true),
    buttonText: text(rawPromotion.buttonText, 45, true), link: link(rawPromotion.link),
    dismissText: text(rawPromotion.dismissText, 45, true), frequency: rawPromotion.frequency as Promotion['frequency'], delaySeconds: Number(rawPromotion.delaySeconds),
  }
  // Cabeçalhos antigos recebem os padrões sem gravar ou substituir campanhas.
  const rawHeader = value.header === undefined ? { ...defaultHeaderSettings, accentColor: value.primaryColor, buttonTextColor: value.primaryColor, departmentTextColor: value.primaryColor, navAccentColor: value.secondaryColor } : object(value.header)
  const colors = Object.fromEntries(headerColorFields.map(([key]) => [key, color(rawHeader[key])]))
  const header: HeaderSettings = {
    ...colors as Pick<HeaderSettings, typeof headerColorFields[number][0]>,
    brandTitle: text(rawHeader.brandTitle, 40, true), brandSubtitle: text(rawHeader.brandSubtitle, 50),
    searchPlaceholder: text(rawHeader.searchPlaceholder, 90, true), helpLabel: text(rawHeader.helpLabel, 35, true), helpDetail: text(rawHeader.helpDetail, 45), helpLink: link(rawHeader.helpLink),
    accountLabel: text(rawHeader.accountLabel, 25, true), accountHint: text(rawHeader.accountHint, 45), greeting: text(rawHeader.greeting, 20, true), ordersHint: text(rawHeader.ordersHint, 45), cartLabel: text(rawHeader.cartLabel, 25, true), favoritesLabel: text(rawHeader.favoritesLabel, 25, true), departmentsLabel: text(rawHeader.departmentsLabel, 35, true), locationLabel: text(rawHeader.locationLabel, 60),
    showHelp: bool(rawHeader.showHelp), showFavorites: bool(rawHeader.showFavorites), showLocation: bool(rawHeader.showLocation),
    links: array(rawHeader.links, 10).map(raw => { const item = object(raw); return { id: id(item.id), label: text(item.label, 35, true), link: link(item.link), active: bool(item.active) } }),
  }
  uniqueIds(header.links)
  return { header, announcement: text(value.announcement, 180), primaryColor: color(value.primaryColor), secondaryColor: color(value.secondaryColor), autoplay: bool(value.autoplay), slideSeconds: Number(value.slideSeconds), showCategories: bool(value.showCategories), banners, showcases, categoryTiles, promotion }
}

// A leitura aceita configurações antigas; a confirmação de gravação precisa
// conter o pop-up, para não perder o rascunho quando o backend estiver antigo.
export function parseStorefrontSaveResponse(input: unknown): StorefrontSettings {
  const response = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const settings = response.settings && typeof response.settings === 'object' ? response.settings as Record<string, unknown> : {}
  if (!settings.promotion) throw new Error('O servidor não confirmou os dados do pop-up. Suas alterações continuam na tela. Atualize o backend e tente salvar novamente.')
  if (!settings.header) throw new Error('O servidor não confirmou o cabeçalho. Suas alterações continuam na tela. Atualize o backend e tente salvar novamente.')
  return parseStorefrontSettings(settings)
}

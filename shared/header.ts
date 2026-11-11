export type HeaderMenuLink = { id: string; label: string; link: string; active: boolean }
export type HeaderSettings = {
  background: string; textColor: string; accentColor: string; searchBackground: string; searchTextColor: string
  buttonBackground: string; buttonTextColor: string; navBackground: string; navTextColor: string; navAccentColor: string
  departmentBackground: string; departmentTextColor: string
  brandTitle: string; brandSubtitle: string; searchPlaceholder: string; helpLabel: string; helpDetail: string; helpLink: string
  accountLabel: string; accountHint: string; greeting: string; ordersHint: string; cartLabel: string; favoritesLabel: string
  departmentsLabel: string; locationLabel: string; showHelp: boolean; showFavorites: boolean; showLocation: boolean
  links: HeaderMenuLink[]
}
export const defaultHeaderSettings: HeaderSettings = {
  background: '#ffffff', textColor: '#19313c', accentColor: '#07566e', searchBackground: '#f3f6f6', searchTextColor: '#19313c',
  buttonBackground: '#ffffff', buttonTextColor: '#07566e', navBackground: '#ffffff', navTextColor: '#19313c', navAccentColor: '#249a78', departmentBackground: '#edf3f5', departmentTextColor: '#07566e',
  brandTitle: 'CLIMA STORE', brandSubtitle: 'REFRIGERAÇÃO E CLIMATIZAÇÃO', searchPlaceholder: 'O que falta para o seu projeto?',
  helpLabel: 'Conte com a Clima', helpDetail: 'Contato demonstrativo', helpLink: 'https://example.com/contato',
  accountLabel: 'Minha conta', accountHint: 'Entre ou cadastre-se', greeting: 'Olá,', ordersHint: 'Ver meus pedidos', cartLabel: 'Carrinho', favoritesLabel: 'Favoritos', departmentsLabel: 'Todos os departamentos', locationLabel: 'Loja demonstrativa', showHelp: true, showFavorites: true, showLocation: true,
  links: [
    { id: 'catalog', label: 'Catálogo completo', link: '/catalogo', active: true },
    { id: 'services', label: 'Serviços', link: '/servicos', active: true },
    { id: 'pix', label: 'Oportunidades no Pix', link: '/catalogo?pix=1', active: true },
    { id: 'newest', label: 'Novidades', link: '/catalogo?ordem=recentes', active: true },
    { id: 'quote', label: 'Orçamento', link: '/orcamento', active: true },
    { id: 'contact', label: 'Atendimento', link: '#atendimento', active: true },
  ],
}
export const headerColorFields = [
  ['background','Fundo da faixa superior'], ['textColor','Texto da faixa superior'], ['accentColor','Nome da loja e ícone de busca'],
  ['searchBackground','Fundo da busca'], ['searchTextColor','Texto da busca'], ['buttonBackground','Fundo dos botões superiores'], ['buttonTextColor','Texto e ícones dos botões'],
  ['navBackground','Fundo da faixa de navegação'], ['navTextColor','Texto dos links do menu'], ['navAccentColor','Destaque do link selecionado'], ['departmentBackground','Fundo do botão de departamentos'], ['departmentTextColor','Texto do botão de departamentos'],
] as const
export function headerTheme(header: HeaderSettings) {
  return Object.fromEntries(headerColorFields.map(([key]) => [`--header-${key}`, header[key]]))
}

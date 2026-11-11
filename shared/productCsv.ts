import { parseProductAttributes } from './productAttributes'
import { parseProductGtin, parseProductImages } from './productMedia'
export const CSV_MAX_PRODUCTS = 200
export const CSV_MAX_BYTES = 1024 * 1024
export const csvColumns = ['nome', 'sku', 'categoria', 'preco', 'estoque', 'peso_kg', 'altura_cm', 'largura_cm', 'comprimento_cm', 'slug', 'descricao', 'preco_pix', 'ativo', 'imagens', 'gtin', 'marca', 'modelo', 'tensao', 'capacidade', 'aplicacao', 'tipo_gas'] as const
const required = csvColumns.slice(0, 9)
export type CsvRecord = { line: number; cells: Record<string, string> }
export function parseProductCsv(source: string): CsvRecord[] {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > CSV_MAX_BYTES) throw new Error('Envie um CSV UTF-8 de até 1 MB.')
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.trim() || text.includes('\uFFFD') || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) throw new Error('Arquivo vazio ou inválido. Exporte como CSV UTF-8.')
  let quoted = false, semicolons = 0, commas = 0
  for (const char of text) { if (char === '"') quoted = !quoted; if (!quoted && char === '\n') break; if (!quoted && char === ';') semicolons++; if (!quoted && char === ',') commas++ }
  const delimiter = semicolons > commas ? ';' : ','
  const rows: { line: number; values: string[] }[] = []
  let values: string[] = [], field = '', state: 'plain' | 'quoted' | 'closed' = 'plain', line = 1, start = 1
  function row() { values.push(field); if (values.some(value => value.trim())) rows.push({ line: start, values }); if (rows.length > CSV_MAX_PRODUCTS + 1) throw new Error(`Importe até ${CSV_MAX_PRODUCTS} produtos por arquivo.`); values = []; field = ''; start = line + 1 }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (state === 'quoted') {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else state = 'closed' }
      else field += char
    } else if (char === delimiter) { values.push(field); field = ''; state = 'plain' }
    else if (char === '\n') { row(); state = 'plain' }
    else if (char === '"' && state === 'plain' && field === '') state = 'quoted'
    else if (state === 'closed' || char === '"') throw new Error(`Linha ${line}: aspas ou separadores inválidos.`)
    else field += char
    if (char === '\n') line++
  }
  if (state === 'quoted') throw new Error(`Linha ${start}: feche as aspas do campo.`)
  if (field || values.length) row()
  const header = rows.shift()?.values.map(value => value.trim().toLowerCase()) || []
  if (new Set(header).size !== header.length) throw new Error('O cabeçalho possui colunas repetidas.')
  for (const name of required) if (!header.includes(name)) throw new Error(`Coluna obrigatória ausente: ${name}. Baixe o modelo.`)
  if (header.some(name => !(csvColumns as readonly string[]).includes(name))) throw new Error('Há colunas desconhecidas. Use os nomes do modelo para evitar perda de dados.')
  if (!rows.length) throw new Error('Adicione pelo menos um produto após o cabeçalho.')
  return rows.map(row => {
    if (row.values.length !== header.length) throw new Error(`Linha ${row.line}: quantidade de colunas diferente do cabeçalho. Use aspas em textos com separadores.`)
    return { line: row.line, cells: Object.fromEntries(header.map((name, index) => [name, row.values[index].trim()])) }
  })
}
function number(value: string, label: string, places: number, positive = true) {
  const normalized = value.replace(',', '.')
  if (!new RegExp(places ? `^\\d+(?:\\.\\d{1,${places}})?$` : '^\\d+$').test(normalized)) throw new Error(`${label}: use números sem separador de milhar${places ? '' : ' e sem decimais'}.`)
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed > 99999999 || (positive ? parsed <= 0 : parsed < 0)) throw new Error(`${label}: valor fora do limite permitido.`)
  return parsed
}
export function csvProduct(cells: Record<string, string>) {
  const name = cells.nome, sku = cells.sku
  if (!name || name.length > 200 || !sku || sku.length > 100) throw new Error('Informe nome (até 200 caracteres) e SKU (até 100).')
  const slug = cells.slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) throw new Error('Slug inválido: use letras minúsculas, números e hífens.')
  const price = number(cells.preco, 'Preço', 2), pixPrice = cells.preco_pix ? number(cells.preco_pix, 'Preço Pix', 2) : null
  if (pixPrice !== null && pixPrice > price) throw new Error('Preço Pix não pode superar o preço normal.')
  const activeText = (cells.ativo || 'nao').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!['sim', 'nao', 'true', 'false', '1', '0'].includes(activeText)) throw new Error('Ativo: use sim ou nao.')
  const images = parseProductImages(cells.imagens ? cells.imagens.split('|').map(value => value.trim()) : [])!
  if ((cells.descricao || '').length > 10000) throw new Error('Descrição: use até 10.000 caracteres.')
  const data = {
    name, sku, slug, description: cells.descricao || null, price, pixPrice,
    stock: number(cells.estoque, 'Estoque', 0, false), active: ['sim', 'true', '1'].includes(activeText),
    weightKg: number(cells.peso_kg, 'Peso embalado (kg)', 4), heightCm: number(cells.altura_cm, 'Altura (cm)', 0), widthCm: number(cells.largura_cm, 'Largura (cm)', 0), lengthCm: number(cells.comprimento_cm, 'Comprimento (cm)', 0),
    imageUrl: images[0] || null, imageUrls: images, gtin: parseProductGtin(cells.gtin || '') ?? null,
    technicalAttributes: parseProductAttributes({ brand: cells.marca || '', model: cells.modelo || '', voltage: cells.tensao || '', capacity: cells.capacidade || '', application: cells.aplicacao || '', refrigerant: cells.tipo_gas || '' })!,
  }
  return data
}
export function productCsvTemplate(category = 'slug-da-categoria') {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) category = 'slug-da-categoria'
  const example = ['Produto de exemplo', 'EXEMPLO-001', category, '119,90', '10', '0,800', '20', '15', '10', '', 'Substitua os dados de exemplo pelas informações reais da embalagem.', '109,90', 'nao', '', '', '', '', '', '', '', '']
  const encode = (values: readonly string[]) => values.map(value => `"${value.replaceAll('"', '""')}"`).join(';')
  return '\uFEFF' + encode(csvColumns) + '\r\n' + encode(example) + '\r\n'
}

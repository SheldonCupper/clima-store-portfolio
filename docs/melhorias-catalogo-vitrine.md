# Catálogo, início e página de produto

## O que mudou

- Produtos têm endereço próprio `/produto/:slug`, galeria, quantidade, identificação, descrição, compartilhamento e produtos da mesma categoria.
- O frete da página do produto consulta `/api/shipping/calculate`. Envia somente CEP, forma de pagamento e IDs/quantidades. Não envia preço de produto ou de frete. A cotação fica oculta após mudar seus parâmetros; o checkout calcula novamente o carrinho completo.
- Favoritos em `/favoritos`: guardam apenas IDs neste navegador, até 200 produtos. Preço e disponibilidade vêm da API ao abrir a página. Não há sincronização entre aparelhos.
- Produto esgotado oferece consulta de reposição pelo WhatsApp com a identificação do produto. Isso não é inscrição automática em aviso por e-mail.
- Início mais curto no celular, produtos antes dos cards de categorias e sem repetir o mesmo produto nas vitrines da página. As vitrines e campanhas continuam configuráveis no painel.
- Admin usa `/api/admin/products`, autenticado, para listar também os inativos. Mostra pendências de fotos, descrição, categoria e medidas de envio.
- Fotos ausentes mostram “Foto em atualização”. As imagens genéricas de técnicos não representam os equipamentos vendidos.

## Dados da loja

A preparação pontual inativa apenas os cadastros chamados “Teste Produto” e “testado”, preservando seus registros e pedidos. Bomba de vácuo e manifold deixam a categoria “teste” e passam para “Ferramentas e instrumentos”. Fotos genéricas do Unsplash deixam a vitrine; os arquivos e dados anteriores ficam preservados no backup privado. A campanha de teste com a imagem do gato foi pausada, mantendo seu conteúdo no painel. O botão flutuante do WhatsApp fica acima do selo da hospedagem.

Não foram inventados marcas, modelos, compatibilidades, preços, estoques, condições de parcelamento ou políticas comerciais. A equipe precisa conferir os produtos publicados com o fornecedor e enviar fotos reais e fichas técnicas. O checklist indica preenchimento, não certifica veracidade. A busca gratuita de medidas continua exigindo revisão da embalagem.

`scripts/prepare-catalog.ts` é uma manutenção pontual, não um seed. Sem argumentos, apenas mostra o plano. `--apply --backup=/caminho/privado/arquivo.json` grava um backup exclusivo antes de alterar e usa uma transação com proteção contra edições concorrentes. Não execute novamente para produtos de clientes sem revisar o plano.

## Banco e publicação

Nenhuma migration nova foi criada para estas telas. A migration de galeria anteriormente preparada (`20261101180000_add_product_gallery_gtin`) acrescenta `gtin` e `imageUrls` e copia a foto anterior para a galeria. Foi aplicada no servidor após backup. DATABASE_URL, tokens e credenciais continuam somente no backend. Frete e pagamentos continuam em teste.

## Validação

TypeScript/build do frontend, TypeScript e testes do backend; fluxo no Chromium em 320, 390, 768, 1024 e 1440 px: início sem repetição, links diretos, galeria, favoritos após recarregar, consulta de frete e invalidação, quantidade/carrinho, esgotados, produto inexistente e ausência de overflow horizontal. O navegador usa API simulada nesses cenários para não criar pedidos nem enviar mensagens reais.

## Arquivos desta etapa

- `src/App.tsx`
- `src/pages/Home.tsx`
- `src/pages/Storefront.css`
- `src/components/ProductPage.tsx`
- `src/components/StorefrontComponents.tsx`
- `src/hooks/useFavorites.ts`
- `src/pages/admin/AdminProducts.tsx`
- `shared/catalogQuality.ts`
- `public/product-placeholder.svg`
- `server/src/index.ts`
- `server/src/productMedia.test.ts`
- `server/src/catalogQuality.test.ts`
- `scripts/prepare-catalog.ts`
- `docs/melhorias-catalogo-vitrine.md`
- `README.md`

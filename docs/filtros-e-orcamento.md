# Filtros técnicos e orçamento pelo WhatsApp

## Cadastrar as características

No admin, abra **Produtos → Novo produto** ou **Editar → Ficha técnica e filtros (opcional)**. Informe apenas dados confirmados pelo fabricante:

- Marca e modelo;
- Tensão, por exemplo `220 V` ou `Bivolt`;
- Capacidade com unidade, por exemplo `7 CFM` ou `12.000 BTU/h`;
- Aplicação;
- Tipo de gás, por exemplo `R410A`.

Esses exemplos são sugestões de escrita, não especificações dos produtos da Clima. Nenhum produto existente recebeu especificações automaticamente. Use a mesma escrita para valores equivalentes: não há conversão automática entre unidades ou dedução de compatibilidade.

Os campos são opcionais. A ficha aparece na página do produto e os filtros aparecem automaticamente no catálogo e nas categorias com valores cadastrados. Modelo também é pesquisável no campo de busca. Produtos sem ficha continuam visíveis quando nenhum filtro técnico está selecionado. Os filtros combinam condições, ficam na URL e podem ser limpos; caixa e acentuação não distinguem valores.

## Solicitar orçamento

Nos cards ou na página do produto, use **Adicionar ao orçamento**. Abra **Orçamento** no menu ou visite `/orcamento`. É possível:

- Reunir até 20 produtos e solicitar de 1 a 9.999 unidades de cada;
- Ajustar quantidades, retirar produtos e incluir observações;
- Conferir ou copiar a mensagem antes de abrir o WhatsApp da Clima;
- Consultar produtos sem estoque, cuja disponibilidade é sinalizada.

A lista armazena somente IDs e quantidades neste navegador. Nome, SKU e link são obtidos do catálogo atual; nenhum preço salvo no navegador é usado como proposta comercial. Produtos removidos do catálogo precisam ser retirados da lista para preparar a mensagem. As observações não são persistidas depois de recarregar a página.

O botão abre uma mensagem pronta. O cliente ainda precisa tocar em enviar no WhatsApp. O recurso não envia mensagens automaticamente, não cria pedido, não cobra pagamento e não reserva estoque. Preços, disponibilidade, frete e prazo são confirmados pela equipe.

## Banco e compatibilidade

Migration `20261101220000_add_product_technical_attributes`:

```sql
ALTER TABLE "Product"
ADD COLUMN "technicalAttributes" JSONB NOT NULL DEFAULT '{}';
```

O SQL foi mostrado antes da execução e foram feitos backups privados local e no servidor. Não altera as demais colunas nem executa atualização dos produtos. No banco local, a contagem e a impressão digital dos registros anteriores foram conferidas antes/depois e permaneceram idênticas.

Solicitações de abas antigas, sem `technicalAttributes`, preservam os atributos existentes. O novo formulário verifica suporte do backend antes de gravar uma ficha preenchida; respostas antigas mantêm os dados em edição e exibem um aviso. A API valida campos permitidos, tipos e limite de 120 caracteres por campo. Alterações continuam exigindo administrador autenticado.

A publicação do backend usa uma instância temporária para encaminhar o tráfego durante a troca. DATABASE_URL, credenciais e configuração de sandbox não foram alterados. Os cadastros feitos pelo usuário durante o trabalho não foram substituídos por seed nem por restauração de backup.

## Validação

- Build/TypeScript do frontend e TypeScript do backend.
- 132 testes de backend: 120 aprovados, 12 testes de integração financeira opcionais não executados.
- Chromium em 320, 390, 768, 1024 e 1440 px: filtros combinados e por categoria, persistência na URL, ficha técnica, orçamento com quantidades, geração da mensagem, persistência local, esgotados, remoção de itens indisponíveis, edição administrativa e proteção contra backend antigo.
- As verificações de escrita do admin no navegador usam API simulada. Nenhum pedido ou mensagem real foi enviado pelos testes.

## Arquivos desta etapa

- `prisma/schema.prisma`
- `prisma/migrations/20261101220000_add_product_technical_attributes/migration.sql`
- `shared/productAttributes.ts`
- `shared/quoteRequest.ts`
- `server/src/index.ts`
- `server/src/productAttributes.test.ts`
- `server/src/productMedia.test.ts`
- `server/src/shipping.test.ts` (somente adequação da fixture ao novo campo)
- `src/App.tsx`
- `src/context/cart.ts` (tipo do produto)
- `src/pages/Home.tsx`
- `src/pages/Storefront.css`
- `src/pages/admin/AdminProductNew.tsx`
- `src/pages/admin/AdminProductEdit.tsx`
- `src/components/ProductTechnicalEditor.tsx`
- `src/components/ProductTechnicalFilters.tsx`
- `src/components/ProductPage.tsx`
- `src/components/StorefrontComponents.tsx`
- `src/components/QuoteButton.tsx`
- `src/components/QuotePage.tsx`
- `src/hooks/useQuote.ts`
- `src/utils/productAttributes.ts`
- `docs/filtros-e-orcamento.md`
- `README.md`

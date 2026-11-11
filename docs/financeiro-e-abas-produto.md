# Financeiro, relatório de vendas e abas de produto

## Operação do financeiro

Abra **Admin → Financeiro e relatórios**, abaixo de **Personalizar loja**.

- Atalhos **Hoje**, **Esta semana** (segunda-feira até hoje) e **Este mês** (dia 1 até hoje), além de intervalo personalizado de até 366 dias, a partir de 2020.
- Datas usam `America/Sao_Paulo`. A loja começou em 2026; os limites de consulta são calculados com UTC-3, vigente desde 2020.
- **Vendas reais** é a seleção inicial. **Testes (sandbox)** ficam separados e têm aviso de simulação. Apenas pedidos com checkout online vinculado ao ambiente escolhido entram neste relatório; pedidos sem integração financeira não são classificados artificialmente em um ambiente.
- **Recebido no período** soma os pedidos aprovados pela data da primeira aprovação, mesmo que depois tenham sido integralmente estornados.
- **Estornos no período** usa a confirmação do reembolso, sem somar duas vezes o registro de estorno e a confirmação do provedor.
- **Saldo das vendas** é recebido menos estornos confirmados no período. Pode ser negativo ao devolver uma compra de um mês anterior. Não equivale ao saldo disponível no Mercado Pago nem ao lucro líquido: custos, impostos e taxas não são informados por esta integração.
- Descontos, frete recebido, Pix/cartão, ticket médio, pedidos pendentes e itens de produtos/serviços aparecem separados. Os valores por tipo de item são anteriores ao desconto do cupom; o recebimento total considera o desconto.
- Pedidos com pagamento em conferência não entram nos totais recebidos/estornados. O painel informa a quantidade que exige análise.
- Pedidos antigos sem data de aprovação registrada usam a data de criação, com aviso. Não foi inventada uma data histórica nem realizado backfill em dados do cliente.
- O gráfico permite agrupar por dia, semana e mês, com tabela acessível dos valores. O período selecionado continua valendo ao agrupar.
- **Exportar CSV** gera um arquivo UTF-8 com separador `;`, adequado para planilhas. Inclui pedido, ambiente, criação/aprovação/estorno, cliente, itens, pagamento, status, total, desconto, frete, recebido e estornado no período. Campos são escapados contra fórmulas de planilha. Não inclui CPF, telefone, endereço, tokens ou identificadores privados do provedor.
- Limite de 10 mil pedidos por consulta; escolha um intervalo menor se necessário. Rotas de JSON e CSV exigem autenticação administrativa e não usam cache.

A data `Order.paymentApprovedAt` é registrada uma única vez, após a aprovação integral validada no backend. Repetições de webhook e sincronizações não deslocam a venda de período. A atualização preserva validações de vendedor, valor, moeda, referência, estornos, estoque e cupons.

## Abas na página do produto

- **Descrição e ficha técnica**: mantém os textos, atributos, SKU e categoria existentes.
- **Garantia**: usa o campo **Garantia informada pelo fabricante**, no cadastro/edição do produto. Até 120 caracteres. Sem informação cadastrada, orienta consultar a Clima, sem inventar prazo ou política comercial.
- **Formas de pagamento**: Pix e cartão da integração atual, com preço cadastrado e orientação de que as parcelas/juros e o total final são apresentados pelo Mercado Pago antes de pagar. Não simula uma tabela de parcelas nem habilita boleto. Indisponibilidade e ambiente de teste são indicados quando aplicáveis.
- **Avaliações**: comentários reais, nota de 1 a 5 e primeiro nome do comprador. Não há notas ou comentários fictícios.
- Produtos relacionados, galeria, zoom, favoritos, orçamento, compra e cotação de frete permanecem disponíveis. As abas aceitam teclado (setas, Home e End) e rolagem horizontal no celular.

## Avaliações e publicação

1. O cliente entra na conta e precisa ter comprado aquele produto com pagamento **de produção**, aprovado e sem conferência. Sandbox, compras canceladas e reembolsadas não liberam envio de novas avaliações.
2. Envia nota inteira de 1 a 5 e comentário de 10 a 2.000 caracteres. Uma avaliação por conta/produto; alterações voltam para análise.
3. Em **Admin → Produtos → Editar produto → Avaliações deste produto**, o administrador pode publicar ou ocultar. O admin não modifica a nota ou o texto original.
4. Se o comentário mudou depois de o admin ter carregado a tela, a publicação é recusada até atualizar a lista. O cliente não consegue enviar seu próprio status de publicação ou escolher outra conta.
5. Apenas avaliações aprovadas aparecem publicamente. A loja mostra média e contagem reais e as 50 avaliações mais recentes. A moderação mostra até 200 registros recentes por produto.

Revise a presença de dados pessoais no texto antes de publicar. O cadastro de compradores e o histórico online permanecem limpos; todos os testes com avaliações e pedidos fictícios foram feitos em banco isolado ou no navegador com API simulada.

## Banco e implantação

Migration aditiva `20261102180000_add_sales_dates_and_reviews`:

- coluna opcional e índice `Order.paymentApprovedAt`;
- nova tabela `ProductReview`, chaves estrangeiras, unicidade por conta/produto, índices e restrições para nota e status;
- sem reset, exclusão de registros, alteração de `DATABASE_URL` ou credenciais.

Backup antes da aplicação local e no servidor. Contas, catálogo, estoque, cupons e personalização existentes são preservados. Nenhuma cobrança, estorno, avaliação ou pedido real foi criado para validar esta entrega.

## Verificação

TypeScript do backend e build de produção passaram. Suíte padrão: 214 testes, 171 aprovados e 43 testes de banco opt-in ignorados nessa execução. Execuções dedicadas de pagamentos, serviços, relatórios e avaliações exercitaram 28 casos com PostgreSQL isolado e provedor simulado, incluindo estabilidade da primeira aprovação, ambientes, datas de estorno, moderação e alteração concorrente do comentário.

Navegador em 320, 390, 768, 1024 e 1440 px: relatório vazio, dados de sandbox simulados, filtros, agrupamento, download CSV, abas, teclado, avaliação autenticada e moderação. Sem erros de JavaScript ou overflow horizontal da página.

## Arquivos alterados

- `prisma/migrations/20261102180000_add_sales_dates_and_reviews/migration.sql`
- `prisma/schema.prisma`
- `server/src/index.ts`
- `server/src/payments.integration.test.ts`
- `server/src/payments.ts`
- `server/src/productReviews.test.ts`
- `server/src/productReviews.ts`
- `server/src/salesReports.test.ts`
- `server/src/salesReports.ts`
- `server/src/salesReviews.integration.test.ts`
- `shared/productAttributes.ts`
- `src/App.tsx`
- `src/components/ProductInfoTabs.css`
- `src/components/ProductInfoTabs.tsx`
- `src/components/ProductPage.tsx`
- `src/components/ProductReviewModeration.tsx`
- `src/components/ProductTechnicalFilters.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/pages/admin/AdminProductEdit.tsx`
- `src/pages/admin/AdminSales.css`
- `src/pages/admin/AdminSales.tsx`
- `README.md`
- `docs/financeiro-e-abas-produto.md`

# Venda de serviços

O menu principal, Todos os departamentos e o rodapé têm o acesso **Serviços** (`/servicos`). O administrador configura o catálogo em **Admin → Serviços** (`/admin/servicos`).

## Cadastrar e ativar

1. Clique em **Novo serviço**.
2. Preencha nome, tipo (instalação, manutenção, limpeza ou outros), descrição e preço fixo.
3. Informe cidade/UF atendidos, duração estimada, atividades incluídas e limites/itens não incluídos. Especifique capacidade/tipo de equipamento e condições cobertas pelo preço.
4. Adicione uma imagem por upload JPG/PNG/WEBP (até 5 MB) ou URL HTTPS, se desejar.
5. Marque **Serviço ativo e disponível para compra** e salve. Sem marcar, fica como rascunho inativo.

Para desativar, edite e desmarque a opção. O histórico de serviços vendidos é preservado. Não são criados preços ou anúncios de exemplo automaticamente: cadastre somente serviços que a Clima já pode oferecer.

## Compra e atendimento

- Cliente escolhe **Contratar serviço**, adiciona ao carrinho e finaliza a compra com conta no site, usando a integração existente do Mercado Pago.
- Somente serviços: não há cotação, embalagem, frete ou baixa de estoque. O endereço é o local do atendimento.
- Carrinho misto: o Melhor Envio recebe somente os produtos físicos; o endereço serve também para a execução dos serviços.
- O backend confere a cidade/UF informados com a área configurada, atividade, quantidade (máximo 20 unidades por serviço em cada pedido) e preço no banco. Não aceita preço, frete ou classificação de item vindos do frontend.
- Cliente precisa aceitar as condições e combinar a data com a Clima após o pagamento. Não há calendário nem reserva automática de horários. O link de atendimento leva o número do pedido ao WhatsApp.
- Cada item vendido guarda uma cópia do escopo, limites, duração e área. Editar o anúncio posteriormente não modifica uma compra já realizada.
- O admin acompanha em **Pedidos**, com as condições contratadas nos detalhes. Para pedidos somente de serviços, os status são apresentados como **Em execução** e **Concluído**. Combine a agenda diretamente com o cliente; não use Enviado para indicar um agendamento.
- O cancelamento com estorno mantém as verificações existentes e repõe somente produtos físicos. Antes de concluir o serviço, confira o atendimento; pedidos concluídos exigem conferência antes de tratar devolução/estorno.

A integração permanece em **sandbox**. O pagamento real depende de configurar e validar a conta definitiva do cliente. Nenhum pagamento real foi iniciado pelos testes desta entrega.

## Estrutura e migração

Serviços usam a estrutura comercial existente de itens, pedidos, cupons e pagamentos, identificados no banco por `Product.isService`. São gerenciados por API e telas próprias. Uma categoria interna inativa é criada somente no primeiro cadastro; não aparece na gestão de categorias nem no catálogo físico. Não é necessário informar SKU, slug, código de barras, peso, dimensões ou estoque para um serviço.

A migration aditiva `20261102020000_add_services` acrescenta `isService` e `serviceDetails` a `Product` e `OrderItem`. Os registros existentes recebem `isService=false`; nenhum produto, pedido, cliente ou segredo é apagado ou substituído. `DATABASE_URL` permanece inalterado.

As rotas `/api/admin/services` exigem administrador. A edição verifica `updatedAt` para impedir sobrescrita de alterações feitas em outra aba.

## Validação

TypeScript do backend, build do frontend e suíte existente. Os testes SQL de serviços exigem `RUN_SERVICE_DB_TESTS=true` e banco isolado com nome iniciado por `clima_payments_validation_`. As chamadas do Mercado Pago e do Melhor Envio são simuladas. Incluem compra e estorno de serviço, histórico do escopo, carrinho misto, frete adulterado, área, quantidade e acesso administrativo.

## Arquivos alterados nesta entrega

- `README.md`
- `docs/contas-google-e-boas-vindas.md`
- `docs/servicos.md`
- `prisma/migrations/20261102020000_add_services/migration.sql`
- `prisma/schema.prisma`
- `server/src/coupons.ts`
- `server/src/customerAuth.test.ts`
- `server/src/customerAuth.ts`
- `server/src/index.ts`
- `server/src/loginRouting.test.ts`
- `server/src/orderStatus.ts`
- `server/src/payments.ts`
- `server/src/productBulk.ts`
- `server/src/productMedia.test.ts`
- `server/src/services.integration.test.ts`
- `server/src/services.ts`
- `server/src/shipping.test.ts`
- `server/src/storefront.test.ts`
- `server/src/storefront.ts`
- `shared/services.ts`
- `src/App.css`
- `src/App.tsx`
- `src/components/ServiceOrderSummary.tsx`
- `src/components/Services.css`
- `src/components/ServicesPage.tsx`
- `src/context/cart.ts`
- `src/context/customer.ts`
- `src/pages/Checkout.tsx`
- `src/pages/CustomerAccount.tsx`
- `src/pages/Home.tsx`
- `src/pages/OrderSuccess.tsx`
- `src/pages/admin/AdminCustomers.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/pages/admin/AdminOrderDetails.tsx`
- `src/pages/admin/AdminOrders.tsx`
- `src/pages/admin/AdminServices.tsx`

A configuração `EMAIL_VERIFICATION_REQUIRED=false` também foi aplicada somente nos arquivos privados de ambiente do backend, com backup. Esses arquivos não são enviados ao GitHub.

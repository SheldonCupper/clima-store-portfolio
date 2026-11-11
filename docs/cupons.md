# Cupons de desconto

## Como usar

1. Entre no admin e abra **Cupons** (`/admin/cupons`).
2. Digite um código de 3 a 30 letras/números, com hífen ou sublinhado se desejar. O código é normalizado para maiúsculas.
3. Escolha porcentagem ou valor fixo em reais e informe o desconto.
4. Configure compra mínima, desconto máximo, datas e limite total de utilizações se precisar. Campos opcionais vazios não impõem essa restrição.
5. Marque **Ativar cupom ao criar** para disponibilizá-lo imediatamente, ou crie pausado para ativar depois.
6. No checkout, o comprador informa o código e clica em **Aplicar**. Pode removê-lo antes de finalizar.

As datas usam o horário do aparelho em que são preenchidas; o backend recebe UTC. Depois de criado, um cupom pode ser ativado ou pausado. Para mudar suas condições, crie outro código e pause o anterior. Não há exclusão para preservar o histórico dos pedidos.

## Regras comerciais desta versão

- Um cupom por pedido; válido para todos os produtos do carrinho.
- Aplica-se ao subtotal dos produtos depois do preço escolhido para Pix/cartão. O frete não recebe desconto de cupom.
- Porcentagem aceita duas casas decimais e até 100%; valor fixo nunca desconta mais que o subtotal. Pode haver teto de desconto.
- O total final deve ser de pelo menos R$ 1,00 para pagamento.
- Limite é **global**, não por CPF, conta ou primeira compra.
- Uma utilização fica reservada ao criar um pedido, inclusive enquanto ele aguarda pagamento.
- Pedido recusado no cartão continua reservado para permitir outra tentativa. Cancelamento pela loja, respeitando as verificações de pagamento existentes, libera cupom e estoque uma única vez.
- Reembolso, por si só, não equivale a cancelar o pedido. O cancelamento continua pelo fluxo administrativo existente.
- Cupons ainda válidos voltam a aceitar um uso liberado. Expiração e pausa continuam sendo respeitadas.

O cliente deve aprovar os percentuais e a combinação com preços promocionais antes de divulgar os códigos.

## Backend e persistência

- `GET /api/admin/coupons`: lista administrativa, autenticada.
- `POST /api/admin/coupons`: criação autenticada, com validação e código único.
- `PATCH /api/admin/coupons/:id`: somente ativação/pausa autenticada.
- `POST /api/coupons/preview`: prévia limitada por IP; recebe código, forma de pagamento e IDs/quantidades. Lê preços do banco e não consome uso.
- `POST /api/orders`: recalcula preços, cupom e frete. Desconto, total ou preço enviados pelo navegador não são usados.

A utilização do cupom, criação do pedido e reserva de estoque participam da mesma transação. Um `UPDATE` condicional impede ultrapassar o último uso em compras concorrentes. Falhas posteriores desfazem a reserva. O pedido guarda o código e desconto aplicado; a cobrança Mercado Pago usa seu total líquido persistido.

Migration `20261101230000_add_coupons`: cria a tabela `Coupon` e acrescenta `couponId`, `couponCode` e `couponReleasedAt` opcionais em `Order`. Aproveita o campo `discount` existente. Foi apresentada antes da aplicação e precedida por backups privados. Não remove dados nem altera DATABASE_URL.

## Validação

- TypeScript/backend e build/frontend aprovados.
- Suíte padrão: 144 testes, 128 aprovados e 16 testes SQL opcionais separados.
- Banco novo e isolado para testes SQL: disputa pelo último uso, rollback, cancelamento idempotente e valor líquido cobrado. As 12 verificações financeiras existentes também foram executadas nesse banco, com chamadas ao provedor simuladas.
- Chromium em 320, 390, 768, 1024 e 1440 px: criação/ativação, duplicatas sem perda de edição, aplicar/remover, expiração, Pix/cartão, rejeição final preservando carrinho, código no pedido e responsividade.
- Os testes não enviam mensagens nem geram cobranças reais. Os testes de navegador usam API simulada para escritas.

## Arquivos alterados

- `prisma/schema.prisma`
- `prisma/migrations/20261101230000_add_coupons/migration.sql`
- `shared/coupons.ts`
- `server/src/coupons.ts`
- `server/src/coupons.test.ts`
- `server/src/coupons.integration.test.ts`
- `server/src/index.ts`
- `server/src/orderStatus.ts`
- `server/src/shipping.test.ts`
- `server/src/accountSecurity.test.ts`
- `src/App.tsx`
- `src/App.css`
- `src/hooks/useCheckoutCoupon.ts`
- `src/pages/Checkout.tsx`
- `src/pages/OrderSuccess.tsx`
- `src/pages/admin/AdminCoupons.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/pages/admin/AdminOrderDetails.tsx`
- `docs/cupons.md`
- `docs/roteiro-apresentacao-e-entrega.md`
- `README.md`

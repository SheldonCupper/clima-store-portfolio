# Cancelamento e estorno pelo administrador

Na lista de **Pedidos** ou nos detalhes do pedido, selecione **Cancelado**. A tela busca o total atual no backend e pede que o administrador digite **CANCELAR** para autorizar. Abrir ou fechar a confirmação não solicita um estorno.

- **Pagamento aprovado:** solicita reembolso integral pelo Mercado Pago, incluindo o frete. Não há estorno parcial por essa tela.
- **Pagamento já integralmente reembolsado no provedor:** confere o resultado e conclui o cancelamento, sem nova solicitação financeira.
- **Pedido sem pagamento/cobrança vinculada:** mantém o cancelamento normal. Uma cobrança ainda aberta no Mercado Pago precisa ter seu encerramento confirmado; um pagamento recusado não significa que o link esteja encerrado.
- **Pedido enviado ou entregue:** bloqueia este fluxo. A loja precisa conferir a devolução antes de repor os produtos.
- **Pagamento em conferência, estorno parcial, cobranças divergentes ou conta/ambiente diferente:** bloqueia a operação para análise.

O cliente recebe pelo meio original, conforme o processamento do Mercado Pago. O prazo de crédito depende do meio de pagamento e do provedor. Esta função não envia Pix manual para uma chave informada pelo cliente.

## Resultado pendente ou falha de conexão

A solicitação fica registrada antes da chamada financeira. O botão **Conferir estorno** permite retomar usando a mesma chave de idempotência, inclusive após reiniciar o servidor. Não há repetição automática de solicitações financeiras pelo navegador.

Enquanto o reembolso integral não estiver confirmado, o estoque continua reservado e a preparação/envio e novas cobranças desse pedido ficam bloqueados. Se houver erro ou pendência, confira saldo, permissões e o pagamento no Mercado Pago antes de retomar. Não crie uma segunda devolução manual sem conferir a primeira solicitação.

Somente depois da confirmação na API o sistema marca **Cancelado / Reembolsado**, devolve o estoque e libera a utilização do cupom, uma única vez, em transação no banco. Um pedido cancelado não pode ser reaberto.

## Registro e integração

A migração `20261102010000_add_order_refund` acrescenta somente a tabela `OrderRefund`, índices e vínculos. Registra pedido, cobrança, ambiente, conta recebedora, valor, administrador solicitante, datas e confirmação. Não altera preços, dados de clientes ou credenciais.

O backend verifica autenticação de administrador, conta recebedora, ambiente, referência, moeda, transações e valor. O valor enviado pela tela serve apenas para detectar mudança desde a confirmação; o reembolso usa o total registrado e a cobrança vinculada.

API utilizada: [reembolso de uma order no Checkout Pro](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/refund-order/post), `POST /v1/orders/{order_id}/refund`, corpo vazio para reembolso integral e `X-Idempotency-Key` persistida. O resultado é consultado novamente antes de liberar o estoque.

As credenciais continuam somente no `.env` do backend. O ambiente continua **sandbox**: operações de teste não devolvem dinheiro real. Não é necessário trocar credenciais para usar a tela no ambiente de teste.

## Validação

`npm run typecheck --prefix server`, `npm test --prefix server` e `npm run build:netlify`.

Os testes de integração em `server/src/payments.integration.test.ts` exigem `RUN_PAYMENT_DB_TESTS=true` e um banco exclusivo com nome iniciado por `clima_payments_validation_`. Todas as chamadas do Mercado Pago são simuladas, incluindo timeout, resultado desconhecido, reembolso parcial, autorização, cliques concorrentes e retomada com a mesma chave. Nunca execute esses testes contra o banco da loja.

## Arquivos alterados nesta entrega

- `prisma/schema.prisma`
- `prisma/migrations/20261102010000_add_order_refund/migration.sql`
- `server/src/orderRefunds.ts`
- `server/src/orderStatus.ts`
- `server/src/payments.ts`
- `server/src/auth.ts`
- `server/src/index.ts`
- `server/src/payments.integration.test.ts`
- `server/src/accountSecurity.test.ts`
- `server/src/customerAuth.test.ts`
- `src/components/OrderCancelDialog.tsx`
- `src/pages/admin/AdminOrders.tsx`
- `src/pages/admin/AdminOrderDetails.tsx`
- `src/App.css`
- `README.md`
- `docs/pagamentos-mercado-pago.md`
- `docs/cancelamento-e-estorno.md`

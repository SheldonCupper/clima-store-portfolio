# Mercado Pago: configuração e testes

Este guia descreve a implementação incluída no projeto de portfólio. Todos os domínios, caminhos e valores abaixo são exemplos. Ele não informa a configuração de nenhuma implantação existente.

No modo demo, pagamentos e operações de gravação ficam desativados. O backend completo exige contas, credenciais e infraestrutura próprias.

## Configurar uma aplicação de testes

1. Crie uma aplicação no [painel de desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel), com Checkout Pro e API de Orders.
2. Use as credenciais da conta vendedora de teste e mantenha `MERCADO_PAGO_ENV=sandbox`.
3. Configure Webhooks de Order em uma URL HTTPS da sua própria API, por exemplo `https://api.example.com/api/payments/mercado-pago/webhook`.
4. Configure o backend a partir de [`.env.payments.example`](../.env.payments.example). Nunca envie o `.env` para o GitHub e nunca coloque segredos em variáveis `VITE_`.

```dotenv
PAYMENTS_ENABLED=true
MERCADO_PAGO_ENV=sandbox
MERCADO_PAGO_ACCESS_TOKEN=TOKEN_FICTICIO_SUBSTITUA_NO_BACKEND
MERCADO_PAGO_WEBHOOK_SECRET=SEGREDO_FICTICIO_SUBSTITUA_NO_BACKEND
API_PUBLIC_URL=https://api.example.com
APP_PUBLIC_URL=https://loja.example.com
```

Os tokens acima são marcadores, não credenciais. A origem pública deve corresponder ao ambiente que você controla. Sem configuração válida, a aplicação não deve oferecer pagamento online.

A disponibilidade pública pode ser consultada em `/api/payments/config`. Essa resposta informa a disponibilidade e o ambiente, sem retornar os segredos. O prefixo `APP_USR` sozinho não comprova que a credencial é de teste; o backend também valida o vendedor e o ambiente na API.

## Fluxo implementado

- O servidor usa `POST /v1/orders` e recebe a URL oficial de checkout.
- O valor vem do pedido persistido, com preços e frete validados no backend.
- A chave de idempotência é persistida antes da chamada externa.
- O retorno do navegador não confirma uma aprovação. O backend consulta o provedor e processa notificações autenticadas.
- Estados inconsistentes, valores divergentes ou notificações inválidas exigem conferência.
- Cancelamento, reposição de estoque e utilização de cupom são coordenados para evitar repetição de efeitos.
- O estorno integral depende de confirmação do provedor. Veja [cancelamento e estorno](cancelamento-e-estorno.md).

A coluna histórica `PaymentCheckout.preferenceId` guarda o identificador da order. Isso preserva a compatibilidade do modelo; registros antigos não são convertidos em novas cobranças automaticamente.

## Validar em sandbox

1. Configure um banco exclusivo de testes e as contas de sandbox necessárias.
2. Crie um pedido novo com um produto demonstrativo e entrega disponível.
3. Abra o checkout e use somente os dados de teste publicados pelo provedor.
4. Consulte o pagamento pelo backend e confira a correspondência entre valor, pedido e ambiente.
5. Repita notificações e consultas para validar idempotência.
6. Exercite aprovação, recusa, expiração, estorno e cancelamento; confira o efeito no estoque e nos cupons.

Não reutilize dados, identificadores ou comprovantes de outra implantação. Registros de validação e backups devem ficar em armazenamento privado próprio.

Os testes automatizados estão em `server/src/payments.test.ts`, `server/src/payments.integration.test.ts` e arquivos relacionados. Os testes de integração SQL exigem habilitação explícita e um banco de testes separado.

## Referências do provedor

- [Criar aplicação e credenciais de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-application)
- [Criar uma order](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order)
- [Notificações de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications)
- [Dados para compras de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/integration-test/test-purchase-with-card)

A habilitação de produção exige configuração e validação próprias. A documentação do portfólio não comprova uma implantação ou cobrança em produção.

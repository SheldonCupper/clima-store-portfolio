# Mercado Pago: Checkout Pro em teste

A integração está publicada na AWS com credenciais de teste configuradas,
`PAYMENTS_ENABLED=true` e `MERCADO_PAGO_ENV=sandbox`. O token foi validado como
vendedor brasileiro de teste. A API criou uma order técnica de R$ 1,00 e retornou
o checkout oficial, sem realizar pagamento nem criar pedido no banco da loja.
Uma compra completa de teste pelo site foi aprovada: pedido **#12**, total
**R$ 126,29**, transação `processed/accredited` no provedor e pedido
`CONFIRMED`/pagamento `APPROVED` na loja, sem marca de revisão. O estado já
constava aprovado antes da consulta manual de conferência. Depois foi validado
o reembolso integral e cancelamento desse mesmo pedido, conforme o registro
abaixo. A recusa no provedor também foi validada no pedido #14; produção
continua pendente.

Na consulta atual, a conta de teste disponibilizou cartão, mas não Pix. Para a
primeira compra de teste, selecione **Cartão de crédito** no checkout da loja.

## Criar a aplicação

1. Entre no [painel de desenvolvedores](https://www.mercadopago.com.br/developers/panel).
2. Crie uma aplicação para pagamentos online com **Checkout Pro**. Use o nome
   Clima Store e o site `https://loja.example.com`.
3. Na área de testes da aplicação, ative as **credenciais de teste** e
   mantenha o seletor em **Teste**. A aplicação deve usar **API de Orders**.
4. Configure notificações **Webhooks**, evento **Order (Mercado Pago)** em **Outros eventos**, para esta URL:

```text
https://api.example.com/api/payments/mercado-pago/webhook
```

Guarde a assinatura secreta correspondente à aplicação/configuração usada.
Não use notificações IPN. Não envie token, senha ou assinatura pelo chat.

O Checkout Pro desta integração usa `POST /v1/orders` e o campo `checkout_url`.
Cada solicitação usa `X-Idempotency-Key` com uma chave persistida antes da chamada
externa: repetir após timeout/reinício não inicia outra cobrança. O token de teste
pode começar com `APP_USR`; o prefixo sozinho não identifica o ambiente. O backend
consulta `/users/me`, exige vendedor brasileiro com `test_user` em sandbox e
confere o prefixo `ORDTST` nas orders retornadas.

Referências oficiais: [criação de aplicação e credenciais de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-application),
[criação de order](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order)
e [notificações de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications).

## Configurar somente no backend

Para preparar as credenciais no Mac sem alterar o `.env` do projeto, foi criado
o arquivo privado `~/Library/Application Support/Clima Store/mercado-pago-teste.env`
com permissão `600`, fora do repositório. Preencha somente o Access Token de teste
e a assinatura secreta de Webhooks. Depois eles serão validados e aplicados às
variáveis correspondentes do `.env` do backend, preservando as demais configurações.

O modelo sem segredos está em [`.env.payments.example`](../.env.payments.example).
O `.env` do Mac e sua `DATABASE_URL` não precisam mudar. Conecte ao servidor:

```sh
ssh -i '/Users/gabrielalves/Desktop/aws chaves/clima-backend-key.pem' ubuntu@203.0.113.10
sudo nano /opt/clima-store/.env
```

Para configurar manualmente no servidor, preencha as variáveis existentes, sem
duplicá-las. Preserve as demais configurações:

```dotenv
PAYMENTS_ENABLED=true
MERCADO_PAGO_ENV=sandbox
MERCADO_PAGO_ACCESS_TOKEN=TOKEN_DA_CONTA_VENDEDORA_DE_TESTE
MERCADO_PAGO_WEBHOOK_SECRET=ASSINATURA_SECRETA_DA_APLICACAO
API_PUBLIC_URL=https://api.example.com
APP_PUBLIC_URL=https://loja.example.com
```

Os dois valores em maiúsculas acima são exemplos: substitua-os pelas credenciais.
Depois de salvar, reinicie e confira a disponibilidade:

```sh
sudo systemctl restart clima-backend
curl https://loja.example.com/api/payments/config
```

A resposta deve conter `"enabled":true` e `"environment":"sandbox"`.
Isso confirma a configuração local; a conta do vendedor será validada na API ao
iniciar o pagamento. Segredos ficam exclusivamente no `.env` da AWS, nunca no
GitHub, no bundle, em variáveis `VITE_` ou nas variáveis do frontend da Netlify.
Publique também a versão atual do frontend para exibir os novos controles.

## Validar uma compra de teste

1. Na loja, faça um pedido com frete calculado e escolha Pix ou cartão.
2. Na página `/pedido/<id>`, clique em **Pagar com Mercado Pago**.
3. No Checkout Pro, use os dados e os cartões de teste indicados pelo Mercado
   Pago; não utilize cartão real para essa validação.
4. Retorne à loja e clique em **Atualizar pagamento**. Confira o mesmo pedido no
   painel administrativo e atualize o pagamento por lá também.
5. Valide aprovação, recusa, pagamento pendente e reembolso. O estoque não deve
   baixar novamente ao aprovar, pois já foi reservado na criação do pedido.

Acompanhe as entregas na aba **Webhooks**, mantendo o ambiente **Teste**.
Depois de configurar o backend, use **Simular notificação** com o ID `ORDTST...`
da cobrança de teste. A atualização manual da loja consulta diretamente a order
vinculada, pela API autenticada; não utiliza o status enviado pelo navegador.

Na validação desta conta, o checkout apresentou erro de mistura entre usuários
reais e de teste mesmo em janela privada. O pagamento funcionou usando uma
conta **Comprador** de teste brasileira distinta da conta **Vendedor**. Essa é
a alternativa validada para repetir o cenário, sem usar a identidade real no
pagamento. Senhas e códigos dessas contas não devem aparecer em capturas.

## Regras implementadas

- Produtos, frete e total vêm do banco e dos cálculos do backend. Valores enviados
  pelo navegador não determinam a cobrança. Parâmetros de retorno como
  `collection_status=approved` não confirmam pagamento.
- Cada pedido tem um checkout por ambiente. Cliques simultâneos reutilizam o link.
  O link expira em 30 minutos; esta versão não cria automaticamente outro link
  para o mesmo pedido expirado. O cliente recebe orientação para falar com a loja.
- Webhooks exigem assinatura HMAC válida e recente; os detalhes são consultados
  novamente na API, conferindo vendedor, ambiente, referência, moeda, total e método.
  A assinatura considera o ID alfanumérico em minúsculas.
  Notificações repetidas ou antigas não duplicam o pagamento nem repõem estoque.
- Cobranças não pagas exigem expiração, margem de um minuto e consulta posterior
  bem-sucedida que confirme a order cancelada. Pix pendente impede a reposição.
  Não há cancelamento automático por expiração.
- Pagamento aprovado exige reembolso integral confirmado antes do cancelamento.
  Com todas as cobranças integralmente reembolsadas e consultadas, o cancelamento
  pode ocorrer imediatamente, sem esperar a validade original do link.
  O reembolso é feito no painel do Mercado Pago; depois atualize o pagamento na
  loja e cancele o pedido. Não há API de estorno automático nesta versão.
- Aprovações duplicadas, disputas, reembolsos parciais e aprovação posterior ao
  cancelamento marcam o pedido para conferência. A marca bloqueia o andamento e
  não é removida automaticamente; o caso exige tratamento pela loja.

## Banco, verificações e troca de titular

A migration aditiva `20261031190000_add_mercado_pago` cria `PaymentCheckout` e
`ProviderPayment` e adiciona `Order.paymentReviewRequired`. Foi apresentada antes
da aplicação, com backup prévio no Mac e na AWS. Não remove dados nem altera a
`DATABASE_URL` local.

Os testes unitários rodam com `npm --prefix server test`. Os testes de integração
SQL/HTTP exigem `RUN_PAYMENT_DB_TESTS=true` e um banco exclusivo cujo nome comece
com `clima_payments_validation_`; por padrão ficam desativados. Dez cenários da API de Orders foram
executados nesse banco separado, com a API do provedor simulada. Isso não
substitui a validação com uma conta real de teste do Mercado Pago.

Na entrega ao cliente, configure a aplicação, as credenciais e os Webhooks dele.
Somente após validar a conta de produção use `MERCADO_PAGO_ENV=production` com
credenciais de produção. Pagamentos antigos pertencem ao vendedor original:
trocar o token não transfere cobranças nem permite consultá-las na nova conta.
Conclua os pedidos pendentes antes da troca. O frete Melhor Envio tem configuração
de ambiente própria e continua em sandbox até sua ativação específica.

## Arquivos alterados nesta integração

- `.gitignore` e `.env.payments.example`.
- `prisma/schema.prisma` e `prisma/migrations/20261031190000_add_mercado_pago/migration.sql`.
- `server/src/mercadoPago.ts`, `server/src/payments.ts`, `server/src/index.ts` e `server/src/orderStatus.ts`.
- `server/src/payments.test.ts`, `server/src/payments.integration.test.ts`,
  `server/src/accountSecurity.test.ts` e `server/src/customerAuth.test.ts`.
- `src/components/OrderPayment.tsx`, `src/pages/OrderSuccess.tsx`,
  `src/pages/admin/AdminOrderDetails.tsx` e `src/App.css`.
- `README.md`, `docs/publicacao-aws.md` e este guia.

## Adaptação para Orders sem migration adicional

As tabelas existentes foram reaproveitadas. A coluna histórica
`PaymentCheckout.preferenceId` agora guarda o ID `ORD...`/`ORDTST...` da order;
`ProviderPayment` guarda o estado consolidado dessa order, conferindo suas
transações, reembolsos e contestações. Preferências antigas não são convertidas
nem recebem uma nova cobrança automaticamente. Somente o ambiente de teste
está habilitado; a produção continua pendente da validação completa.

A resposta real de uma order recém-criada ou encerrada sem pagamento pode
omitir `total_paid_amount` e `transactions`. O backend aceita essa ausência
somente nos estados `created`, `canceled` ou `failed`, sem transações, reembolsos
ou contestações. Aprovações exigem valor pago explícito e transações
correspondentes. Há testes de regressão para esses casos.

Uma mesma bandeira pode aparecer na API de meios de pagamento tanto em crédito
quanto em pré-pago, compartilhando o mesmo ID (`master`, `visa`, `elo`). A exclusão
por ID agora preserva qualquer bandeira permitida no tipo escolhido; os tipos
pré-pago/débito continuam bloqueados pela exclusão por tipo. Essa correção foi
publicada e coberta por teste de regressão. Links criados antes dela conservam
suas restrições originais e precisam ser substituídos por um novo pedido de teste.

Arquivos desta adaptação: `server/src/mercadoPago.ts`, `server/src/payments.ts`,
`server/src/paymentFixtures.ts`, `server/src/payments.test.ts`,
`server/src/payments.integration.test.ts`, `.env.payments.example`, `README.md` e este guia.

## Validação de reembolso e reposição de estoque

O reembolso integral de **R$ 126,29** do pedido de teste **#12** foi solicitado
pela Orders API, exclusivamente com vendedor de teste e ID `ORDTST...`. A chave
idempotente e os estoques anteriores foram registrados antes da operação; um
backup do banco foi feito previamente. A API confirmou `refunded`, com uma
transação de reembolso `processed` pelo valor total e vinculada à transação paga.

Depois de consultar e conferir esse estado, o cancelamento foi executado pela
mesma função de negócio utilizada pelo admin. Resultado observado:

| Verificação | Resultado |
| --- | --- |
| Pagamento na loja | `REFUNDED` |
| Pedido | `CANCELED`, com `stockRestoredAt` preenchido |
| Produto ID 5, quantidade do pedido | 1 unidade |
| Estoque antes do cancelamento | 99 |
| Estoque após primeiro cancelamento | 100 |
| Estoque após repetir o cancelamento | 100 |
| Estoque após repetir a notificação de reembolso | 100 |

Ajustou-se a trava para permitir cancelar imediatamente após reembolso integral
consultado, preservando os bloqueios para pagamento aprovado, reembolso parcial,
pagamento pendente e ausência de consulta. Validação: 89 testes regulares e 10
testes SQL/HTTP em banco separado, TypeScript, lint e build aprovados.

A operação não criou um botão de estorno automático no admin. O fluxo habitual
continua sendo devolver no painel do Mercado Pago, atualizar o pagamento no
admin e então cancelar. Os registros do pedido e do pagamento foram preservados.
A evidência privada está em
`/var/lib/clima-store/payment-validation/refund-order-12.json` no servidor.

Arquivos alterados nesta etapa: `server/src/mercadoPago.ts`,
`server/src/payments.test.ts`, `server/src/payments.integration.test.ts`,
`README.md` e este guia. Não houve migration nem alteração da `DATABASE_URL`.

## Recusa de cartão: verificação automatizada e teste no provedor

Foi executado um cenário de cartão recusado com PostgreSQL real em banco
exclusivo e resposta do provedor simulada (`failed/rejected_by_issuer`).
Após notificações repetidas, o pagamento ficou `REFUSED`, o pedido permaneceu
`PENDING`, sem `stockRestoredAt` e sem marca de revisão. O estoque reservado
ficou em 8 unidades, inclusive após as tentativas bloqueadas de preparar ou
cancelar enquanto a cobrança não estava encerrada. O backend reutilizou o link
existente sem criar outra cobrança. A tela mostrou “Pagamento recusado” em
390 e 1440 pixels, com o controle de pagamento disponível.

Além das verificações automatizadas, uma recusa foi emitida pelo sandbox e
conferida no pedido **#14**. Para repetir o cenário, abra um novo pedido com cartão, use a conta
compradora de teste que funcionou na aprovação e escolha informar os dados do
cartão de teste. Use Mastercard `5480 8328 0103 3311`, validade `11/30`, código
`123`, CPF `12345678909` e **nome do titular `OTHE`**. O nome provoca a recusa
por erro geral, conforme a
[documentação oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/integration-test/test-purchase-with-card).
Não reutilize o pedido #12, pois ele já foi reembolsado e cancelado.

Depois da tentativa, consulte o pedido pela API/controle “Atualizar pagamento”
para conferir o resultado autêntico. Não utilize o status da URL de retorno como
confirmação e não altere manualmente o banco para fabricar a recusa.

No resultado real, o Mercado Pago manteve a order em `action_required` com
`status_detail=waiting_retry`; a transação ficou `failed/rejected_by_issuer`.
`total_paid_amount` não veio na resposta. Esse caso agora é normalizado como
recusa somente quando há transações e todas estão explicitamente `failed`, sem
reembolsos ou contestações. Um valor pago explícito diferente de zero exige
conferência. Espera de captura ou uma transação ainda em processamento não é
tratada como recusa.

Resultado confirmado na AWS:

| Verificação | Resultado |
| --- | --- |
| Pedido de teste | #14, R$ 126,29 |
| Pagamento | `REFUSED` |
| Status do pedido | `PENDING` |
| `stockRestoredAt` | `null` |
| Estoque do produto ID 5 antes/depois da consulta e notificação repetida | 98 / 98 |
| Revisão manual necessária | Não |

O checkout continua aberto para outra tentativa, sem reposição automática de
estoque. Um teste SQL verifica que uma aprovação posterior confirma o pedido
sem baixar o estoque novamente. A evidência privada desta recusa está em
`/var/lib/clima-store/payment-validation/decline-order-14.json` no servidor.

Validação desta etapa: 90 testes regulares, 12 de integração SQL/HTTP, TypeScript,
lint e build aprovados. Arquivos alterados: `server/src/payments.ts`,
`server/src/payments.test.ts`, `server/src/payments.integration.test.ts` e este
guia. O teste de tela foi executado por roteiro local com APIs interceptadas;
a recusa do pedido #14 foi conferida pela API autêntica do provedor.

## Cancelar e estornar pela loja

A lista e os detalhes de pedidos permitem selecionar **Cancelado** e autorizar o estorno integral, incluindo frete. A solicitação fica persistida antes da chamada ao provedor; o estoque e o uso do cupom são liberados somente após confirmar o reembolso integral. Consulte o [fluxo, pendências e limites](cancelamento-e-estorno.md). O ambiente continua sandbox.

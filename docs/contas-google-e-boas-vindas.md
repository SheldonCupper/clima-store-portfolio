# Contas obrigatórias, Google e boas-vindas

## Compra e orçamento

Para criar pedidos, é necessário entrar ou criar uma conta de cliente. O backend recusa requisições sem sessão, inclusive quando enviadas diretamente à API. Uma sessão de administrador não substitui uma conta de cliente. O carrinho permanece salvo ao entrar/cadastrar. Orçamentos e consultas de frete continuam públicos.

Pedidos antigos de visitantes continuam acessíveis pelas credenciais já emitidas. Não há exclusão de pedidos nem conversão retroativa de clientes.

## Cupom fixo BOASVINDAS

Em **Admin → Cupons → Boas-vindas para novas contas**, defina porcentagem ou valor em reais, compra mínima, teto opcional e ativação. Salve em **Salvar boas-vindas**. O benefício começa pausado e sem valor escolhido; nenhuma promoção é ativada por conta própria.

O checkout oferece o código às contas elegíveis. Clique em **Usar cupom de boas-vindas** para conferir o desconto no carrinho. Ele substitui outro cupom; não acumula descontos de cupons. O preço Pix continua sendo considerado antes do desconto, sem desconto no frete.

Primeira compra significa não possuir outro pedido em andamento ou concluído, conferido por conta, e-mail ou CPF. Pedidos recusados ainda em andamento precisam ser cancelados pela loja antes de liberar nova tentativa. Cancelamentos confirmados liberam o benefício caso não exista outra compra. Reembolso sem cancelamento não libera automaticamente. Alterações no valor do benefício não mudam pedidos anteriores.

A reserva é feita na mesma transação do pedido. Pedidos simultâneos da mesma conta são serializados; o benefício também é bloqueado durante a conferência, para evitar reutilização por contas com o mesmo CPF. Isso não substitui verificação de identidade contra pessoas usando dados diferentes.

## Ativar login/cadastro pelo Google

O fluxo está implementado, mas só é exibido após configurar as credenciais. Não é necessário contratar um serviço de envio de e-mail para o login Google.

1. Acesse [Google Cloud Console](https://console.cloud.google.com/) e crie/selecione um projeto.
2. Em **Google Auth Platform**, configure o nome da aplicação, e-mail de suporte e contato do desenvolvedor; escolha público externo. Em modo de testes, adicione os e-mails de quem fará a demonstração como usuários de teste.
3. Em **Clientes**, crie um cliente OAuth do tipo **Aplicativo da Web**.
4. Cadastre o URI de redirecionamento autorizado **exatamente**:
   `https://loja.example.com/api/customer/google/callback`
5. Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` somente no `.env` do backend. `APP_PUBLIC_URL` precisa ser `https://loja.example.com`, sem caminho.
6. Reinicie o backend. Em Entrar/Cadastro aparecerá **Continuar com Google**. Teste com uma conta Gmail de teste autorizada. Antes de liberar a todos, publique a configuração de público no Google e conclua os requisitos que o console solicitar, incluindo política de privacidade e domínio quando aplicáveis.

Para testar localmente, use outro cliente de desenvolvimento com retorno `http://localhost:5173/api/customer/google/callback` e `APP_PUBLIC_URL=http://localhost:5173`. Não altere `DATABASE_URL` para ativar Google.

Ao adotar o domínio definitivo, atualize `APP_PUBLIC_URL` e adicione o novo retorno autorizado no Google antes da mudança.

A autenticação valida assinatura, emissor, audiência, expiração, nonce e e-mail verificado, com estado protegido e PKCE. Apenas Gmail é aceito, seguindo a regra atual da loja. A conta Google não concede permissão de administrador. Se o Gmail já existir em uma conta local sem confirmação, confirme primeiro seu e-mail. CPF e telefone serão solicitados no checkout e salvos ao concluir o pedido; o Google não fornece esses dados.

Referências: [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect), [validação do ID token no backend](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Banco e validação

Migration aditiva `20261102000000_add_google_identity`: somente coluna opcional `CustomerAccount.googleSubject` e índice único. Nenhuma senha, e-mail, pedido ou produto é alterado pela migration. Backup antes de aplicar; usar `prisma migrate deploy`, sem reset.

O benefício usa a tabela de cupons existente e é criado ao salvar sua configuração. As credenciais Google não ficam no banco nem no frontend.

## Arquivos alterados nesta entrega

- Backend: `server/src/index.ts`, `server/src/customerAuth.ts`, novo `server/src/googleAuth.ts`, `server/src/coupons.ts`.
- Banco: `prisma/schema.prisma`, nova migration `prisma/migrations/20261102000000_add_google_identity/migration.sql`.
- Loja: `src/pages/Checkout.tsx`, `src/pages/CustomerAuth.tsx`, `src/pages/CustomerAccount.css`, `src/hooks/useCheckoutCoupon.ts`, novo `src/components/WelcomeCouponOffer.tsx`, `src/App.css`.
- Admin: `src/pages/admin/AdminCoupons.tsx`, novo `src/components/WelcomeCouponSettings.tsx`.
- Dependências: `server/package.json` e `server/package-lock.json` (biblioteca oficial de autenticação Google).
- Configuração e orientação: `.env.accounts.example`, `README.md` e este guia.
- Testes: novo `server/src/accountPurchase.test.ts`, `server/src/customerAuth.test.ts`, `server/src/shipping.test.ts`, `server/src/coupons.integration.test.ts`.

Verificações: TypeScript de frontend/backend e build; testes de sessão, Google e cupons com provedor simulado; testes PostgreSQL isolados de concorrência, cancelamento, vinculação Google e pagamentos; navegação responsiva em 320, 390, 768, 1024 e 1440 pixels. O login com a conta Google real exige configurar o cliente OAuth acima.

## Entrada sem confirmação obrigatória

Por solicitação da loja, `EMAIL_VERIFICATION_REQUIRED=false` permite cadastro com login imediato e entrada por senha também em contas anteriormente pendentes. O backend informa essa política à área Minha conta para não exigir o link de confirmação. A senha continua obrigatória; contas não são marcadas como verificadas artificialmente. Recuperação de senha e envio opcional de confirmação continuam funcionando com SMTP.

A vinculação de uma conta local existente ao Google continua exigindo e-mail já confirmado, para preservar a proteção dessa vinculação. Para voltar a exigir a confirmação de contas marcadas como pendentes, configure `EMAIL_VERIFICATION_REQUIRED=true` e reinicie o backend. Contas criadas com a exigência desativada mantêm essa condição registrada.

O botão **Atualizar página** está disponível no topo de todas as telas administrativas. Ele recarrega os dados da tela atual; alterações ainda não salvas são descartadas.

A aba Clientes inclui as contas cadastradas sem compras e os compradores antigos. Registros com o mesmo e-mail aparecem uma única vez; senhas e identificadores do Google não são enviados nessa listagem.

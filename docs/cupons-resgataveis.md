# Cupons na loja e na conta do cliente

## Como divulgar

1. Abra **Admin → Cupons**.
2. Ao criar uma campanha, marque **Ativar cupom ao criar** e **Divulgar na loja e na conta dos clientes**. Configure desconto, compra mínima, teto, período e limite de usos.
3. Nos cupons existentes, use **Divulgar na loja**. Essa opção é independente de **Ativar/Pausar cupom**. Cupons pausados, futuros, vencidos ou esgotados não aparecem entre as ofertas disponíveis.
4. Para BOASVINDAS, marque **Divulgar na loja e em Meus cupons** na seção de boas-vindas e salve. Os valores já configurados são preservados.

Os cupons existentes começam com divulgação desligada, para preservar códigos de campanhas privadas. Eles continuam funcionando quando digitados no checkout. Não foi criada nem ativada uma campanha de desconto fictícia em produção.

## Experiência do cliente

- O botão flutuante **Cupons**, no lado esquerdo da loja, aparece quando existem ofertas públicas disponíveis. WhatsApp continua no lado direito.
- Visitantes podem consultar e copiar os códigos; para salvar na carteira precisam entrar na conta.
- **Minha conta → Meus cupons** mostra códigos resgatados e ofertas disponíveis, com botão para atualizar. A carteira fica no banco, disponível também em outro aparelho.
- **Usar no checkout** preenche o código e solicita a validação ao backend. É preciso ter itens no carrinho; não adiciona produtos automaticamente.
- Resgatar salva o código, sem consumir nem reservar usos. Um cupom pode acabar antes da compra. Compra mínima, validade, quantidade de usos e elegibilidade são verificadas novamente no pedido.
- Um cupom por pedido; o frete permanece separado. BOASVINDAS continua restrito à primeira compra, conferida por conta/e-mail/CPF.
- Cupons salvos que venceram, foram pausados ou esgotaram permanecem identificados como indisponíveis. Ocultar a divulgação não revoga códigos já salvos; para impedir o uso, pause a campanha.

## Backend e dados

- `Coupon.published`: divulgação opt-in, padrão `false`.
- `CouponClaim`: vínculo único entre conta e cupom, com data de resgate. Não representa utilização em pedido.
- `GET /api/coupons/available`: ofertas públicas válidas, sem contadores internos; considera a elegibilidade de boas-vindas quando conectado.
- `GET /api/customer/coupons`: carteira da sessão autenticada, sem aceitar ID de conta do navegador.
- `POST /api/customer/coupons/:id/redeem`: resgate autenticado, idempotente e revalidado no servidor.
- PATCH administrativo aceita somente flags booleanas `active` e/ou `published`. Regras financeiras continuam protegidas.
- Migration aditiva `20261102030000_add_coupon_wallet`: coluna e tabela novas, com índices e chaves estrangeiras. Sem reset, alteração de DATABASE_URL ou exclusão de dados. Backup realizado antes da aplicação.

O cabeçalho de **Admin → Serviços** também foi corrigido para usar o mesmo padrão visual de Produtos.

## Validação

- TypeScript do backend e build de produção do frontend.
- Suíte do backend: 200 testes, 160 aprovados e 40 testes de banco opt-in ignorados na execução padrão.
- Cinco testes SQL específicos aprovados em banco isolado: concorrência/idempotência, ausência de consumo no resgate, recusa de campanhas indisponíveis, revalidação na compra, separação de carteiras e primeira compra.
- Navegador em 320, 390, 768, 1024 e 1440 px: cabeçalho de Serviços, publicação, visitante/login, resgate, carteira, fechamento por ESC, sem erro de JavaScript ou overflow horizontal.
- Sem cobranças, estornos ou pedidos reais criados nos testes.

## Arquivos alterados

- `prisma/schema.prisma`
- `prisma/migrations/20261102030000_add_coupon_wallet/migration.sql`
- `shared/coupons.ts`
- `server/src/coupons.ts`
- `server/src/coupons.test.ts`
- `server/src/couponWallet.integration.test.ts`
- `src/pages/admin/AdminServices.tsx`
- `src/pages/admin/AdminCoupons.tsx`
- `src/components/WelcomeCouponSettings.tsx`
- `src/components/CustomerCoupons.tsx`
- `src/components/CustomerCoupons.css`
- `src/pages/Home.tsx`
- `src/pages/CustomerAccount.tsx`
- `src/pages/Checkout.tsx`
- `src/hooks/useCheckoutCoupon.ts`
- `src/App.css`
- `README.md`
- `docs/cupons-resgataveis.md`

## Ativar, pausar e excluir cupons

Em **Admin → Cupons**, cada campanha tem **Ativar cupom / Pausar cupom** e **Excluir cupom**. A exclusão abre uma confirmação: digite o código exato para liberar o botão. Cancelar ou fechar por ESC não envia a solicitação.

Excluir remove a campanha da lista administrativa e da divulgação, desativa novos usos e impede novos resgates. Cupons já salvos na carteira aparecem como encerrados. Os pedidos anteriores mantêm código, desconto e total. O registro é preservado no banco para manter esse histórico; o código permanece reservado para evitar confundir campanhas antigas com novas. Use outro código para outra campanha.

O benefício fixo **BOASVINDAS** tem os mesmos controles na sua seção. Após excluí-lo, é possível configurá-lo novamente em **Salvar boas-vindas**; a configuração preserva o histórico de usos e a regra de primeira compra.

Migration aditiva `20261102190000_add_coupon_deletion`: somente coluna opcional `Coupon.deletedAt`. Backup antes da aplicação, sem reset ou exclusão de pedidos, contas, catálogo ou configurações existentes. Nenhum dos cupons reais foi excluído para testar a funcionalidade.

Validação desta alteração: TypeScript e build; 174 testes aprovados na suíte padrão, com os testes SQL opt-in separados; três casos PostgreSQL isolados cobrem histórico, resgates, concorrência e reconfiguração de boas-vindas. Navegador em 320, 390, 768, 1024 e 1440 px valida ativação, pausa, confirmação, cancelamento/ESC e exclusão de campanhas e boas-vindas.

Arquivos desta alteração:

- `prisma/schema.prisma`
- `prisma/migrations/20261102190000_add_coupon_deletion/migration.sql`
- `server/src/coupons.ts`
- `server/src/coupons.test.ts`
- `server/src/couponDeletion.integration.test.ts`
- `src/pages/admin/AdminCoupons.tsx`
- `src/components/WelcomeCouponSettings.tsx`
- `src/components/CouponDeleteDialog.tsx`
- `src/components/CouponDeleteDialog.css`
- `docs/cupons-resgataveis.md`

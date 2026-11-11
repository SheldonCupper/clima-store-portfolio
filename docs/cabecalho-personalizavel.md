# Cabeçalho e menu personalizáveis

Abra **Admin → Personalizar loja → Cabeçalho e menu**.

## Duas faixas independentes

- **Faixa superior:** fundo e texto, cor do nome da loja/ícone de busca, fundo e texto da busca, fundo e texto/ícones dos botões.
- **Faixa de navegação:** fundo, texto dos links, destaque do link selecionado e cores do botão de departamentos.

Cada cor pode ser escolhida no seletor ou informada em hexadecimal completo, por exemplo `#112233`. Confira o contraste na prévia.

## Textos e botões

É possível editar o nome e complemento exibidos no cabeçalho, o texto de busca, o botão de departamentos, favoritos, atendimento, conta, saudação do cliente conectado, carrinho e localização. O atendimento aceita destino interno, âncora ou HTTPS. Favoritos, atendimento e localização podem ser ocultados.

Busca, conta e carrinho mantêm suas funções originais; os rótulos são personalizáveis. O logotipo existente é preservado. No celular, alguns textos dão lugar aos ícones e o menu permite rolagem horizontal para caber na tela. Atendimento e localização respeitam a adaptação existente para telas menores.

## Links do menu

Adicione até 10 links, edite nome/destino, altere a ordem pelas setas, marque Visível ou remova. Exemplos: `/catalogo`, `/servicos`, `/orcamento`, `/categoria/ferramentas`, `#atendimento` ou um link HTTPS.

O contador do orçamento acompanha links internos para `/orcamento`. Links externos HTTPS abrem em outra aba. Protocolos como `javascript:` e cores que não sejam hexadecimais são recusados no backend.

## Prévia e publicação

A prévia acompanha as alterações; clique em **Salvar alterações** para publicar. A opção **Restaurar cabeçalho padrão** altera somente esse cabeçalho no rascunho. Banners, vitrines, categorias e pop-up são preservados. Salve para confirmar a restauração.

As configurações ficam no JSON da vitrine existente. Não há migration, alteração de credenciais ou substituição dos dados de produtos/pedidos. Configurações antigas recebem os novos campos na leitura, mantendo as cores de destaque atuais. Um cliente antigo que salvar a vitrine sem os campos do cabeçalho preserva o cabeçalho já configurado no backend.

A confirmação de gravação exige que o backend devolva os novos campos: uma resposta antiga não apaga o rascunho nem derruba a tela.

## Validação

TypeScript do backend, build do frontend e testes de API com armazenamento simulado. Conferência no navegador em 320, 390, 768, 1024 e 1440 pixels, incluindo edição, prévia, salvar/reabrir, recuperação de resposta antiga, ocultar/reordenar/adicionar/remover links, busca, conta, carrinho e contador do orçamento. Nenhuma personalização de teste foi gravada na loja real.

## Arquivos alterados

- `server/src/storefront.test.ts`
- `server/src/storefront.ts`
- `shared/header.ts`
- `shared/storefront.ts`
- `src/components/HeaderEditor.tsx`
- `src/pages/Home.tsx`
- `src/pages/Storefront.css`
- `src/pages/admin/AdminStorefront.css`
- `src/pages/admin/AdminStorefront.tsx`
- `docs/cabecalho-personalizavel.md`
- `README.md`

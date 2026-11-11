# Ações em lote de produtos

Em **Admin → Produtos**, use as caixas na primeira coluna para selecionar vários produtos.

- A caixa do cabeçalho seleciona os produtos da busca atual. Seleções anteriores fora da busca são mantidas e o painel avisa quando existirem.
- **Selecionar todos os N produtos** marca o catálogo inteiro carregado, incluindo inativos e produtos fora da busca.
- **Limpar seleção** desmarca todos.
- **Ativar selecionados** publica/reativa produtos. **Desativar selecionados** retira os produtos da vitrine sem apagar os cadastros.
- **Excluir selecionados** apaga permanentemente os produtos que não têm vínculo com pedidos. A confirmação mostra a quantidade e os primeiros nomes; é necessário digitar **EXCLUIR**.

Para excluir todos, selecione o catálogo inteiro e escolha **Excluir selecionados**. Produtos vinculados a pedidos, inclusive cancelados, são preservados. O resultado informa quantos foram excluídos e quantos foram preservados, com até 20 nomes para consulta. Para retirar produtos históricos da loja, use **Desativar selecionados**.

Cada linha também oferece **Editar**, **Ativar/Desativar** e **Excluir**, com as mesmas regras de confirmação.

As ações não alteram preços nem estoque. Arquivos de fotos existentes não são removidos. O histórico de pedidos e seus itens permanece intacto.

## Proteções

Somente administradores podem executar ações em lote. A API recebe IDs explícitos e a versão dos produtos carregados; não aceita um comando genérico para alterar produtos adicionados depois da seleção. Até 5.000 produtos por operação. Se um produto tiver sido editado, apagado, vendido ou atualizado após a seleção, a operação é recusada para atualizar e revisar a lista.

As escritas são realizadas em transação serializável. Conflitos de concorrência não deixam alterações parciais. No caso da exclusão, a preservação dos produtos históricos é intencional e os totais são mostrados ao administrador.

Não há migration nem alteração de `DATABASE_URL`. A publicação da funcionalidade não executa ações sobre os produtos cadastrados.

## Navegação do admin

Ordem: Dashboard → Produtos → Pedidos → Categorias → Clientes → Cupons → Personalizar loja.

## Arquivos alterados

- `src/pages/admin/AdminLayout.tsx`: ordem dos links.
- `src/pages/admin/AdminProducts.tsx`: seleção, ações individuais/em lote, resultado e recarga da lista.
- `src/components/ProductBulkDialog.tsx`: confirmação de ações e exclusão.
- `src/App.css`: estilos responsivos e diálogo.
- `server/src/productBulk.ts`: validação, autorização e operações transacionais.
- `server/src/index.ts`: registra a API de ações em lote.
- `server/src/productBulk.test.ts`: autorização, limites, seleção alterada e proteção do histórico.
- `server/src/productBulk.integration.test.ts`: testes em PostgreSQL isolado, incluindo exclusão somente de dados fictícios.
- `README.md` e este guia.

Verificação: TypeScript/frontend/backend, build, suíte de testes de backend, cenários SQL em banco isolado e navegação responsiva em 320, 390, 768, 1024 e 1440 pixels.

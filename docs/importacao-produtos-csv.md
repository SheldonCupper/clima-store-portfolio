# Importar produtos por CSV

Em **Admin → Produtos**, clique em **Importar CSV** no bloco **Cadastro em lote**.

1. Baixe o **modelo CSV**. Ele contém cabeçalho e uma linha de exemplo, que deve ser substituída pelos produtos reais.
2. Preencha a planilha e exporte como **CSV UTF-8**, com separador `;` ou `,`. Até **200 produtos e 1 MB** por arquivo.
3. Selecione o arquivo e clique em **Validar e visualizar**. Confira valores, estoque, status e avisos por linha.
4. Corrija todos os erros antes de confirmar. Avisos de foto/descrição incompleta permitem importar, para revisão posterior.
5. Clique em **Confirmar importação**. A lista será atualizada ao terminar.

## Colunas

Obrigatórias: `nome`, `sku`, `categoria`, `preco`, `estoque`, `peso_kg`, `altura_cm`, `largura_cm`, `comprimento_cm`.

- `categoria`: nome ou slug de uma categoria ativa já cadastrada. O painel mostra os slugs disponíveis. Categorias não são criadas automaticamente.
- `preco`: preço normal, maior que zero. Aceita `119,90` ou `119.90`, sem separador de milhar. Com CSV delimitado por vírgula, coloque valores com vírgula decimal entre aspas.
- `estoque`: inteiro zero ou positivo.
- `peso_kg`: peso total **embalado**, em kg, maior que zero; aceita até quatro casas decimais.
- `altura_cm`, `largura_cm`, `comprimento_cm`: medidas reais da embalagem em cm inteiros positivos. Não use estimativas.

Opcionais: `slug`, `descricao`, `preco_pix`, `ativo`, `imagens`, `gtin`, `marca`, `modelo`, `tensao`, `capacidade`, `aplicacao`, `tipo_gas`.

- `slug`: gerado pelo nome quando vazio. Para variações com o mesmo nome, informe slugs diferentes. Use letras minúsculas sem acentos, números e hífens.
- `preco_pix`: maior que zero e não superior ao preço normal, ou vazio.
- `ativo`: `sim` para ativar; `nao` ou vazio para manter inativo. Também aceita `true`/`false` e `1`/`0`.
- `imagens`: até 12 links HTTPS ou caminhos `/uploads/...` já enviados à loja, separados por `|`. A primeira imagem será a capa. Arquivos de fotos do computador não são enviados por CSV; podem ser adicionados depois na edição.
- `gtin`: código de barras válido; preserve como texto para não perder zeros iniciais.
- Campos técnicos: até 120 caracteres cada. Descrição: até 10.000 caracteres.

Textos com separadores ou quebras de linha devem estar entre aspas duplas. Aspas dentro do texto devem ser duplicadas. O modelo já usa esse formato.

## Preservação dos dados

Somente administradores podem importar. A prévia não cadastra produtos. A confirmação revalida o arquivo, categorias e conflitos no backend; qualquer erro cancela o lote inteiro, sem importação parcial. SKUs e slugs existentes ou repetidos são recusados; nenhum produto é sobrescrito. Reenviar um lote já importado não duplica os produtos.

Se a conexão cair após confirmar, confira a lista antes de tentar novamente. Um cadastro já concluído será identificado pelo SKU/slug. O servidor não guarda o arquivo CSV.

Sem migration, exclusão de dados ou alteração em `DATABASE_URL`.

## Arquivos alterados

- `shared/productCsv.ts`: parser e validação de produtos, limites e modelo.
- `server/src/productImport.ts`: prévia e cadastro em transação com acesso de administrador.
- `server/src/index.ts`: registra as rotas do importador.
- `src/components/ProductCsvImport.tsx`: modelo, seleção, prévia, avisos e confirmação.
- `src/pages/admin/AdminProducts.tsx`: acesso ao importador e atualização da lista.
- `src/App.css`: layout responsivo.
- `server/src/productImport.test.ts` e `server/src/productImport.integration.test.ts`: testes de formato, autorização, validação e concorrência em PostgreSQL isolado.
- `README.md` e este guia.

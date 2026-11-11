# Medidas gratuitas e galeria de produtos

## Preenchimento sem contratação de API

O painel oferece duas alternativas gratuitas:

- **Código de barras:** consulta UPCitemdb pelo backend, usando somente
  `https://api.upcitemdb.com/prod/trial/lookup?upc=...`. O plano gratuito não
  exige cadastro, chave, assinatura ou cartão. Nenhum endpoint pago é usado.
- **Ficha técnica:** cole o texto do fabricante/fornecedor. A leitura acontece
  no navegador, não envia o texto a serviço externo e não tem cota de consultas.
  Um link permite pesquisar a ficha pelo nome do produto na web, em outra aba.
  É preciso selecionar e copiar os dados do modelo/embalagem corretos.

A consulta online tem cobertura variável e não garante que produtos da Clima ou
suas medidas estejam na base. Segundo a documentação atual do provedor, o
plano gratuito permite até 100 consultas diárias por IP, com limites de ritmo.
O backend espera dez segundos entre chamadas, permite uma chamada por vez e
reaproveita consultas bem-sucedidas por quinze minutos em memória. O cache
é limitado a 200 produtos e não altera o banco. Respostas 429 são tratadas sem
ativar plano pago; nesse caso a ficha técnica continua disponível.

Fontes oficiais:

- [Plano gratuito e limites](https://www.upcitemdb.com/wp/docs/main/development/plan/).
- [Formato das respostas](https://www.upcitemdb.com/wp/docs/main/development/responses/).

Não há novas credenciais a configurar. Publique o backend e o frontend para
ativar a nova busca. A ficha técnica pode ser lida mesmo quando a API online
estiver indisponível. A busca por código exige GTIN válido com dígito
verificador; o código salvo no produto continua opcional.

## Revisão das medidas

Depois de consultar ou ler a ficha, confira a prévia e marque que verificou a
embalagem pronta para envio. Só então use **Aplicar medidas disponíveis** e
salve o produto. Dados parciais não apagam os campos já preenchidos.

O leitor aceita unidades explícitas de peso (kg/g/mg/lb/oz e variantes escritas)
e dimensões (cm/mm/m/polegadas). Converte para kg e cm, arredondando para cima
até 0,001 kg e centímetros inteiros. Não interpreta unidades desconhecidas,
números ambíguos com separadores de milhar ou valores sem unidade.

Exemplo de texto para colar:

```text
Peso bruto: 0,850 kg
Altura: 20 cm
Largura: 15 cm
Comprimento: 30 cm
```

Também reconhece unidades no rótulo, por exemplo `Altura (mm): 200` e
`Peso embalado (g): 850`. Na ficha colada, somente peso **bruto/embalado** é
sugerido: peso líquido e peso genérico são ignorados.

O UPCitemdb pode retornar peso genérico do produto, que não necessariamente
inclui a embalagem. O painel mostra o texto original e exige conferência.
Uma sequência como `10 x 20 x 30 cm` não informa os eixos: o administrador
precisa selecionar a ordem no painel antes de preencher altura/largura/
comprimento. Não há suposição automática sobre essa ordem.

As rotas `GET /api/admin/product-lookup/config` e
`GET /api/admin/product-lookup?gtin=...` continuam restritas ao administrador.
A configuração informa apenas o nome do provedor e que o plano é gratuito.
Erros não revelam a resposta bruta externa. Não há nova migration nesta troca;
a galeria e o campo GTIN existentes são mantidos.

## Galeria

No cadastro e edição, selecione várias fotos em **Adicionar fotos**. São até
12 fotos por produto, JPG/PNG/WEBP de até 5 MB cada. O envio reaproveita a rota
administrativa existente e ocorre ao salvar. Se o salvamento falhar depois de
alguns uploads, esses arquivos são reaproveitados ao tentar novamente.

A primeira foto é a capa usada em catálogo, carrinho e checkout. A estrela
define a principal; as setas mudam a ordem; a lixeira remove a referência da
galeria. Arquivos existentes não são apagados do armazenamento. As outras
fotos aparecem nas miniaturas/setas dos detalhes do produto, inclusive no
celular. Produtos antigos continuam usando a imagem que já possuíam.

## Banco e publicação

A migration `20261101180000_add_product_gallery_gtin` adiciona:

```sql
ALTER TABLE "Product"
  ADD COLUMN "gtin" TEXT,
  ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Product"
SET "imageUrls" = ARRAY["imageUrl"]
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
```

Não remove colunas nem registros. `imageUrl` é mantida para compatibilidade.
Quando `imageUrls` é enviada, sua primeira posição define a capa. Clientes
antigos que omitem a galeria/GTIN preservam os dados existentes; a troca da
capa pelo campo antigo mantém os demais ângulos.

No servidor, depois de backup e revisão das migrations pendentes:

```sh
./node_modules/.bin/prisma migrate status --config prisma7.config.ts
./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts
./node_modules/.bin/prisma generate --config prisma7.config.ts
npm --prefix server run typecheck
```

Reinicie o backend e publique o frontend. Não use `migrate reset`, não execute
seed em produção e não altere o `DATABASE_URL` existente para esta atualização.

## Verificações

- Consulta real ao endpoint gratuito: EAN `0885909456017` retornou um produto
  com peso e dimensões; isso valida a conexão, não a cobertura do catálogo Clima.
- Testes simulados de autorização, identidade do produto, conversões, dados
  ausentes, ritmo/cache, limite 429 e indisponibilidade do provedor.
- Leitura de ficha sem API, com peso bruto, unidades e confirmação dos eixos.
- Galeria, capa, ordem, remoção e navegação pública preservadas.
- TypeScript, build, ESLint e suíte do backend.

## Arquivos da troca para consulta gratuita

- `.gitignore`; remoção do modelo `.env.gs1.example`.
- `server/src/index.ts`, `server/src/productLookup.ts`, `server/src/productLookup.test.ts`.
- Remoção dos módulos `server/src/gs1.ts` e `server/src/gs1.test.ts`.
- `shared/productMedia.ts`, `shared/productMeasurements.ts`.
- `src/components/ProductMeasurementLookup.tsx`, `src/components/ProductAdminExtras.css`.
- `src/pages/admin/AdminProductNew.tsx`, `src/pages/admin/AdminProductEdit.tsx`.
- `README.md` e este guia (substitui o guia anterior).

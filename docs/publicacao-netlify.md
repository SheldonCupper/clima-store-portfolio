# Publicação da demonstração na Netlify

Crie um projeto apontando para o novo repositório de portfólio.

- Comando de build: `npm run build:demo`
- Diretório publicado: `dist`
- Variáveis secretas: nenhuma para o modo demo.
- Regra SPA: `/* /index.html 200` em `public/_redirects`.

Para publicar a aplicação completa com backend, use `npm run build:netlify` e configure `BACKEND_URL` com a origem HTTPS da sua própria API. Integrações e banco exigem contas e credenciais próprias; consulte os guias técnicos em `docs/`.

# Backend em servidor próprio

Este guia usa apenas valores de exemplo. Nenhuma infraestrutura anterior faz parte do portfólio.

1. Prepare Node.js 22.12+ e PostgreSQL em infraestrutura própria.
2. Configure o `.env` local do servidor a partir de `.env.example`, com credenciais novas.
3. Instale dependências da raiz e de `server/`, gere o Prisma Client e aplique as migrations no banco escolhido.
4. Adapte os exemplos em `deploy/` para o seu domínio, caminhos e usuário do sistema.
5. Configure HTTPS, backups e `BACKEND_URL` no frontend.

O modo `npm run dev:demo` não usa servidor, credenciais, pagamentos ou banco de dados.

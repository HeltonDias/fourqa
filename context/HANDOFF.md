# FourQA — handoff entre sessões

**Estado inicial**: a estrutura foi observada no ZIP atualizado de 13/10/2026. Este arquivo NÃO é atualizado automaticamente.

## Base conhecida
- Aba Status implementada com frentes dinâmicas; confirmar contra o código ao evoluir métricas.
- `ReportChrome` global e `PageHeader` compartilhado; padronização visual validada pelo usuário.
- Squad v2 já instalada: `impact-analyst` e `qa-verifier`; **não reinstalar**.

## Pendências conhecidas a confirmar
- Responsáveis DEV/cliente podem exigir classificação configurável por projeto.
- Saúde consolidada e sobreposição de rótulos de frentes requerem validação semântica antes de alterar.

## Ao encerrar uma tarefa grande
Atualizar só se a tarefa alterou arquitetura/contrato: data, caminhos modificados, decisão, testes, próxima ação (máximo 10 linhas). Não registrar histórico de ferramentas, trechos extensos de código, dados sensíveis ou logs. Abrir chat novo usando objetivo + este handoff apenas quando útil.

## Fase Supabase (15/10/2026)
- PostgreSQL é o provider operacional. A API exige `DB_PROVIDER=postgres`. Schema esperado e final = 3. O Supabase de desenvolvimento está na versão 3.
- 001 é o baseline. 002 grava a identidade do item (`test_point_id`, `test_case_id`). 003 grava responsável e prioridade da suíte.
- SQLite permanece para testes, backup e importação histórica. Backup pré-migração: `../fourqa-backups/fourqa-supabase-20261015-1503.dump`.
- TLS verifica o certificado. CA extra: `DATABASE_SSL_CA_FILE` (PEM em `certs/`, fora do Git). Caminho: `backend/src/db/postgres/pool.ts`.
- Dados Azure operacionais ficam no cache em memória no desenvolvimento local. Na Vercel o snapshot vai para `execucoes`/`falhas`. Ver `docs/vercel.md`.
- RLS do Supabase de desenvolvimento está ligado. `anon` e `authenticated` não leem as tabelas. A role do backend continua com acesso.

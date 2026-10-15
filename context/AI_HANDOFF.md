# FourQA — handoff contínuo da sessão

**Objetivo atual:** RETOMAR O DESENVOLVIMENTO FUNCIONAL DO FOURQA.

**Etapa concluída:** Preview protegido no ar, com API, PostgreSQL e snapshot Azure. Sem deploy de Production.

**Arquitetura implantada:**
- Projeto Vercel `fourqa`, conta `heltonmarques-8008`, Node 22, build em `iad1`.
- Preview: `https://fourqa-km4ml23vn-heltonmarques-8008.vercel.app`
- Estático em `frontend/dist`. Express em `api/index.mjs` e `api/[...path].mjs`. Sem `listen()` na Function.
- Snapshot Azure em `execucoes`/`falhas`. Sync com `waitUntil`, job em `workbook_meta.sync_job`, limite 300s. Falha antes do `replaceSnapshot` mantém o lote.
- Preview usa pooler porta 6543 e `DATABASE_SSL_CA`. A URL local continua na 5432.
- GitHub não está ligado à Vercel, de propósito: a ligação publicaria Production.

**Supabase de desenvolvimento:** RLS nas dez tabelas public, sem FORCE. `anon`, `authenticated` e PUBLIC sem privilégio. `postgres` tem `bypassrls`. Defaults de `postgres` não reabrem `anon`. Defaults de `supabase_admin` não puderam ser alterados. Migrações `[1,2,3]`. `planning_item=840`, `execucoes=60`.

**Segurança:** Vercel Authentication no Preview (testado: 302 e tela de login). GET, exceto `/api/health`, exige bearer. `FOURQA_ALLOW_OPEN_WRITES` não está definido. O token fica em `localStorage.fourqa_token` e não entra no bundle. O alias `fourqa.vercel.app` foi removido. O deployment Production acidental também foi removido.

**Variáveis de Preview:** `DB_PROVIDER`, `DATABASE_URL`, `DATABASE_SSL_CA`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_API_VERSION`, `SYNC_TEST_PLANS`, `SYNC_HIERARQUIA_SUITES`, `SYNC_RESPONSABILIDADES`, `SYNC_LIMPAR_ANTES`, `SYNC_CRIAR_CABECALHO`, `SYNC_KPI_PLAN_KEY`, `SYNC_FRENTES_VALIDAS`, `FOURQA_API_TOKEN`. Production sem variáveis.

**Testes:** typecheck PASS. `npm test` 203 PASS, 0 FAIL. Build PASS. Preflight e verify PASS. Preview: health `database=ready`, home `ttlCts=60`, execuções `total=60`, falhas `0`, planejamento com itens, status com 3 blocos, sync `idle`. Sem bearer: 401. Sem login Vercel: 302.

**Git:** `feat/supabase-migration` em `fc8836b`, remoto `https://github.com/HeltonDias/fourqa.git`. CI não consultado (`gh` ausente).

**Rollback:** na Vercel, use o deployment Preview anterior. Não promova Production. O SQL de RLS está em `docs/supabase-rls-remediation.sql`; o rollback comentado reabre o acesso público e não deve ser executado. Não restaure o dump antigo por cima dos dados atuais.

**Deploy:** `vercel deploy --yes`, sem `--prod`. Proteção já ligada.

**Riscos:** sync acima de 300s fica interrompido e o lote anterior permanece. O token compartilhado no navegador não é login por usuário. Grants padrão de `supabase_admin` continuam.

**Próxima ação:** desenvolvimento funcional. Não iniciar feature nova nesta infra.

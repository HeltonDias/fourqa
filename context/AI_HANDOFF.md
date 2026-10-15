# FourQA — handoff contínuo da sessão

**Objetivo atual:** publicar o Preview protegido e confirmar o ciclo Vercel → API → Supabase.

**Etapa em andamento:** segurança do banco e preparação da Vercel concluídas. O deploy do Preview ainda não foi executado neste registro.

**Decisões arquiteturais:**
- Projeto Vercel `fourqa`, conta `heltonmarques-8008`, Node 22, região `iad1`. Sem ligação GitHub, para não publicar Production. `main` e `master` ficam com deploy automático desligado neste `vercel.json`.
- `frontend/dist` estático. Express em `api/[...path].mjs`, sem `listen()` na Function.
- Snapshot Azure no PostgreSQL. `AZURE_CACHE_READ=1` impede a subida. Sync com `waitUntil`, job em `workbook_meta.sync_job`, batimento de 90s. `replaceSnapshot` só no fim e não mexe em planejamento.
- Preview usa transaction pooler porta 6543 e `DATABASE_SSL_CA`. A URL local continua na 5432.
- Vercel Authentication ativa para previews e URLs de deployment. GET, exceto `/api/health`, exige bearer. `FOURQA_ALLOW_OPEN_WRITES` não é usado.

**Supabase de desenvolvimento:** RLS ligado nas dez tabelas public, sem FORCE. `anon`, `authenticated` e PUBLIC sem privilégio de tabela ou sequence. A role `postgres` tem `bypassrls` e a escrita de probe foi desfeita. Defaults de `postgres` não reabrem `anon`. Defaults de `supabase_admin` não puderam ser alterados. Migrações `[1,2,3]`. Contagens preservadas, incluindo `planning_item=840`.

**Testes executados:** typecheck PASS. `npm test` 203 PASS, 0 FAIL. Build PASS. Preflight e verify PASS. Bundle sem token, PAT ou `DATABASE_URL`.

**Bloqueios reais:** nenhum para o deploy Preview. Production continua fora de escopo.

**Próxima ação:** deploy Preview pela CLI, sem `--prod`, e validar a URL protegida.

# FourQA

Aplicação web que acompanha a execução de QA a partir do Azure DevOps. A planilha legada serviu de referência para as regras; o FourQA consulta o Azure e calcula os indicadores sozinho.

## Fontes de verdade

- **Test points, bugs e árvore de suítes:** Azure DevOps. Na API PostgreSQL o lote operacional fica no cache em memória; `AZURE_CACHE_READ=0` grava o snapshot legado em `execucoes` e `falhas`.
- **Regras de status:** `classifyExecution` no backend. O frontend não reclassifica. Ver [`.cursor/docs/adr/002-status.md`](.cursor/docs/adr/002-status.md).
- **Hierarquia:** detectada na árvore. Frente e Prioridade não têm nível fixo. Ver [`.cursor/docs/adr/001-hierarquia-dinamica.md`](.cursor/docs/adr/001-hierarquia-dinamica.md).
- **Configuração do plano:** `.env` (`SYNC_TEST_PLANS`, `SYNC_KPI_PLAN_KEY`). O frontend não guarda PlanKey.
- **Planejamento de datas:** importação legada quando a suíte existe lá; senão a janela do plano é inferida e marcada como tal. Ver [`.cursor/docs/adr/003-planejamento.md`](.cursor/docs/adr/003-planejamento.md).
- **PAT:** só no `.env`, só no backend. Não vai para o banco, para o frontend nem para logs.

## Fluxo de sincronização

`FETCH` (suítes, test points, runs, bugs) → `TRANSFORM` (dimensões + status) → `VALIDATE` → `COMMIT` transacional.

Se a validação falhar (lote vazio, TestPointId ou BugId duplicado, suíte sem pai na árvore), os dados anteriores permanecem.

## Como executar

Requisitos: Node.js 22 (frontend) e JDK 25 (API Java / Spring Boot 4; Maven vem pelo Wrapper em `backend/`).

```bash
npm install
cp .env.example .env   # preencha org, projeto, PAT, DATABASE_URL e SYNC_TEST_PLANS
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001 (`npm run dev:api`, Spring Boot)

A API só sobe com `DB_PROVIDER=postgres` e `DATABASE_URL`. A única árvore SQL é `backend/src/main/resources/db/postgres` (001 a 006). A primeira abertura dos stores Postgres aplica o que ainda falta. Não existe workspace npm `backend` nem `npm run db:postgres:*`.

SQLite fica nos testes e na importação histórica (`data/fourqa.db`, alterável com `FOURQA_DB`). `npm run import:planilha` traz o snapshot da planilha. A URL fica só no `.env`, que o Git ignora.

## Testes e build

```bash
npm run typecheck
npm test
npm run build
```

## Novo projeto / Test Plan

1. Ajuste `SYNC_TEST_PLANS` com o PlanId e um PlanKey estável.
2. Ajuste `SYNC_KPI_PLAN_KEY` para o plano da Home.
3. `SYNC_FRENTES_VALIDAS` só entra se o projeto marca frentes nas tags dos bugs. Não define o nível na árvore.
4. `SYNC_HIERARQUIA_SUITES` é opcional. Deixe inativo para a detecção automática.
5. Clique em Atualizar. A Home mostra só as dimensões reconhecidas (ou "Nível N").

## Segurança antes de compartilhar

- `FRONTEND_ORIGIN` restringe o CORS. Vazio permite só localhost.
- `FOURQA_API_TOKEN`, se preenchido, protege as escritas. O navegador grava a sessão em cookie `fourqa_session` (HttpOnly). O JavaScript não lê o valor.
- Não há login de usuários. Não publique o FourQA na internet só com o token vazio.
- O health check responde `{ ok, database }` e não devolve caminho de arquivo.

## Vercel

A Vercel serve o frontend Vite em `frontend/dist` e faz rewrite de `/api/*` para o host Java (ainda não homologado; destino marcador em `vercel.json`). No host o snapshot Azure fica no PostgreSQL (`execucoes` e `falhas`); o cache em memória continua só no desenvolvimento local. Variáveis, pooler, sync e proteção: [`.cursor/docs/vercel.md`](.cursor/docs/vercel.md). Não faça deploy sem a autorização explícita do projeto.

Não empacote `.env`, `data/*.db`, `node_modules`, `dist` nem as planilhas de `fonte/`.

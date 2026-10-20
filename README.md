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

Requisitos: Node.js 22+ (`node:sqlite`). Python só é necessário para importar a planilha legada.

```bash
npm install
cp .env.example .env   # preencha org, projeto, PAT e SYNC_TEST_PLANS
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

A API exige `DB_PROVIDER=postgres` e `DATABASE_URL`. O schema fica nas migrations `backend/src/db/postgres/migrations` e não é aplicado no boot. No Windows, a partir da raiz:

```bash
npm.cmd run db:postgres:preflight -w backend
npm.cmd run db:postgres:migrate -w backend
npm.cmd run db:postgres:verify -w backend
```

SQLite permanece para testes, backup e importação histórica (`data/fourqa.db`, alterável com `FOURQA_DB`). `npm run import:planilha` continua disponível só para trazer o snapshot da planilha. A URL fica só no `.env`, que o Git ignora.

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
- `FOURQA_API_TOKEN`, se preenchido, protege `POST /api/sync` e `PUT /api/cabecalho`. No navegador, grave o mesmo valor em `localStorage.fourqa_token`.
- Não há login de usuários. Não publique o FourQA na internet só com o token vazio.
- O health check responde `{ ok, database }` e não devolve caminho de arquivo.

## Vercel

O Preview usa o frontend Vite em `frontend/dist` e o Express em `api/[...path].mjs`. Na Vercel o snapshot Azure fica no PostgreSQL. Variáveis, pooler, sync e proteção estão em [`.cursor/docs/vercel.md`](.cursor/docs/vercel.md). Não faça deploy sem a autorização explícita do projeto.

Não empacote `.env`, `data/*.db`, `node_modules`, `dist` nem as planilhas de `fonte/`.

## Vercel

O Preview usa o frontend estático e uma Function Express em `/api`. Na Vercel o snapshot do Azure fica no PostgreSQL (`execucoes` e `falhas`); o cache em memória continua só no desenvolvimento local. Variáveis, pooler, sync e proteção do Preview: [`.cursor/docs/vercel.md`](.cursor/docs/vercel.md). Não faça deploy sem a autorização explícita do projeto.

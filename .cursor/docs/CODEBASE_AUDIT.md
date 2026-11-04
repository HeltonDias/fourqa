# FourQA — auditoria da implementação

> **Histórico (15/10/2026).** Stack abaixo (Express/TS) **não** é a vigente. Estado atual: Python/FastAPI — `ARCHITECTURE.md`, `context/PROJECT_MAP.md`, ADR 007 / `DEC-033`.

Auditoria somente leitura em 15/10/2026. Não executou testes, sync, migração nem deploy. Não lê `.env`.

## Arquitetura real *(na data da auditoria)*

Monorepo npm (`package.json` na raiz), workspaces `backend` e `frontend`. Não há pacote compartilhado.

| Camada | Onde | Papel |
|---|---|---|
| SPA | `frontend/` React 19, Vite, React Router | Report, Planejamento, Status, Execuções, Falhas |
| API | `backend/` Express 5, TypeScript | Rotas em `backend/src/routes/api.ts` |
| Processo local | `backend/src/server.ts` | `listen` só quando `VERCEL !== "1"` |
| Function | `api/[...path].mjs`, `api/index.mjs` | Reexportam `backend/dist/app.js` |
| Deploy | `vercel.json`, `.cursor/docs/vercel.md` | Estático em `frontend/dist`; API em `/api` |
| Operacional | PostgreSQL (Supabase) | `DB_PROVIDER=postgres` |
| Testes e legado | SQLite | `backend/src/db/migrate.ts`, importação histórica |

Rotas da SPA, `frontend/src/App.tsx`: `/` Report, `/planejamento`, `/status-frente`, `/execucoes`, `/falhas`.

Isolamento operacional é por `plan_key` (texto, padrão `EndToEnd` em `backend/src/domain/formulas.ts`), não por empresa.

## Fluxo de dados

1. Configuração Azure em variáveis (`backend/src/azure/config.ts`): org, projeto, PAT, `SYNC_TEST_PLANS`, hierarquia, responsabilidades por categoria, frentes.
2. `POST /api/sync` lê o Azure e, na Vercel, grava o snapshot no PostgreSQL. Localmente, com cache em memória, não mistura meta nova com linhas antigas (`backend/src/azure/azureCacheConsistency.ts`).
3. O snapshot substitui `execucoes` e `falhas` e só as metas do lote. Não apaga planejamento (`backend/src/db/postgres/postgresAzureSnapshotStore.ts`).
4. Planejamento, revisões, alocações, responsável e prioridade de suíte ficam no PostgreSQL e são editados pelo FourQA.
5. Report, Status e listagens leem o snapshot e o planejamento confirmado. A Home ainda usa a regra do ADR 003 (`.cursor/docs/adr/003-planejamento.md`).

Não há job CRON no repositório. A sincronização é manual, via Atualizar.

## Banco

Migrações em `backend/src/db/postgres/migrations/`. Versão final 3 (`POSTGRES_SCHEMA_VERSION` em `migrate.ts`).

| Tabela | Função |
|---|---|
| `workbook_meta` | Cabeçalho, período, KPI, catálogo, `sync_job` |
| `planejamento_linhas` | Base legada da planilha (QA, frente, processo, datas, quantidades) |
| `execucoes` | Um registro por Test Point do snapshot |
| `falhas` | Um registro por bug ligado a resultados do plano |
| `planning` | Um plano interno por `plan_key` |
| `planning_revision` | Versão, motivo, origem do baseline, flag de escopo confirmado |
| `planning_scope_item` | Membership: `suite_id`, `test_point_id`, `test_case_id` |
| `planning_item` | Linha de agenda. Com suíte, agrupa os pontos; guarda `baseline_quantity`, `responsavel`, `prioridade` |
| `planning_allocation` | Quantidade por data na linha (`item_id`, `alloc_date`, `planned_quantity`) |
| `schema_migrations` | Ledger 1, 2, 3 |

002 acrescenta `test_point_id` e `test_case_id` em `planning_item`. 003 acrescenta `responsavel` e `prioridade`.

Não existem `companies`, `users`, `planning_cells`, `history_events` nem `responsibilities_shared`.

RLS do Supabase de desenvolvimento foi ligado fora destas migrações. Script e limites: `.cursor/docs/supabase-rls-remediation.sql`.

## Planejamento

Orquestração: `getPlanningView`, `confirmOrRevise`, `savePlanningCell` em `backend/src/services/planningService.ts`.

Identidade, `scopeGroupKey` e `scheduleItemsForScope` em `backend/src/domain/planning.ts`:

- Suíte com id vira uma linha. `baseline_quantity` é a contagem de Test Points da suíte.
- Sem suíte, cada Test Point fica em linha própria.
- `planning_allocation` guarda quantidade por dia, sem `user_id` e sem o Test Point.
- `responsavel` e `prioridade` são texto livre da suíte, não usuário do sistema. Prioridade da suíte é editada em Planejar; responsável em Acompanhamento (`frontend/src/components/planning/PlanningGridTable.tsx`, `PlanningAcompanhamentoTable.tsx`).
- A prioridade do Test Case no Azure (`Microsoft.VSTS.Common.Priority`) é outro campo, `case_priority`, lido em `readCasePriority` (`backend/src/azure/execucoes.ts`).

Revisão nova copia a agenda ou recalcula o escopo a partir do snapshot. A confirmação grava motivo em `planning_revision.reason`. Não há trilha de cada célula (valor antigo, valor novo, autor).

`datesBetween` inclui todos os dias do período. A grade usa `onlyWeekdays` em `PlanejamentoPage.tsx` e tira sábado e domingo da tela. Não há interruptor para ligá-los. `businessDays` em `backend/src/domain/graficos.ts` serve ao cálculo de planejado até hoje, não à grade.

Não há distribuição “montanha”, modal de substituição, linhas expansíveis por QA nem meta por QA.

## Azure DevOps

Único conector. Cliente em `backend/src/azure/client.ts`: Basic com PAT, GET (e POST disponível no cliente). Retentativa até 5 vezes em 429, 502, 503 e 504, honrando `Retry-After`, com teto de 60s. Não lê `X-RateLimit-Remaining`.

Execuções (`backend/src/azure/execucoes.ts`):

- Árvore de suítes do Test Plan.
- Test Points paginados, com `witFields` de título, estado, tags e prioridade.
- Uma linha por ponto: ids, hierarquia, outcome, `date_completed`, `run_by`, último run e último result.
- `responsabilidade` da execução fica nula. Tags não definem responsável.
- `readCasePriority` lê `Microsoft.VSTS.Common.Priority`. O valor viaja no lote em memória. As tabelas `execucoes` do PostgreSQL e do SQLite não têm a coluna `case_priority` (`casePriority.test.ts`). Na leitura pelo snapshot SQL, a coluna Prioridade de Execuções não tem de onde vir.

Falhas (`backend/src/azure/falhas.ts`):

- Runs do plano e resultados com bugs.
- Work items Bug. O lote pede `System.CreatedBy` e `System.AssignedTo`.
- O `responsavel` gravado vem do mapa `SYNC_RESPONSABILIDADES` pela categoria da falha, não de Created By nem de Assigned To.
- Impacto é a quantidade de frentes/pontos ligados ao bug, não uma contagem inventada de execução.

`AzureClient.post` é usado uma vez: `getWorkItemsBatch` em `falhas.ts` chama `POST /_apis/wit/workitemsbatch` com `ids` e `fields`. É leitura em lote, não alteração de work item. Não há PATCH nem PUT para o Azure. O repositório não cria, não atribui e não muda resultado no DevOps.

O snapshot é o estado atual dos pontos, não o histórico de todas as runs. `last_test_run_id` e `last_result_id` apontam o último resultado conhecido.

Estado do job: `workbook_meta.sync_job` (`backend/src/services/syncJob.ts`). Na Vercel, `waitUntil` e `maxDuration` 300. Interrupção não substitui o lote anterior.

## Telas

| Tela | Fonte | Edição |
|---|---|---|
| Report `/` | `reportService.ts`, KPIs, gráficos | Cabeçalho e período |
| Planejamento | `planningService.ts` | Datas, quantidades, prioridade, responsável, revisão |
| Status `/status-frente` | Agregação por frente | Somente leitura |
| Execuções | Snapshot paginado | Somente busca e leitura |
| Falhas | Snapshot paginado | Somente leitura |

`evolucaoStatus` (`backend/src/domain/evolucaoStatus.ts`) classifica o status visual da frente (GAP, finalizado, N/A). Não é evolução individual de QA.

A busca em Execuções é o único `input` da página (`ExecucoesPage.tsx`). Não se lança execução no FourQA.

## Autenticação

`backend/src/http/writeAuth.ts`: um bearer compartilhado, `FOURQA_API_TOKEN`, comparado em tempo constante.

- Escrita exige o token. `FOURQA_ALLOW_OPEN_WRITES` é ignorado quando `VERCEL=1`.
- Na Vercel, leitura também exige o token, exceto `/api/health`.
- O browser guarda o valor em `localStorage.fourqa_token` (`frontend/src/api.ts`, `ReportChrome.tsx`). Não há usuário, papel, JWT, OAuth nem link de visualização.
- Vercel Authentication protege a URL do Preview. Isso não é o modelo de papéis do produto.

## Testes e agentes

A suíte está em `backend/package.json` (`npm test`): domínio, planejamento, snapshot, migração, auth, sync e formato Vercel. Esta auditoria não a reexecutou.

ADRs: `.cursor/docs/adr/001` hierarquia, `002` status, `003` Home vs planejamento, `004` baseline.

Agentes em `.cursor/agents/`: `impact-analyst` (somente leitura), `qa-verifier`, `regras.md`. Regras em `.cursor/rules/`.

## Limitações verificadas

1. **Suíte compartilhada.** A agenda é quantidade por suíte e data. Vários QAs não têm linhas, percentuais nem Test Points próprios. `responsavel` é um texto só.
2. **Evolução individual.** Dá para saber quantos pontos a suíte tem e o outcome de cada ponto no Azure. Não dá para dizer, sem estimativa, quantos desses pontos contam para cada QA quando a suíte é compartilhada. `run_by` existe no snapshot, mas a regra de produto não usa quem executou no Azure como dono da meta.
3. **Histórico de execução.** Não há tabela de runs anteriores. Um sync substitui o snapshot.
4. **Histórico de planejamento.** Há revisões de baseline, não auditoria de célula.
5. **Um tenant.** Credencial Azure e token são do ambiente. Outra empresa exigiria outro isolamento, não só outro `plan_key`.
6. **Auth.** Quem tem o token escreve. Não há admin, QA e visualizador.

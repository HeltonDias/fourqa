# Contratos HTTP — referência Python (FastAPI)

**Fonte:** `backend/src/fourqa/api/routes.py` no HEAD desta linha, mais `page_query.py`, `write_auth.py` e `domain/formulas.py`. Comportamento não visto no código não entra como fato.

**Working tree do Planejar, ainda sem commit:** `PUT /api/planejamento/lote` e `GET /api/planejamento/alteracoes` estão no código Node local e foram portados para o motor Java em memória. `PUT /api/planejamento/distribuir` existe só no Node. Não fazem parte do commit `f8dc769`. A migração 004 não foi aplicada.

Prefixo real: `/api`. O Java operacional responde `{ ok, database }` em `/api/health`. Sem banco, `database` é `unavailable`.

Não há 403 no código atual. 403 fica como código **futuro** de “autenticado sem permissão”, descrito em `JAVA-IDENTITY.md`.

Leitura protegida: GET diferente de `/health` pode exigir bearer. Sem token configurado: 503 `"Acesso desabilitado. Configure FOURQA_API_TOKEN neste ambiente."`. Token errado: 401 `"Não autorizado."`.

Escrita (`requireWriteAuth`): sem token configurado, 503 pedindo `FOURQA_API_TOKEN` ou, fora da Vercel, `FOURQA_ALLOW_OPEN_WRITES=1`. Token errado: 401. Banco indisponível nas rotas que chamam `ready`: 503 `"Banco indisponível."`.

`planKey` de leitura: query opcional; vazio cai em `kpi_plan_key` ou `EndToEnd` (`DEC-031`). Escrita de revisão e célula: query `planKey` obrigatória, única, sem controle; senão 400 e sem gravação.

Paginação (`parsePageQuery`): `limit` padrão 50, entre 1 e 200; `offset` padrão 0, mínimo 0; `q` até 200 caracteres.

## Rotas confirmadas

| Método e rota | Auth atual | Entrada confirmada | Sucesso e erros confirmados | Código | Migração |
|---|---|---|---|---|---|
| GET `/api/health` | Aberta | — | `{ ok, database: "ready" \| "unavailable" }` | `api.ts` | Não copiar o health Java |
| GET `/api/meta` | Leitura | — | JSON do período de `getHome`. 503 banco. 400 período inválido. | `api.ts` | Pendente |
| GET `/api/home` | Leitura | `planKey` opcional | DTO de `getHome`. 503, 400. | `reportService.ts` | Pendente |
| PUT `/api/cabecalho` | Escrita | Título obrigatório, subtítulo, base do cabeçalho. Título ≤ 200, subtítulo ≤ 300. | 400 nas mensagens de título, subtítulo ou base. 409 se conflito de planejamento. | `api.ts` | Pendente |
| PUT `/api/periodo` | Escrita | Início, fim e base do período. | 400 se faltar início/fim ou a base. 400 de período. 409 conflito. | `api.ts` | Pendente |
| GET `/api/planejamento` | Leitura | `planKey` opcional, `version` opcional (> 0) | DTO de `getPlanningView`. 503, 400. | `planningService.ts` | Pendente |
| POST `/api/planejamento/revisao` | Escrita | Query `planKey` explícito. Body `reason`, `adoptSource` (default adota a fonte). | 400 de PlanKey ou de gravação. 409 conflito. | `api.ts`, `planKey.ts` | Pendente |
| PUT `/api/planejamento/celula` | Escrita | Query `planKey`. `field`: `start`, `end`, `day`, `responsavel`, `prioridade`. `suiteId`, `testPointId`, `date`, `quantity`, `value`, base da célula. | 400 campo inválido, PlanKey ou base inválida. 409 conflito. No schema 3 a célula grava e a trilha espera a 004. | `api.ts` | Pendente |
| PUT `/api/planejamento/lote` | Escrita | Query `planKey` explícito. Body `changes[]` com `field` `start`, `end` ou `day`, data, quantidade no dia, base da célula. Lista vazia: 400 `"Nenhuma alteração."`. Máximo 400 mudanças. Campo em branco não entra no body: a data da linha permanece. | 200 visão atualizada. 400 campo, PlanKey, base, intervalo ou período. 409 conflito. Schema 3: 400 `"Histórico de planejamento indisponível. Nenhuma alteração foi gravada."` e nada persiste. Uma transação: falha desfaz o lote. Não redistribui alocação fora do novo intervalo. | `api.ts`, `planningService.ts` | Pendente |
| PUT `/api/planejamento/distribuir` | Escrita | Query `planKey` explícito. Body `strategy` (`montanha`, `decrescente`, `crescente`, `uniforme`), `start`, `end`, `resguardo` (inteiro ≥ 0, dias corridos), `enabledWeekendDays[]`, `replace` (true reescreve os dias; ausente ou false preserva dia com quantidade e preenche só dia em zero), `assignment` opcional só `manter`. | 200 visão atualizada. A quantidade de cada suíte é o maior entre a Qtd plan e a soma já lançada. A curva usa o intervalo de `start` até `end − resguardo`, sem cortar em hoje. Não altera responsável, baseline nem datas da linha. 400 estratégia, período, resguardo, sem quantidade, sem dia ou sem dia em zero. 409 conflito e nada persiste. | `api.ts`, `planningService.ts`, `distribute.ts` | Pendente |
| GET `/api/planejamento/alteracoes` | Leitura | `planKey` opcional | `{ supported, entries }`. `supported: false` no schema 3, `entries` vazio. Não significa “ninguém editou”. `supported: true` lista até 300 linhas do `plan_key`, mais recente primeiro. | `api.ts` | Pendente |
| GET `/api/status-frente` | Leitura | `planKey` opcional | DTO de `getStatusPorFrente`. 503. | `api.ts` | Pendente |
| GET `/api/execucoes` | Leitura | `planKey`, `limit`, `offset`, `q` | Página de execuções. 503. Cache Azure indisponível: 503 com `unavailable: true`. | `api.ts` | Pendente |
| GET `/api/falhas` | Leitura | `planKey`, `limit`, `offset`, `q` | Página de falhas. Mesmos 503. | `api.ts` | Pendente |
| POST `/api/sync` | Escrita | — | 202 se `started`, senão 200, corpo `{ started, state }`. 400 se faltar org, projeto, PAT ou `SYNC_TEST_PLANS`. Java sem bean: 503. 500 mensagem genérica. | `syncService.ts`, `SyncController.java` | Java parcial; Azure ao vivo não homologado |
| GET `/api/sync/status` | Leitura se GET protegido | — | Estado de `getSyncState`. | `syncJob.ts` | Pendente |

Arquivos de teste já existentes no Node, sem port Java: `formulas.test.ts`, `planKey.test.ts`, `writeAuth.test.ts`, `writeRoutes.test.ts`, `syncJob.test.ts`, `reportService` / `planningService` conforme o módulo. Postgres real: skip sem `TEST_DATABASE_URL`.

OpenAPI inicial, só com o que está na tabela, sem schema inventado de DTO: `.cursor/docs/http-contracts.openapi.yaml`.

## Matriz de invariantes

Nenhuma métrica muda nesta fase. Java ainda não implementa estas regras.

| # | Regra | Node | Teste | HTTP | Java |
|---|---|---|---|---|---|
| 1 | Outcome do Test Point prevalece sobre o estado do Test Case | `estadoPonto`, `classifyExecution` | `formulas.test.ts` | Indireto em `/home`, `/execucoes`, `/status-frente` | Não iniciado |
| 2 | Uma classificação canônica por Test Point | `classifyExecution` (ADR 002) | `formulas.test.ts` | Os mesmos | Não iniciado |
| 3 | Report: realizado = Passed + NotApplicable | `totalRealizadoLinha` | `formulas.test.ts` | `/home` | Não iniciado |
| 4 | Cancelados legados têm semântica da aba, não do Report | `finalizadosComCancelados` vs realizado | `formulas.test.ts` | `/home` ≠ `/status-frente` | Não iniciado |
| 5 | Frente e prioridade seguem a hierarquia dinâmica | `dimensions.ts` (ADR 001) | `dimensions.test.ts` | `/home`, `/status-frente`, célula `prioridade` | Não iniciado |
| 6 | PlanKey isola planos | `planKey.ts` (DEC-031) | `planKey.test.ts` | Query nas rotas da tabela | Não iniciado |
| 7 | Baseline, revisão, alocação e histórico não se apagam para “consertar” conta | ADR 004, `planningService.ts` | `planning.test.ts` | `/planejamento`, revisão, célula | Não iniciado |
| 8 | Sync não grava lote inválido nem snapshot parcial | `syncJob.ts`, store Postgres | `syncJob.test.ts` | POST `/sync` | Não iniciado |
| 9 | Estado atual não é histórico de execuções | `DEC-T04` | — | `/execucoes` | Não iniciado |
| 10 | Métrica só muda com aceite | ADR 002, 003, 004 | `formulas:parity` | Contrato desta página | Não iniciado |

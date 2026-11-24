# Matriz de paridade Node × Java

**Estado geral:** migração técnica aprovada em ambiente isolado; cutover pendente. Hierarquia, KPI, paridade HTTP, React contra Java, JAR e imagem foram executados. Azure ao vivo, Entra ID, hospedagem e backup operacional continuam pendentes. Node e Vercel seguem operacionais.
**Atualizado:** 2026-10-27.
**PostgreSQL:** Docker `fourqa-parity-pg`, `127.0.0.1:54329`, bancos `fourqa_mig` (Node) e `fourqa_java` (Java). Porta 5432 do Windows não foi usada. Supabase não foi usado. Migração 004 só nesses bancos.
**Comparação:** `backend/scripts/parity-seed.mjs` e `backend/scripts/parity-http.mjs`. Node em `:3011` com `AZURE_CACHE_READ=0` (caminho SQL, o padrão da Vercel). Java em `:8081`. Token de teste local, não o token operacional.
**Exceção de comparação:** `atualizadoEm` e `createdAt` são relógio da requisição. O restante do JSON foi comparado sem outra normalização.

| Módulo | Endpoint | Node | Java | PostgreSQL | Azure | React | Testes | Evidência | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Report | `GET /api/home`, `GET /api/meta` | 200 | 200 | sim | n/a | título Paridade; Passed 2, N/A 1, Falhados 1, frente Login | HTTP 22/22 reexecutado | `parity-http.mjs` exit 0, diffs 0 | HOMOLOGADO |
| Report | `PUT /api/cabecalho` | 200 | 200 | sim | n/a | não reescrito nesta sessão | mesmo run | lock `pg_advisory_xact_lock` | VALIDADO |
| Report | `PUT /api/periodo` | 200 | 200 | sim | n/a | período visível na Visão Geral | mesmo run | mesmo | VALIDADO |
| Status | `GET /api/status-frente` | 200 | 200 | sim | n/a | `/status-frente` mostrou Login | mesmo run | API e tela no Java | HOMOLOGADO |
| Planejamento | `GET /api/planejamento`, `GET /api/planejamento/alteracoes` | 200 | 200 | sim | n/a | PlanoA com SuiteA e SuiteB após reload | mesmo run | catálogo alinhado | HOMOLOGADO |
| Planejamento | `POST /api/planejamento/revisao`, `PUT /api/planejamento/celula`, `PUT /api/planejamento/lote` | 200 / 400 / 409 | iguais | sim | n/a | modal operada no Java; conflito manteve 2026-10-06 | mesmo run | ver Marco 5 | HOMOLOGADO |
| Execuções | `GET /api/execucoes` | 200 | 200 | sim | n/a | Caso A visível | mesmo run | filtro e paginação na API | HOMOLOGADO |
| Falhas | `GET /api/falhas` | 200 | 200 | sim | n/a | funcional e Active visíveis | mesmo run | PlanoB isolado na API | HOMOLOGADO |
| Sync | `GET /api/sync/status` | idle | idle | sim | não | não | HTTP | mesmo run | VALIDADO |
| Sync | `POST /api/sync` | não chamado | cliente simulado no teste | sim no teste | não ao vivo | não | `AzureSnapshotLoaderTest`, `SyncEngineTest` 8/8 | hierarquia, KPI, paginação, timeout, rollback, claim, heartbeat | VALIDADO |
| Saúde | `GET /api/health` | ready | ready | sim | n/a | indireto | HTTP | bancos separados | VALIDADO |

## Segurança

Escrita sem bearer responde 401 nos dois quando há token. `WriteAuthHttpTest` cobre o Java. Consulta com `' OR 1=1 --` não alarga a página. CORS reflete só origens locais e `FRONTEND_ORIGIN`. Sem dual-write: cada API no próprio banco. Entra ID e perfis futuros não foram implementados.

## Correção após revisão

A revisão de código leu o Java depois da comparação HTTP. Dois furos eram reais e foram corrigidos:

- `planning_change_log.created_at` passa por `isoTimestamp` na leitura. Formato UTC com milissegundos, igual a `Date.toISOString()`. `PostgresStoreTimestampTest` cobre driver e texto do Postgres. A comparação HTTP continua zerando `createdAt`, então ela não prova esse campo.
- Sem `dimensoes_catalog`, com JSON inválido ou array vazio, o planejamento infere o catálogo como o Node. Catálogo gravado e dimensão oculta não disparam a inferência. `CatalogFallbackTest` cobre os quatro casos.
- Plano confirmado sem linha legada quebrava em `baselineCount` nulo (`Integer.intValue`). O ternário foi separado. `ModuleHttpTest` segue verde.

Marco 4 continua PARCIAL. Azure real e a modal de lote não foram reabertos.

## Marco 5 — 2026-10-27 (fechamento)

Hierarquia e KPI deixaram de ficar vazios. `SuiteDimensions` segue o refresh do Node: Onda permanece genérica, frente exige dica, coluna explícita vence heurística, PlanKey não vaza. `AzureSnapshotLoader` grava frente, processo, `dimensionsJson` e `dimensoes_catalog:{planKey}`. `KpiImpactos` conta só failed/blocked, escolhe o bug aberto mais novo e classifica Foursys, Cliente ou Reteste. Metas `kpi_impactos:{planKey}`, `kpi_plan_key` e `ultima_sincronizacao_azure` entram no snapshot. Resultado do Test Point continua prevalecendo. Realizado continua Passed + NotApplicable. `case_priority` não virou coluna.

Datas do Azure seguem o prefixo `YYYY-MM-DD`, sem conversão de fuso. `createdAt` e `atualizadoEm` continuam zerados em `parity-http.mjs` porque são relógio da requisição. Os dois lados emitem UTC com milissegundos; `PostgresStoreTimestampTest` cobre o driver. O surrogate `id` foi comparado e coincidiu depois de `TRUNCATE … RESTART IDENTITY` só em `fourqa_java`.

`parity-http.mjs` reexecutado: 22 chamadas, diffs 0. `SyncEngineTest`: 8 testes, 0 falhas, em `127.0.0.1:54329/fourqa_java`. Esse teste recria só o schema 001. A recusa do lote sem a versão 4 está em `ModuleHttpTest` e no código de `PostgresPlanning`. A suíte anterior, com o SyncEngine ignorado por falta de JDBC, terminou com 0 falhas. Supabase não foi usado. Azure ao vivo não foi chamado.

React em `127.0.0.1:5173` com proxy só para o Java `:8081`. Nenhuma chamada foi para `:3011` ou `:3001`. Modal de lote em PlanoA: início posterior ao fim e data fora do período bloqueiam Salvar; Cancelar não gravou; só o fim `2026-10-24` (sábado, data comum) gravou; só o início `2026-10-05` gravou; o reload confirmou; base stale devolveu “Essa célula foi alterada por outra pessoa” e manteve `2026-10-06`. PlanoB `Outra` ficou `null|null`. Células de quantidade de fim de semana seguiram desativadas. Não há calendário excepcional.

`fourqa_mig` permaneceu em SuiteA `2026-10-03` / `2026-10-21`. As datas da UI existem só em `fourqa_java`. `pg_dump` desse banco, restaurado em `fourqa_restore`, sobreviveu a um `UPDATE` para `1999-01-01` na cópia: após novo restore, zero linhas nessa data e SuiteA `2026-10-06` presente. Isso não valida backup operacional.

Imagem `fourqa-api-java:marco5` construída. Container em `:8082` contra o Postgres descartável respondeu `{"ok":true,"database":"ready"}` e foi parado. Pool Hikari, nome `fourqa-java`, máximo 5. JAR `backend-java/target/fourqa-api-0.1.0-SNAPSHOT.jar`.

Escrita sem bearer: 401 no Java `:8081` e no Node `:3011`. Origem estranha não recebe `Access-Control-Allow-Origin`. Página com aspas de SQL não alarga o total. Log da aplicação Java não contém o token nem a senha JDBC. Entra ID não foi implementado. Bearer compartilhado continua bloqueio de exposição pública.

## Auditoria MIG-JAVA-FINAL

Não havia arquivo com esse nome. Esta seção é a auditoria.

| Item | Classe | Evidência |
|---|---|---|
| Sync Java com hierarquia, KPI, posse, heartbeat e rollback | VALIDADO | testes com cliente simulado e Postgres `54329` |
| Regras canônicas | VALIDADO | qa-verifier: 8/8 PASS no código |
| 15 rotas / 22 chamadas HTTP | VALIDADO | diffs 0; `createdAt` mascarado por contrato de relógio |
| React Report, Status, Planejamento, Execuções, Falhas e modal | HOMOLOGADO | só contra Java isolado |
| PostgreSQL isolado e ausência de dual-write | VALIDADO | `fourqa_mig` intacto |
| Segurança sem regressão frente ao Node | VALIDADO | 401, CORS, injeção, logs |
| Segurança para exposição real | PENDENTE EXTERNO | sem Entra; bearer compartilhado |
| JAR e container | VALIDADO | health ready; container parado |
| Backup/rollback local | VALIDADO | dump e restore em `fourqa_restore` |
| Backup operacional e 004 no Supabase | PENDENTE EXTERNO | não aplicados |
| Azure ao vivo | PENDENTE EXTERNO | sem credencial autorizada |
| Hospedagem, HTTPS e DNS | PENDENTE EXTERNO | sem destino aprovado |

**Decisão:** migração técnica aprovada, cutover pendente.

## Pendências

- Azure ao vivo: leitura autorizada ainda não executada. Persistência, se houver, só no Postgres isolado.
- 004 no Supabase operacional: não aplicar. Ordem futura: backup operacional, prova de restauração, 004 só com autorização, um escritor por vez.
- Cutover bloqueado: Entra ID, destino aprovado, HTTPS/proxy e backup operacional.
- Perfil QA Funcional continua futuro: leitura e Atualizar, sem edição manual.

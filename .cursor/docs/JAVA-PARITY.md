# Matriz de paridade Python × Java

**Estado geral:** cutover local feito em 2026-11-04 (sem commit): Python removido, API Java em `backend/` (ADR 008, `DEC-041`). Paridade HTTP golden 34/34 contra o Python, medida antes da remoção. Homologação (host Java, segredos, rewrite `/api` da Preview, rollback) pendente de autorização.
**Atualizado:** 2026-11-04.
**Histórico:** a matriz anterior (Node × Java, 2026-10-27, ADR 006) está no Git; foi superada por `DEC-033` e depois por `DEC-041`.

## Evidência executada (2026-11-04)

| Verificação | Comando | Resultado |
|---|---|---|
| Build + testes Java | `npm test` (`backend/`, `./mvnw -B verify`) | 88 testes, 0 falhas |
| Vetores de fórmula | `npm run formulas:parity` | Python e Java sobre `backend/shared/formulas-parity-vectors.json` |
| Golden HTTP | `GoldenParityTest` sobre `src/test/resources/golden/http-golden.json` | 34 cenários, 0 divergências |
| Fernet | `AuthUnitTest.decryptsFernetTokenFromPython` + decifra no Python do token Java | compatível nos dois sentidos |
| Sessão | `AuthUnitTest.sessionTokenMatchesPython` | token HMAC byte a byte igual |
| JAR | `java -jar target/fourqa-api-0.2.0-SNAPSHOT.jar` (SQLite, `:3091`) | `/api/health` 200 `{"ok":true,"database":"ready"}` |

**Golden:** o script de captura (removido no cutover) rodou o `TestClient` do FastAPI com cache Azure semeado e escrita aberta, sem ler `.env` (`_file_env` neutralizado). Timestamps ISO são mascarados (`<ts>`); status e JSON comparados exatamente. Não há dado real nas fixtures.

**Não exercitado:** PostgreSQL real (sem Docker/Testcontainers no ambiente; Supabase não foi usado), Azure DevOps ao vivo e Entra ID real (clientes HTTP simulados nos testes). Ficam para a homologação.

## Módulo Python → classe Java

| Python (`backend/src/fourqa/`) | Java (`com.fourqa.api`) | Estado |
|---|---|---|
| `domain/formulas.py` | `domain.Formulas` | VALIDADO (vetores) |
| `domain/planning.py`, `distribute.py`, `plan_period.py` | `domain.Planning`, `Distribute`, `PlanPeriod` | VALIDADO |
| `domain/dimensions.py` | `domain.Dimensions` | VALIDADO |
| `domain/status_frente.py`, `report_groups.py`, `graficos.py` | `domain.StatusFrente`, `ReportGroups`, `Graficos` | VALIDADO (golden) |
| `domain/evolucao_qa.py` | `domain.EvolucaoQa`, `services.EvolucaoService` | VALIDADO |
| `domain/dates.py`, `off_days.py`, `validate_sync.py` | `domain.Dates`, `OffDays`, `ValidateSync` | VALIDADO |
| `services/report_service.py`, `planning_service.py` | `services.ReportService`, `PlanningService` | VALIDADO (golden) |
| `services/sync_job.py`, `sync_service.py` | `services.SyncJob`, `SyncService` | VALIDADO (cliente simulado) |
| `azure/*` | `azure.*` (`AzureClient`, `AzureDataRefresh`, `Execucoes`, `Falhas`, `Kpis`, `Report`, `SyncConfig`, `InMemoryAzureCache`) | VALIDADO sem Azure ao vivo |
| `db/*`, `persistence/*` | `persistence.*` (`Database`, `Migrations`, `Jdbc*Store`, `PlanKeys`, `MetaScope`, `OperationalProvider`) | VALIDADO em SQLite; Postgres pendente |
| `auth/*` | `auth.*` (`Session`, `Crypto`, `Entra`, `AdoIdentity`, `Roles`, `Access`, `WriteAuth`, `RequestIdentity`) | VALIDADO |
| `api/routes.py`, `http/*` | `web.ApiController`, `Json`, `HttpInputs`, `Requests`, `ApiExceptionHandler` | VALIDADO (golden) |
| `api/identity_routes.py` | `web.IdentityController`, `IdentityFilter` | VALIDADO |
| `api/app.py` (CORS, SPA, headers) | `web.WebConfig`, `IdentityFilter`, `FourQaApplication` | VALIDADO |

## Teste pytest → JUnit

| pytest (removido) | JUnit (`backend/src/test/java/com/fourqa/api/`) |
|---|---|
| `test_formulas_parity.py` | `domain/FormulasParityTest` |
| `test_distribute.py`, `test_dimensions.py`, `test_evolucao_qa.py`, `test_status_frente.py` | `domain/DomainPortsTest`, `services/ReportPortsTest` |
| `test_plan_key.py`, `test_operational_provider.py`, `test_pg_pool.py` | `persistence/PersistencePortsTest` |
| `test_write_auth.py` | `auth/AuthUnitTest` |
| `test_write_routes.py`, `test_write_routes_smoke.py`, `test_planning_cell_base.py` | `web/WriteRoutesTest` |
| `test_planning_revision.py` | `web/PlanningRevisionTest` |
| `test_auth_connections.py` | `web/AuthConnectionsTest` |
| `test_entra_login.py` | `web/EntraLoginTest` |
| sync job (dentro de `test_write_routes.py`) | `services/SyncJobTest` |
| `test_deploy_shape.py` | `DeployShapeTest` (rewrite externo, sem Function, árvore SQL única) |

## Divergências encontradas e corrigidas no port

- `backlog`/`aheadOfPlan` do resumo de planejamento: Python devolve `int` 0 só quando negativo, senão `float`; Java seguia sempre `float` (`floatOrZero`).
- Mensagens de data inválida seguem o texto do Python 3.14 (`month must be in 1..12, not N`).
- Respostas HTTP usam JSON compacto sem `ensure_ascii` (igual Starlette); NaN/Inf rejeitados.
- `planKey` repetido na query: vale o último valor (igual Starlette).

## Pendências

- Homologação (autorização de custo, infra e segredos): host Java, `FOURQA_*` no host, rewrite `/api/:path*` da Preview, Postgres real, Azure ao vivo, Entra real, ensaio de rollback.
- `vercel.json`: trocar o destino marcador `https://fourqa-api.invalid` pela URL do host homologado.

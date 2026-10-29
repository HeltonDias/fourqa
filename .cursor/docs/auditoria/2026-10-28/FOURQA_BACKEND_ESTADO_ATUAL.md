# FourQA — estado atual do backend

**Auditoria:** 2026-10-28. Somente leitura. Nenhum código de produto foi alterado.

**Alvo dos percentuais:** API operacional Node/Express em `backend/`, empacotada por `api/index.mjs`. Java em `backend-java/` é código local, fora do pacote Vercel. Não há `.csproj` nem `.sln`. ASP.NET Core não está no repositório (`DEC-032`, `.cursor/docs/NET-DOTNET-REMOVAL.md`).

**Hierarquia usada:** código e testes desta sessão, contratos HTTP, decisões/ADR, requisitos v1.2, auditoria histórica por último. `ARCHITECTURE.md` (20/10/2026) ainda descreve a fundação Java como só `GET /api/health`. O working tree Java já tem controllers de Report, Planejamento, Sync e snapshot. Essa frase da arquitetura está desatualizada. O Java continua não operacional: a Vercel não o publica.

**Pareceres:** [impact-analyst](c7714add-0c0a-4954-a96e-20efe5a72fda) e [qa-verifier](604f4501-8e21-4c36-a57f-727334df5bd3). Afirmações abaixo foram conferidas no código. O verifier não executou testes. O Maestro executou a suíte Node (ver Testes).

## 1. Arquitetura real

Monorepo npm. Backend TypeScript, Express 5, entrada HTTP `backend/src/app.ts` e rotas `backend/src/routes/api.ts` montadas em `/api`.

| Camada | Caminho | Papel |
|---|---|---|
| HTTP | `backend/src/routes/api.ts`, `backend/src/http/writeAuth.ts` | Rotas, bearer, 409 de planejamento |
| Serviços | `backend/src/services/reportService.ts`, `planningService.ts`, `syncService.ts`, `syncJob.ts` | Report, planejamento, sync |
| Domínio | `backend/src/domain/formulas.ts`, `dimensions.ts`, `planning.ts`, `distribute.ts`, `statusFrente.ts`, `evolucaoStatus.ts` | Fórmulas, hierarquia, curva, status |
| Persistência | `backend/src/persistence/`, `backend/src/db/postgres/`, `backend/src/db/sqlite*` | Contratos, Postgres operacional, SQLite de teste/legado |
| Azure | `backend/src/azure/client.ts`, `execucoes.ts`, `falhas.ts`, `config.ts`, cache em `azureDataCache.ts` / `azureCacheReadSource.ts` | Leitura REST. PAT só por ambiente |

PostgreSQL é o banco operacional (`DEC-T01`). SQLite sustenta testes (`forceSqlite` no script `npm test`) e importação histórica.

Java local (não publicado): Spring Boot, pacote `com.fourqa.api`. Controllers conferidos: `HealthController` (`/api/health`, `/api/health/ready`), `ReportController` (`/api/meta`, `/api/home`, `/api/status-frente`, `PUT /api/cabecalho`, `PUT /api/periodo`), `PlanningController` (`GET/POST/PUT` de planejamento, inclusive lote), `SnapshotController` (`/api/execucoes`, `/api/falhas`), `SyncController` (`GET /api/sync/status`, `POST /api/sync`). Não há, no Java lido, `PUT /api/planejamento/distribuir` nem `GET/PUT /api/sync/config`.

## 2. Endpoints Node

Prefixo `/api`. Escrita: `requireWriteAuth` → `decideWriteAuth`. Token `FOURQA_API_TOKEN`, comparação com `timingSafeEqual`. Na Vercel, `openWritesAllowed` é sempre falso. Sem token configurado: 503. Bearer inválido: 401. Leitura protegida só quando o processo está na Vercel e `FOURQA_PROTECT_READS` não é `0`; `/health` fica de fora. Fora da Vercel a leitura fica aberta. Isso é o bearer compartilhado de `DEC-T02`, não o administrador/QA de `DEC-004`.

| Método | Caminho | Escrita |
|---|---|---|
| GET | `/health` | não |
| GET | `/meta`, `/home` | não |
| PUT | `/cabecalho`, `/periodo` | sim |
| GET | `/planejamento`, `/planejamento/alteracoes` | não |
| POST | `/planejamento/revisao` | sim |
| PUT | `/planejamento/celula`, `/planejamento/lote`, `/planejamento/distribuir` | sim |
| GET | `/status-frente` | não |
| POST | `/sync` | sim |
| GET | `/sync/status`, `/sync/config` | não |
| PUT | `/sync/config` | sim |
| GET | `/execucoes`, `/falhas` | não |

`ARCHITECTURE.md` §3.1 não lista `/planejamento/alteracoes`, `/planejamento/lote`, `/planejamento/distribuir` nem `/sync/config`. Essas rotas existem no código atual.

Conflito de agenda: `scheduleFingerprint` em `backend/src/persistence/scheduleFingerprint.ts`. Store Postgres compara a base e a rota responde 409 (`api.ts`). Escrita de revisão/célula exige `planKey` explícito (`DEC-031`). Leituras ainda aceitam fallback.

DTOs principais ficam em `backend/src/types.ts` e no contrato `.cursor/docs/HTTP-CONTRACTS.md`. O frontend consome os mesmos caminhos via `frontend/src/api.ts`.

## 3. Regras de negócio

Test Point é a unidade de execução do snapshot. Test Case, bug e meta de planejamento são populações diferentes.

Classificação única em `classifyExecution` (`formulas.ts`): Passed, N/A (`NotApplicable`), Falha, Bloqueado, Design, Liberado (`Ready`), Não liberado. Sete classes. `metricasDosPontos` conta cada ponto uma vez.

**Report.** `totalRealizadoLinha` = Passed + N/A. Cancelados legados ficam de fora. Pendentes = total − finalizados, no contrato de RPT-003.

**Status e Planejamento.** `finalizadosComCancelados` soma Passed + N/A + `cts_cancelados`. ADR 003 e RPT-003 mandam manter essa diferença. Não unificar sem decisão.

**Impactos.** `classificarImpactosKpi` e responsabilidades de `SYNC_RESPONSABILIDADES`. O rótulo de tela ainda é `% BUGS CLIENTE` (`ReportKpiRow.tsx`). RPT-002 não está implementado. `loadFalhas` pede `System.CreatedBy` e não grava o campo: `FalhaInsert` não tem a coluna (`falhas.ts` por volta da linha 219). `resolveEnvironment` ainda trata a tag `V3Online` como ambiente `V3`, o que `DEC-011` proíbe como prova de ofensor.

**Planejamento.** Tabelas de baseline/revisão/item/alocação. Colunas `responsavel` e `prioridade` na migração 003. Trilha `planning_change_log` na 004. Curva em `distribute.ts`: estratégias `montanha`, `decrescente`, `crescente`, `uniforme`. O comentário do arquivo diz que os pesos são provisórios (`OPEN-008`) e que o único modo aceito é `manter`. Transferir suíte e compartilhar QA não estão nesse modo. `crescente` existe no código embora `DEC-014` diga que crescente não entra agora.

**Evolução QA.** Página `EvolucaoQaPage` só mostra "Em desenvolvimento". Não há metas por QA nem event store. `execucoes` é o último snapshot (`DEC-T04`), não o histórico de runs.

**Hierarquia.** Dimensões configuráveis (`dimensions.ts`, ADR 001). `haSobreposicaoFrentes` marca sobreposição no status (`reportService.ts`).

## 4. Azure, sync, concorrência

`syncService.startSync` / `runSync` leem planos da configuração e chamam `replaceSnapshot`. Testes de `azureCacheConsistency.test.ts` (executados nesta sessão) cobrem: espelho desligado só substitui o snapshot; falha no banco não publica cache; lote em memória substitui o conjunto depois de validar. Isso sustenta parte de INT-052 e INT-053. Não houve sync contra Azure DevOps nesta auditoria.

Idempotência observada no desenho: o snapshot novo substitui execuções/falhas do plano e não apaga o planejamento (`DEC-T03`). Índice `(plan_key, test_point_id)` em `execucoes` não é único no SQL da 001. Duplicidade de ponto no mesmo plano não está impedida por constraint.

Concorrência de célula: fingerprint + HTTP 409 no Postgres. O verifier apontou ausência de teste HTTP que asserta 409 e planKey 400. Esta sessão não achou teste de rota que fixe o corpo 409. `writeRoutes.test.ts` cobre rejeição de escrita sem bearer, e passou.

## 5. Auth, erros, observabilidade

Não há usuário, papel, organização nem Entra ID no Node (`JAVA-IDENTITY.md` é proposta). Link de visitante, revogação e expiração não existem (SEC-068–072, SEC-074, SEC-076).

Isolamento atual é `plan_key` dentro de um Azure por ambiente (SEC-075 parcial). Um PAT e um bearer por deploy.

Erros de planejamento viram 400 ou 409. Ping de Postgres redacta segredo (`ping.test.ts` passou: a mensagem segura não devolve senha nem URL). Não há tracer, alerta nem histórico de falha de sync com ator. `GOV-082` fica parcial por essa redação, não por uma trilha de auditoria.

## 6. Testes desta sessão

Comando: `npm test --prefix backend` (script com `forceSqlite`, lista explícita de arquivos, inclui `postgresReal.integration.test.ts`).

Resultado: **239 passaram, 1 falhou, 0 skipped, 55 suítes, duração ~26,3 s, exit code 1.**

Falha: `backend/src/domain/suiteFillSurface.test.ts` — o teste espera `/Responsável próprio da suíte/` no fonte de `PlanningAcompanhamentoTable.tsx`. O fonte atual tem título "Prioridade própria da suíte, somente leitura nesta visão" e cabeçalho "Responsavel" sem acento. O teste não passou. Não corrigir faz parte desta auditoria.

`postgresReal.integration.test.ts` não entrou como skipped. O próprio arquivo só roda com `TEST_DATABASE_URL` em localhost, banco `fourqa_mig`, e recusa host Supabase. O valor da URL não foi lido. Supabase remoto não foi consultado.

Não executados: `npm run formulas:parity`, `./mvnw verify` em `backend-java/`, sync Azure, migração, browser.

`formulas:parity` compara `formulas.ts` com `backend/shared/formulas-parity-vectors.json`. Esse JSON é gerado pelo próprio Node (`scripts/build-formulas-parity-vectors.mjs`). Verde nesse comando trava o código contra uma cópia dele. Não prova a fórmula contra a planilha. O [qa-verifier](604f4501-8e21-4c36-a57f-727334df5bd3) também notou que `check-formulas-parity.mjs` importa `metricasDosPontos` e não chama, e que o caso de cancelados em `formulas.test.ts` soma um inteiro em `finalizadosComCancelados` sem uma linha legada de cancelado. O percentual validado de RPT-003 continua 2/7 por isso.

`planningProgress.test.ts` existe e **não** entra no script `test` de `backend/package.json`. A suíte desta sessão não o executou.

`validateSync.test.ts` recusa lote vazio e Test Point ou bug duplicado no lote. Isso não cria UNIQUE em `execucoes`. INT-052 segue parcial.

Nenhum teste da suíte chama a rota e afirma HTTP 409, nem `planKey` ausente com bearer válido (400). `planKey.test.ts` cobre a função. `writeRoutes.test.ts` barra a escrita antes do `planKey`. Auth verde não fecha DEC-031 no HTTP. O Java local tem `ModuleHttpTest` com 409 no schema 4 e `SyncEngineTest` de segunda execução. Não rodaram. `HTTP-CONTRACTS.md` ainda marca as dez regras de domínio como "Não iniciado" no Java, e a linha 7 chama o health Java de operacional. O working tree já tem `ExecutionMath` e `PlanKeys`. A matriz desse documento está atrás do código, e o health Java não é a API da Vercel.

Testes que passaram e importam para o contrato: `formulas.test.ts` (partição e Finalizados = Passed + N/A), `distribute.test.ts` (soma inteira, pico da montanha, decrescente), `writeAuth.test.ts`, `planKey.test.ts`, `syncJob.test.ts`, `azureCacheConsistency.test.ts`, `casePriority.test.ts`, `postgresMigrate.test.ts`, `schemaAudit.test.ts`, `deployShape.test.ts`.

Frontend: nenhum `*.test.tsx` / `*.spec.tsx`. E2E inexistente no repo lido.

Java: testes existem (`FormulaParityTest`, `ModuleHttpTest`, `SyncEngineTest`, outros). Não rodaram nesta sessão. Não entram no percentual validado operacional.

## 7. Requisitos no backend (alvo Node)

Metodologia na matriz geral. Média simples dos percentuais de requisito, não soma ponderada por critério.

| Área | Requisitos | Implementado (média) | Validado (média) |
|---|---|---|---|
| Report RPT-001–009 | 9 | 36% | 12% |
| Planejamento PLN-001–019 | 19 | 34% | 14% |
| Evolução EQA-001–010 | 10 | 0% | 0% |
| Operação OPR-044–051 | 8 | 46% | 17% |
| Integração INT-052–061 | 10 | 30% | 13% |
| Identidade SEC-068–077 | 10 | 13% | 10% |
| Governança GOV-078–083 | 6 | 28% | 11% |
| Nativo NAT/BUG | 14 | 0% | 0% |

Nenhum requisito de backend está em 100% implementado e 100% validado.

O que o código sustenta de ponta a ponta no Node: fórmulas do Report, snapshot Azure substituível, planejamento com revisão, célula, responsável/prioridade de suíte, curva Montanha/Decrescente no modo manter, status por frente, listagem paginada de execuções e falhas, bearer de escrita.

O que falta no Node para os requisitos já aprovados e não adiados: KPI configurável, rótulo Impacto do Cliente, Evolução QA, modos transferir/compartilhar, papéis, multiempresa, Created By persistido, explicação de divergência Status×Report na interface, conectores que não sejam Azure, gestão nativa de caso e bug.

## 8. Débitos e riscos

1. Documentos `ARCHITECTURE.md` e `AGENTS.md` atrasados em relação ao Java local e a rotas Node novas. Quem ler só a arquitetura subestima o código e ainda pode achar que o Java é só health.
2. `distribute.ts` inclui `crescente`, fora de `DEC-014`. Pesos marcados como provisórios (`OPEN-008`).
3. `System.CreatedBy` é pedido e descartado. `DEC-021` / OPR-049 continuam abertos.
4. Tag `V3Online` ainda vira ambiente. Conflita com `DEC-011`.
5. Sem UNIQUE de Test Point por plano. INT-052 não está fechado por constraint.
6. Bearer único e leitura aberta fora da Vercel. SEC-069/070 não estão atendidos.
7. Suíte oficial vermelha nesta sessão por um teste de superfície de UI. CI (`.github/workflows/ci.yml`) roda `npm test` e falharia no mesmo ponto se o fonte estiver igual.
8. Java local pode divergir do Node (sem distribuir e sem sync/config). Tratar os dois como a mesma API seria erro.

## 9. Critério para considerar o backend da fase atual concluído

Fora NAT/BUG e itens marcados adiados no requisito: cada critério de aceite de RPT, PLN, EQA, OPR e INT com evidência de código e teste verde na suíte, sync de laboratório sem PAT de produção, 409 e planKey cobertos por teste HTTP, e `formulas:parity` executado com exit 0. Isso não foi atingido em 2026-10-28.

# FourQA — estado atual do banco

**Auditoria:** 2026-10-28. Somente leitura do repositório. **Nenhuma sessão foi aberta no Supabase.** Esquema abaixo é o declarado nas migrações e nos stores. Esquema efetivo do banco remoto está **não confirmado**.

**Não lido:** `.env`, connection string, PAT. Nomes de variáveis só a partir de `.env.example`.

## 1. Arquitetura declarada

Postgres é o operacional (`DEC-T01`). O pool trata host `*.supabase.co`, `*.supabase.com` e `*.pooler.supabase.com` como Supabase (`backend/src/db/postgres/pool.ts`). SQLite (`data/fourqa.db` ou legado) serve a teste e importação (`sqliteBackup.ts`, `importFromSqlite.ts`).

Há duas funções distintas em `backend/src/db/postgres/migrate.ts`. `migratePostgres` aplica 001–004 em ordem, só quando alguém a chama (`backend/src/db/postgres/cli.ts` ou o import SQLite). O boot da API **não** a chama: `operationalProvider.ts`, o servidor e `app.ts` não referenciam `migratePostgres` (`operationalProvider.test.ts` e `deployShape.test.ts` afirmam essa ausência e passaram na suíte). O boot só roda `assertPostgresSchema`, que aceita a versão atual **ou a anterior** (3 ou 4). Subir a API não cria `planning_change_log`. Se essa tabela já existir com colunas diferentes, `migratePostgres` bloqueia a 004. Se há tabelas FourQA sem `schema_migrations`, recusa aplicar a 001 por cima. `HTTP-CONTRACTS.md` (cabeçalho) diz que a 004 não foi aplicada. Esta auditoria não consultou o banco para confirmar.

`postgresReal.integration.test.ts` só roda com `TEST_DATABASE_URL` em `127.0.0.1` ou `localhost`, banco `fourqa_mig`, e aborta se o host contiver "supabase". Nesta sessão a suíte Node não marcou esse arquivo como skipped (239 pass, 1 fail noutro arquivo). O URL não foi inspecionado. Isso **não** confirma o projeto Supabase de homologação.

## 2. Tabelas declaradas

Fonte: `backend/src/db/postgres/migrations/001_baseline.sql` a `004_planning_change_log.sql`.

### workbook_meta

Chave/valor (`key` PK, `value` text). Cabeçalho, período, metadado de sync, `kpi_impactos:<plan_key>`. Não é tabela de organização.

### planejamento_linhas

Legado da planilha. `row_num` PK. QA, frente, processo, datas, quantidades, `cts_cancelados`. Sem FK.

### execucoes

Snapshot corrente por ponto. `id` identity PK. Colunas de plano, hierarquia (`frente`, `processo`, `suite_path`, `dimensions_json`), Test Point, Test Case, outcome, datas, `run_by`, ids de run/result, link, tags. Índices: `plan_key`, `suite_name`, `(plan_key, test_point_id)`. **Não há UNIQUE** em `(plan_key, test_point_id)`. **Não há** coluna de prioridade do Test Case nem de histórico de transições. `DEC-T04`: último registro, não event store.

### falhas

`id` identity PK. `plan_key`, `responsavel`, `ambiente`, `categoria`, `bug_id`, `impacto`, `frente`, `titulo`, `status`, `criacao`, `fechamento`, `links`, `tags`. Índices: `plan_key`, `frente`. **Não há** `created_by`. O coletor pede `System.CreatedBy` e não persiste.

### planning

`id` identity PK. `plan_key` UNIQUE. `created_at` text.

### planning_revision

FK `planning_id` → `planning(id)`. UNIQUE `(planning_id, version)`. `reason`, `baseline_origin`, `scope_snapshot`.

### planning_item

FK `revision_id` → `planning_revision(id)`. Suíte, datas, `baseline_quantity`. Migração 002 acrescenta `test_point_id`, `test_case_id` e índices únicos parciais: `(revision_id, suite_id)` quando há suíte; `(revision_id, test_point_id)` quando não há suíte e há ponto. Migração 003 acrescenta `responsavel` e `prioridade` (texto, nulo permitido).

### planning_scope_item

FK de revisão. Ids de plano, suíte, Test Point, Test Case, `label`. Índice `(revision_id, test_point_id)` não único.

### planning_allocation

FK `item_id` → `planning_item(id)`. UNIQUE `(item_id, alloc_date)`. Quantidade `double precision`.

### planning_change_log (004)

`id` BIGSERIAL. FK `planning_id` → `planning(id) ON DELETE CASCADE`. `created_at` TIMESTAMPTZ (as outras tabelas usam text). `actor`, `suite_id`, `test_point_id`, `suite_name`, `field`, `alloc_date`, `old_value`, `new_value`. Índice `(planning_id, created_at DESC)`.

### schema_migrations

Criada pelo runner, não pelo SQL 001: `version`, `applied_at`.

## 3. Isolamento por PlanKey

`planning.plan_key` é único. `execucoes.plan_key` e `falhas.plan_key` são texto sem FK para `planning`. Dois módulos podem usar a mesma string e ainda assim não há tenant. `DEC` e a arquitetura avisam: `plan_key` não é organização.

Escrita de revisão e célula no Node exige `planKey` explícito (`DEC-031`). Leitura ainda tem fallback. Não há RLS por plano nas migrações.

## 4. Baseline, revisão, snapshot

Revisão nova não reescreve a linha da versão anterior: são rows com `version`. O critério "v2 não altera v1" é compatível com o modelo. Adoção silenciosa de pontos novos do Azure depende do serviço, não de um trigger.

`replaceSnapshot` troca o lote Azure e deve preservar planejamento (`DEC-T03`). Testes de cache/snapshot em SQLite passaram nesta sessão. O banco remoto não foi observado durante um sync.

Concorrência: `scheduleFingerprint` comparado na gravação Postgres; HTTP 409. Transação de célula está no store. Não há evidência, nesta auditoria, de teste que falhe no meio da distribuição e prove rollback do modal (PLN-017).

## 5. RLS, grants, autenticação

As migrações **não** habilitam RLS nem criam `GRANT`.

Script manual `.cursor/docs/supabase-rls-remediation.sql`, comentário datado 2026-10-15, diz que foi aplicado no Supabase de desenvolvimento (`fourqa-dev`): `REVOKE` de `anon`, `authenticated` e `PUBLIC` nas tabelas da 001–003, e `ENABLE ROW LEVEL SECURITY` nelas. O comentário diz que a role `postgres` tem `bypassrls` e que RLS sem `FORCE` não a bloqueia. **Esta auditoria não reaplicou nem consultou o catálogo.** `planning_change_log` (004) **não está** nesse script. Se a 004 rodou depois, a tabela nova pode ter ficado fora daquele revoke.

Não há policies de linha por usuário. A proteção de dados é a connection string no servidor, não o JWT do Supabase no browser. O frontend não fala com o Postgres.

## 6. Integridade, desempenho, backup

FKs existem só no agregado de planejamento (planning → revision → item/scope/allocation, change_log → planning). Execuções e falhas são soltas. `ON DELETE CASCADE` no change log apaga a trilha se o planning for apagado.

Tipos mistos: quantidades `double precision` para contagens que o domínio trata como inteiros. Datas de negócio em `text`, exceto `planning_change_log.created_at`.

Índices cobrem plano, suíte, ponto e alocação. Não há índice único anti-duplicata de Test Point.

Backup documentado no código: `backend/src/db/sqliteBackup.ts` (`npm run db:backup` no package do backend) copia SQLite e confere integridade. Teste `sqliteBackup.test.ts` passou nesta sessão. Isso não é backup do Postgres/Supabase.

`context/HANDOFF.md` cita um dump histórico `fourqa-supabase-20261015-1503.dump` fora do repo. Arquivo não verificado nesta sessão. Não há runbook de PITR, RPO nem RTO no material lido. Recuperação do Postgres remoto: **não confirmada**.

Importação SQLite → Postgres: `importFromSqlite.ts` e teste passaram na suíte (SQLite forçado / fake, conforme o arquivo de teste). SEC-077 pede migração sem perda entre organizações, que ainda não existem. O import histórico não fecha esse requisito.

## 7. Requisitos cujo núcleo é persistência

| ID | Leitura do SQL/código | Implementado | Validado nesta sessão |
|---|---|---|---|
| PLN-001 | plan_key único e revisões | parcial (3/4) | parcial (testes de planKey; banco remoto não visto) |
| PLN-006 | revisão e change log | parcial | migração testada em fake/local; before/after de KPI não |
| PLN-008 | coluna `responsavel` | parcial | teste de superfície da UI falhou |
| OPR-047 | prioridade de caso | não há coluna em `execucoes` | `casePriority.test.ts` passou no domínio, não no SQL |
| OPR-049 | Created By | coluna ausente | 0 |
| INT-052 | troca de snapshot | parcial, sem UNIQUE | testes de replace passaram |
| INT-053 | lote atômico no store/cache | parcial | testes de cache passaram; remoto não |
| SEC-075 | isolamento por plan_key | parcial, sem tenant | testes de planKey passaram |
| GOV-078 | old/new no change log de planejamento | parcial | não é trilha de todo edit |
| NAT/BUG | tabelas nativas | ausentes | 0 |

Percentuais completos: `FOURQA_MATRIZ_GERAL_REQUISITOS.md`.

## 8. Divergência documento × SQL

`ARCHITECTURE.md` §4 lista as tabelas e diz que `planning_change_log` é nova e vazia, e que o código aceita prefixo 1–3 ou 1–4. `migratePostgres` inclui a 004. O boot da API não o executa. "Vazia" era observação da auditoria de 20/10, não um fato reconsultado no banco em 28/10.

## 9. Critério para considerar o banco da fase atual concluído

Migrações 001–004 aplicadas e lidas de `schema_migrations` no ambiente alvo (comando e resultado registrados, sem expor URL). UNIQUE de ponto por plano se INT-052 assim o exigir após decisão. `planning_change_log` incluída na mesma política de revoke/RLS do restante, se esse script continuar valendo. Backup Postgres com restauração ensaiada. Nenhum desses fatos foi confirmado no servidor em 2026-10-28.

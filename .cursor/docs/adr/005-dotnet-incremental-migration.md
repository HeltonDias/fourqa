# ADR 005 — Migração incremental Node → ASP.NET Core 10

**Status:** Aprovada (direção técnica) — **proposta de supersessão 2026-10-22:** restaurar Node como alvo definitivo; C# permanece no repositório sem gate CI obrigatório (ver `PROP-008` em `DECISIONS.md`). Cutover e remoção da API Node **não** ocorreram.  
**Data:** 2026-10-20  
**Contexto:** `AGENTS.md`; backend operacional em `backend/` (Express); domínio em `backend/src/domain/`.

## Objetivo definitivo (histórico — pré-rollback 2026-10-22)

> **Operacional em 2026-10-22:** API primária permanece Node/Vercel. Supersessão proposta em `PROP-008` (`DECISIONS.md`). O texto abaixo registra a direção aprovada em 2026-10-20, não o runtime atual.

Substituir **integralmente** o backend de API Node.js/Express por **ASP.NET Core 10**. A arquitetura final **não** dependeria de Node para executar a API.

| Fase | Node.js |
|------|---------|
| Transição | API Express em produção; testes de **paridade** contra `backend/src/`; domínio espelhado em `backend/dotnet/` |
| Pós-cutover validado | Remover código e deploy da API Node (`backend/` runtime, funções Vercel Node da API) — **sem exclusão antecipada** |
| Permanente | Toolchain **frontend** (React/Vite/npm) — build e assets; não é runtime da API |

## Decisão

1. **Strangler fig:** Node API permanece até paridade comprovada por fatia. Nenhum corte de tráfego sem autorização explícita.
2. **Código-alvo:** `backend/dotnet/` — Domínio → API → Infra.
3. **Contratos HTTP:** preservar `backend/src/routes/api.ts` e `writeAuth.ts` até cutover.
4. **Regras de negócio:** portar de `backend/src/domain/`; paridade via `backend/shared/formulas-parity-vectors.json` + `npm run formulas:parity` + testes xUnit.
5. **Persistência:** sem migração de banco operacional nesta linha.
6. **Deploy atual:** Vercel Node (`api/index.mjs`) até fatia HTTP .NET validada.

## Hospedagem alvo (homologação)

**Recomendação (2026-10-22):** **Azure App Service Linux** (1 instância, imagem do `backend/dotnet/Dockerfile`, porta `8080`, health `/api/health`). Worker de sync é **in-process** (`SyncWorker`); réplicas >1 exigem fila distribuída (não implementada). Container Apps só se `minReplicas=maxReplicas=1` e mesma restrição.

**Topologia homolog (sem cutover):** SPA no Vercel Preview (inalterado); API C# em URL Azure dedicada; `FRONTEND_ORIGIN` = URL(s) do preview; `FOURQA_API_TOKEN` idêntico ao token do SPA; PostgreSQL **isolado** homolog (migrations via `dotnet … migrate` antes do smoke — API não migra ao subir); rewrite/proxy do preview para a API C# **só** em ambiente de teste (alias oficial permanece Node).

| Item | Status |
|------|--------|
| Artefato Docker + README homolog | **PRONTO** (local) |
| Checklist smoke HTTP (`backend/scripts/dotnet-homolog-smoke.mjs`, US-004) | **PRONTO** |
| Smoke isolado container+PG local (`127.0.0.1:18080`, PG `:55433`) | **EXECUTADO** 2026-10-22 — não equivale homolog operacional |
| Homologação operacional (URL pública API C# + preview SPA isolado) | **BLOQUEADA** — sem App Service/PG Azure autorizado; `subscription_list` vazio; alias oficial Node intacto |
| Sync Azure real em homolog | **BLOQUEADO** (credencial/autorização) |
| Cutover / remoção Node | **BLOQUEADO** (aprovação explícita) |

**Veredito homologação operacional (2026-10-22):** **BLOQUEADA**. Código e prep local maduros; falta ambiente publicado e integração SPA↔API .NET fora da máquina. **NÃO APTA** aplica-se só a defeito crítico de produto — não ao bloqueio de infra.

**Tentativa desbloqueio Azure (2026-10-22):** MCP Azure autenticado; `subscription_list` **vazio**. Azure CLI (`az`) **ausente** na máquina do agente. Sem assinatura visível → deploy interrompido (ADR 005). Próximo passo: habilitar acesso abaixo + autorização explícita única.

## Inventário HTTP (preservar)

| Método | Path | Auth escrita | Notas |
|--------|------|--------------|--------|
| GET | `/api/health` | — | `{ ok, database }` |
| GET | `/api/meta` | leitura protegida Vercel* | período home |
| GET | `/api/home` | * | `planKey` query |
| PUT | `/api/cabecalho` | token / open writes | |
| PUT | `/api/periodo` | token | |
| GET | `/api/planejamento` | * | `version` opcional |
| POST | `/api/planejamento/revisao` | token | |
| PUT | `/api/planejamento/celula` | token | |
| GET | `/api/status-frente` | * | |
| POST | `/api/sync` | token | 202 se started |
| GET | `/api/sync/status` | — | |
| GET | `/api/execucoes` | * | paginação |
| GET | `/api/falhas` | * | paginação |

\* `FOURQA_PROTECT_READS` + `FOURQA_API_TOKEN` no Vercel.

## Ordem de fatias (PRs pequenos)

| Fatia | Entrega | Verificação |
|-------|---------|-------------|
| **1** | `FourQA.Domain` + `formulas.ts` | `formulas:parity` no CI; `dotnet build/test` local/opcional |
| 2 | Demais módulos `domain/` | testes espelhados |
| 3 | `FourQA.Api` + `GET /health` | contrato JSON |
| 4+ | Serviços e rotas por grupo | integração |
| N | Cutover + remoção API Node | smoke homolog + rollback; **após** validação |

## Estado em 2026-10-22

| Frente | Situação |
|--------|----------|
| PlanKey nas escritas de planejamento (DEC-031) | Implementação concluída. Divergência aprovada em relação ao Node, que permanece o rollback. |
| `Escrita_sem_planKey_nao_cria_plano_no_postgres` e `Dois_plan_keys_isolam_revisao_baseline_e_celula` | Executados em PostgreSQL isolado local em 2026-10-22 e aprovados. Hospedagem, cutover e banco operacional continuam pendentes. |
| Integridade dos snapshots da sincronização Azure DevOps (INT-053 / US-053; INT-052 no POST `/api/sync`) | Implementação concluída em 2026-10-22. Lote incompleto, posse obsoleta e falhas de coleta não publicam; publicação íntegra permanece atômica com `jobId` e batimento vigentes. Correção em 2026-10-22: `PublishAsync` passou a enviar `keep` como `text[]` via `Db.TextArray` (antes o Npgsql mandava texto e o `DELETE … ANY($1)` falhava). Os sete testes PostgreSQL de publicação/golden e os demais `PostgresIntegrationTests` + `SyncTests` passaram em banco isolado local (38 aprovados). Frente encerrada na implementação. Node de rollback não muda. |
| Concorrência do Planejamento | Implementação concluída em 2026-10-22. A confirmação relê o cronograma dentro da transação e responde 409 se uma célula mudou depois da cópia. Célula, cabeçalho e período aceitam base opcional (`baseValue`, `baseDate`, `baseQuantity`, `baseTitle`, `baseSubtitle`, `baseInicio`, `baseFim`). Com a base, a gravação divergente responde 409 e não sobrescreve. Sem a base, o contrato anterior permanece: a última gravação vence. O frontend oficial envia a base e, no 409, recarrega sem reenviar. Node de rollback não muda. |
| `Celula_revisao_cabecalho_e_periodo_concorrentes_nao_perdem_gravacao` e os outros `PostgresIntegrationTests` fora de Publish/golden | Executados em PostgreSQL isolado local em 2026-10-22. 11 aprovados, 0 falhas. |
| Hospedagem, cutover e banco operacional | Continuam pendentes. |
| Consolidação homologação/corte (2026-10-22) | **BLOQUEADA** para corte e homologação oficial. Evidência local: `formulas:parity` OK; `dotnet build` Release OK; `dotnet test` Release com PostgreSQL isolado **129/129** (0 ignorados); sem `TEST_DATABASE_URL` **18 ignorados** (não aprovados); `npm test` **210/210**; frontend `typecheck` + `build` OK; `golden.json` sem diff. Falta: hospedagem ASP.NET (OPEN), smoke no alias oficial contra API C#, sync Azure real autorizado, secrets/observabilidade ACA, aprovação explícita de corte. Node permanece rollback. |

## Consequências

- CI (2026-10-22 rollback): gate obrigatório só Node (`typecheck`, `test`, `formulas:parity`, `build`). SDK **10.0.100** e testes xUnit permanecem scripts locais em `backend/dotnet/`.
- Duplicação TS + C# no repositório; sem cutover operacional.
- Credenciais: `delivery.mjs` não usa `shell: true` em `git credential fill`; nunca logar stdout de credential.

## Alternativas rejeitadas

- **Big bang** — um PR com API completa.
- **Manter Node API indefinidamente** — contradiz objetivo definitivo.
- **Só API sem domínio** — viola DEC-008/009 e ADR 002.

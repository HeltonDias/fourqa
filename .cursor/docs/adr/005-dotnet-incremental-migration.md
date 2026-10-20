# ADR 005 — Migração incremental Node → ASP.NET Core 10

**Status:** Aprovada (direção técnica)  
**Data:** 2026-10-20  
**Contexto:** `AGENTS.md`; backend operacional em `backend/` (Express); domínio em `backend/src/domain/`.

## Decisão

1. **Strangler fig:** o backend Node permanece em produção até paridade comprovada por fatia. Nenhum corte de tráfego nem desligamento do Node sem autorização explícita.
2. **Código-alvo:** `backend/dotnet/` — solução .NET com projetos separados (Domínio → API → Infra), alinhados conceitualmente a `backend/src/domain/`, `routes/api.ts`, `persistence/`.
3. **Contratos HTTP:** preservar paths, métodos, códigos de status e JSON de `backend/src/routes/api.ts` e `backend/src/http/writeAuth.ts`. Testes de contrato (golden/fixtures) antes de trocar implementação.
4. **Regras de negócio:** portar a partir de `backend/src/domain/` e testes Node existentes; C# deve reproduzir os mesmos casos (não reescrever fórmulas “de olho”).
5. **Persistência:** PostgreSQL operacional (DEC-T01); SQLite em testes. Adapters .NET espelham stores atuais; **sem** migração de banco operacional nesta linha de trabalho.
6. **Deploy:** fora de escopo até fatia HTTP validada; Vercel continua Node (`api/index.mjs`).

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

\* `FOURQA_PROTECT_READS` + `FOURQA_API_TOKEN` no Vercel (espelhar `writeAuth.ts`).

## Ordem de fatias (PRs pequenos)

| Fatia | Entrega | Verificação |
|-------|---------|-------------|
| **1** (esta) | `FourQA.Domain` + port de `formulas.ts` | `dotnet test` espelha `formulas.test.ts` |
| 2 | Demais módulos puros (`statusFrente`, `reportGroups`, `planPeriod`, …) | testes Node ↔ xUnit |
| 3 | `FourQA.Api` skeleton + `GET /health` | contrato JSON |
| 4+ | Serviços e rotas por grupo (Report, Planejamento, sync, listagens) | testes integração + paridade |
| N | Cutover opcional por rota / host | smoke homolog + rollback |

## Consequências

- CI ganha job `dotnet` (SDK 10.x); gates Node inalterados.
- Duplicação temporária domínio TS + C# até corte aprovado.
- OPEN-010 (multi-tenant) não bloqueia fatia 1; não antecipar tenancy no .NET.

## Alternativas rejeitadas

- **Big bang:** um PR com API completa — risco e revisão inviáveis.
- **Só API sem domínio:** viola DEC-008/009 e ADR 002 antes de provar fórmulas.

# Remoção do backend C# / ASP.NET Core (2026-10-27)

> **Obsolescência de runtime (2026-11-04):** este documento descreve o estado **pós-remoção .NET**, quando a API ainda era Node/Express. A API vigente no working tree é **Python/FastAPI** (`backend/src/fourqa/`, `api/index.py`; `DEC-033` / ADR 007). Manter o texto abaixo como histórico de paridade C#→Node.

**Estado (2026-10-27):** `backend/dotnet/` eliminado do repositório ativo. Naquela data a API operacional era **Node/Express** (`backend/src/`, Vercel `api/index.mjs`). ADR 005 permanece como histórico; supersessão em `DEC-032` e `PROP-008` (adotada).

## O que foi removido

- Solution `FourQA.sln`, `FourQA.Api`, `FourQA.Domain`, testes xUnit, Dockerfile .NET.
- Scripts `dotnet:*`, `backend/scripts/parityGolden.ts`, `backend/scripts/dotnet-homolog-smoke.mjs`.

## Preservado (Node)

- `npm run formulas:parity` e `backend/shared/formulas-parity-vectors.json`.
- Contratos HTTP e domínio em `backend/src/`.

## Pendências de paridade (referência C# removida)

| Tema | Node (referência) | Nota |
|------|-------------------|------|
| DEC-031 `planKey` explícito em escritas | `backend/src/routes/api.ts`, `planKey.ts` | Alinhado |
| HTTP 409 planejamento (`base*`) | Postgres + meta; SQLite dev pode divergir | Validar em homolog Postgres |
| Sync `jobId` / publish obsoleto | `syncJob.ts`, `publishSyncIfOwner` | Sem segundo implementador TS↔C#; reforçar testes Node |
| Paridade API end-to-end (golden) | Perdida com `ParityTests` | Futuro: contratos HTTP no Node ou fundação Java |
| Worker sync in-process / recuperação startup | Era C# `SyncWorker` | Node: modelo durable/Vercel; documentar se portar para Java |

Nenhuma destas pendências alterava o runtime Vercel **da época** (Express). Pós-`DEC-033`, a API vigente é Python/FastAPI.

## Fundação Java *(histórico; removida)*

`backend-java/` foi bootstrap Spring Boot 4.0.5 com `GET /api/health` local; removida no cutover Python (`DEC-033`). Não substituiu o Node nem o Python.

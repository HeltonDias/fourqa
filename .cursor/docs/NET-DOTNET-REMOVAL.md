# Remoção do backend C# / ASP.NET Core (2026-10-27)

**Estado:** `backend/dotnet/` eliminado do repositório ativo. API operacional permanece **Node/Express** (`backend/src/`, Vercel `api/index.mjs`). ADR 005 permanece como histórico; supersessão em `DEC-032` e `PROP-008` (adotada).

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

Nenhuma destas pendências altera runtime Vercel atual (Express).

## Fundação Java (não substitui o Node)

`backend-java/` é bootstrap Spring Boot 4.0.5 (JDK 25, Maven Wrapper 3.9.16) com `GET /api/health` local. Não porta Report, Planejamento, Sync nem contratos HTTP. ADR dedicado ainda não existe. CI: job `java-foundation` no workflow local; execução remota deste estado não ocorreu.

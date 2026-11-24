# ADR 007 — Migração incremental do backend Node.js para Python 3.12+ (FastAPI)

**Status:** Superseded pela ADR 008 (`DEC-041`). Cutover Java local em 2026-11-04: `backend/src/fourqa/`, `api/index.py` e `requirements.txt` removidos. Histórico. Direcionamento original aprovado via `DEC-033`.  
**Data:** 2026-10-29 (texto de plano); nota de cutover no tree: 2026-11-04.  
**Supera:** ADR 006 (Java 25 + Spring Boot como alvo definitivo). ADR 006 permanece histórico após `DEC-033`.  
**Não altera:** ADR 001, 002, 003 e 004.

## Contexto

*(Estado pré-cutover, preservado.)* O FourQA em execução era SPA React/Vite e API Express 5 em TypeScript na Vercel (`api/index.mjs`). PostgreSQL (Supabase) guarda snapshot e planejamento. Azure DevOps é fonte de resultados, somente leitura.

`DEC-032` removeu ASP.NET; `DEC-033` substitui o alvo Java (`backend-java/`) por **um único backend Python** no pacote `backend/`, preservando camadas (`domain`, `services`, `persistence`, `azure`, `http`, rotas) e contratos em `HTTP-CONTRACTS.md`. **Estado atual do código:** ver `ARCHITECTURE.md` e `context/PROJECT_MAP.md`.

## Tecnologias

| Peça | Papel |
|---|---|
| Python 3.12+ | Runtime da API após cutover |
| FastAPI + Pydantic v2 | HTTP e validação |
| uv + pyproject.toml | Dependências e scripts |
| psycopg | PostgreSQL operacional |
| httpx | Azure DevOps REST |
| pytest + pyright | Testes e tipagem |
| Vercel Python Function | `/api` no mesmo projeto que o SPA |

## Estratégia

1. Branch isolada até paridade; **um PR de cutover** remove TypeScript de `backend/` e `api/index.mjs`.
2. Node permanece oráculo de comportamento **até** o merge; sem dual-write em Postgres compartilhado.
3. Contratos HTTP: `HTTP-CONTRACTS.md`; não redefinir métricas.
4. Fórmulas: `backend/shared/formulas-parity-vectors.json` + gate `formulas:parity` na implementação Python.
5. Migrações SQL em `backend/src/db/postgres/migrations/` reutilizadas sem remodelagem por linguagem.
6. Rollback: redeploy deployment Vercel Node anterior; alias manual (`DEC-027`); schema inalterado.
7. Nenhum cutover em Production (`--prod`) sem autorização.

## Infraestrutura alvo

**Vercel unificado:** SPA em `frontend/dist` + função Python em `/api` (mesma origem, Vercel Authentication + `FOURQA_API_TOKEN`).

## Persistência

PostgreSQL operacional; SQLite apenas testes locais. Um escritor por plano; HTTP 409 quando aplicável (`DEC-031`).

## Validação

`pytest` no backend Python, `formulas:parity`, `npm run typecheck` (frontend), `npm run build`, `npm run agent:gates` após atualização dos gates.

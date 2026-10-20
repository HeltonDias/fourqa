# ADR 005 — Migração incremental Node → ASP.NET Core 10

**Status:** Aprovada (direção técnica)  
**Data:** 2026-10-20  
**Contexto:** `AGENTS.md`; backend operacional em `backend/` (Express); domínio em `backend/src/domain/`.

## Objetivo definitivo

Substituir **integralmente** o backend de API Node.js/Express por **ASP.NET Core 10**. A arquitetura final **não** depende de Node para executar a API.

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

## Hospedagem alvo (pendente)

**Candidata:** Azure Container Apps para API HTTP e worker de sync (escala, containers, mesmo ecossistema Azure DevOps).

**Status:** `OPEN` — avaliação formal (custo, rede, segredos, identidade) **antes** de qualquer deployment .NET. Não bloqueia fatias de domínio.

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
| **1** | `FourQA.Domain` + `formulas.ts` | `dotnet build/test` CI + `formulas:parity` |
| 2 | Demais módulos `domain/` | testes espelhados |
| 3 | `FourQA.Api` + `GET /health` | contrato JSON |
| 4+ | Serviços e rotas por grupo | integração |
| N | Cutover + remoção API Node | smoke homolog + rollback; **após** validação |

## Consequências

- CI: job `dotnet` com SDK **10.0.100** (estável; sem .NET 9 ou preview).
- Duplicação temporária TS + C# até corte.
- Credenciais: `delivery.mjs` não usa `shell: true` em `git credential fill`; nunca logar stdout de credential.

## Alternativas rejeitadas

- **Big bang** — um PR com API completa.
- **Manter Node API indefinidamente** — contradiz objetivo definitivo.
- **Só API sem domínio** — viola DEC-008/009 e ADR 002.

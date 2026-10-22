# FourQA — instruções para agentes (Cursor / Cloud)

Monorepo **Node 22**: API Express + SPA React/Vite. Planejamento de produto e requisitos ficam em `.cursor/docs/`; regras obrigatórias em `.cursor/rules/` (não repetir aqui).

## Executor

O **agente principal** no Cursor (incl. Cloud Agent) é o Maestro: implementa, testa e abre PR. Não criar orquestrador paralelo. Essencial em `.cursor/rules/00-maestro.mdc`; procedimento em `.cursor/skills/maestro-orchestration/SKILL.md`. Os gates abaixo continuam obrigatórios quando houver código de produto. **Backend primário:** API Node/Express em `backend/` (Vercel `api/index.mjs`). Código em `backend/dotnet/` é experimental/arquivo — sem job obrigatório no CI até decisão contrária.

| Quando | Quem |
|--------|------|
| Mudança cross-module (domínio, persistência, Azure, contrato HTTP) | Delegar **uma vez** `impact-analyst` (`.cursor/agents/impact-analyst.md`) antes de codar |
| Após mudança de risco (fórmulas, sync, auth, migração) | Delegar **uma vez** `qa-verifier` (`.cursor/agents/qa-verifier.md`) ou rodar os mesmos checks localmente |
| Loop não assistido de feature/bug (BMAD) | `bmad-build-auto` — exige `_bmad/` e `uv` no ambiente |
| Ajuste local óbvio | Agente principal direto; sem delegação cerimonial |

`regras` e skills de party/brainstorm são **opcionais**; não usar por padrão.

## Protocolo determinístico (todo pedido, inclusive pelo celular)

Detalhes: `.cursor/docs/AGENT_PROTOCOL.md`. Estado vivo: `.cursor/agent-run.json` (não commitar). Histórico: `.cursor/docs/CHANGE_LEDGER.jsonl`.

1. **RECEBIDO** — interpretar pedido; localizar `US-…` / `RPT-…`, trecho em `REQUIREMENTS.md`, ADR e `OPEN-…` em `DECISIONS.md`.
2. **CONTEXTO_VALIDADO** — consultar ledger, código e testes; não confiar só em texto/markdown.
3. **EXISTENCIA_VERIFICADA** — classificar cada critério: `JA_IMPLEMENTADO` | `PARCIAL` | `PENDENTE` com evidência (símbolo/teste/rota). Se tudo já implementado → registrar no ledger e **encerrar sem PR**.
4. **ESCOPO_DEFINIDO** → **IMPLEMENTADO** — branch isolada; só o gap; `git status --short` antes de editar.
5. **TESTADO** — `npm run agent:gates` (grava evidência; falha → autocorreção, máx. 2 tentativas por assinatura).
6. **REVISADO** — `impact-analyst` / `qa-verifier` quando aplicável.
7. **ENTREGA_VERIFICADA** — `npm run agent:delivery-verify` (PR real + checks remotos quando credencial existir).
8. **REGISTRADO** — append no `CHANGE_LEDGER.jsonl`; `npm run agent:ledger:validate`.

Hook `stop` (`.cursor/hooks.json`) executa `npm run agent:verify` via script; encerramento sem evidência dispara continuação automática.

**Não** declarar sucesso por commit/push/build isolados.

Pedir aprovação humana só para: ambiguidade de negócio, destrutivo, permissões, custos, segredos, produção (`--prod`), deploy, banco remoto, mudança de semântica Report/Planejamento.

## Onde ler (busca por ID — não carregar arquivos inteiros)

| Necessidade | Fonte |
|-------------|--------|
| Índice | `.cursor/docs/INDEX.md` |
| Fluxo detalhado + Cloud | `.cursor/docs/AGENT_WORKFLOW.md` |
| Arquitetura produto | `.cursor/docs/ARCHITECTURE.md` |
| Mapa de código | `context/PROJECT_MAP.md` |
| Domínio backend | `.cursor/rules/10-backend-domain.mdc` |
| Frontend | `.cursor/rules/20-frontend.mdc` |

Explorar código: preferir `graphify query` se `graphify-out/graph.json` existir; senão busca no repo.

## Comandos

```bash
npm install
npm run typecheck
npm test              # produto (backend)
npm run test:agents   # smoke BMAD / _bmad
npm run build
npm run dev           # API :3001 + Vite :5173
```

Preview oficial (alias manual após validação): `https://fourqa-homolog-heltonmarques-8008.vercel.app` — ver `.cursor/docs/vercel.md`. Nunca `vercel deploy --prod` sem autorização.

## Segurança

Não ler `.env`, PAT, dumps ou planilhas `fonte/**/*.xlsx` sem necessidade. Não commitar segredos. Não alterar dados de produção neste fluxo.

## Backend e migração C#

**Estado operacional (2026-10-22):** Node permanece implementação principal; alias de homologação e deploy Vercel usam só a API Express. Rollback master em curso na branch `rollback/node-primary-master` (proposta de abandono da migração C# como alvo — ver ADR 005 e `PROP-008` em `DECISIONS.md`).

Scripts locais opcionais: `npm run dotnet:build`, `dotnet:test`, `dotnet:parity-golden`, `formulas:parity` (TS↔C#). **Contratos aprovados no Node:** fórmulas/Test Points em `backend/src/domain/`; leituras com fallback de PlanKey. **Planejamento (Node/Postgres):** escritas `revisao`/`celula` exigem `planKey` explícito (DEC-031); HTTP 409 com `base*` quando `DB_PROVIDER=postgres`. **Sync (Node/Postgres):** `ensureSyncPublishable` (filtro, MaxSuites, plano ausente, coleta parcial) + publicação atômica com `jobId`. **Meta (Postgres):** `base*` obrigatório em cabeçalho/período; frontend envia e trata 409.

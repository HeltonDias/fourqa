# FourQA — instruções para agentes (Cursor / Cloud)

Monorepo **Node 22** (frontend/tooling) + **Python 3.12+** (API): FastAPI em `backend/src/fourqa/` + SPA React/Vite. Planejamento de produto e requisitos ficam em `.cursor/docs/`; regras obrigatórias em `.cursor/rules/` (não repetir aqui).

## Executor

O **agente principal** no Cursor (incl. Cloud Agent) é o Maestro: implementa, testa e abre PR. Não criar orquestrador paralelo. Essencial em `.cursor/rules/00-maestro.mdc`; procedimento em `.cursor/skills/maestro-orchestration/SKILL.md`. Os gates abaixo continuam obrigatórios quando houver código de produto. **Backend primário:** API Python/FastAPI em `backend/src/fourqa/` (Vercel `api/index.py`). Migração ASP.NET Core removida (`DEC-032`); alvo Java superseded (`DEC-033`, ADR 007).

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

## Backend (Python)

**Operacional:** FastAPI + Vercel (`api/index.py`). **Removido:** `backend/dotnet/` (`DEC-032`), `backend-java/` (`DEC-033`).

**Gates de domínio:** `npm run formulas:parity` valida `fourqa/domain/formulas.py` contra `backend/shared/formulas-parity-vectors.json`. **Contratos:** leituras com fallback de PlanKey; escritas `revisao`/`celula` exigem `planKey` explícito (DEC-031); HTTP 409 quando `DB_PROVIDER=postgres`.

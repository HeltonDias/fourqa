# FourQA — instruções para agentes (Cursor / Cloud)

Monorepo **Node 22** (frontend/tooling) + **Java 25** (API): Spring Boot 4 + Maven em `backend/` + SPA React/Vite. Planejamento de produto e requisitos ficam em `.cursor/docs/`; regras obrigatórias em `.cursor/rules/` (não repetir aqui).

## Executor

O **agente principal** no Cursor (incl. Cloud Agent) é o Maestro: implementa, testa e abre PR. Não criar orquestrador paralelo. Essencial em `.cursor/rules/00-maestro.mdc`; procedimento em `.cursor/skills/maestro-orchestration/SKILL.md`. Os gates abaixo continuam obrigatórios quando houver código de produto. **Backend:** API Java 25 + Spring Boot 4 + Maven em `backend/` (`DEC-041`, ADR 008), servida por host separado; a Vercel serve o SPA e faz rewrite de `/api/*`. Python/FastAPI removido no cutover; ASP.NET Core removido (`DEC-032`). Homologação do host Java pendente de autorização.

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
npm test              # produto: backend ./mvnw verify (JDK 25) + frontend
npm run test:agents   # smoke BMAD / _bmad
npm run build
npm run dev           # API :3001 + Vite :5173
```

Preview oficial (alias manual após validação): `https://fourqa-homolog-heltonmarques-8008.vercel.app` — ver `.cursor/docs/vercel.md`. Nunca `vercel deploy --prod` sem autorização.

## Segurança

Não ler `.env`, PAT, dumps ou planilhas `fonte/**/*.xlsx` sem necessidade. Não commitar segredos. Não alterar dados de produção neste fluxo.

## Backend (Java)

**Operacional:** Spring Boot 4 em `backend/` (`DEC-041`, ADR 008, `DEC-042`; paridade com o Python removido em `.cursor/docs/JAVA-PARITY.md`). Host Java com `FOURQA_HOSTED=1` e `DB_PROVIDER=postgres`. **Removidos:** Python/FastAPI (cutover 2026-11-04), `backend/dotnet/` (`DEC-032`).

**Gates de domínio:** `npm run formulas:parity` roda `FormulasParityTest` contra `backend/shared/formulas-parity-vectors.json`. **Contratos:** leituras com fallback de PlanKey; escritas `revisao`/`celula` exigem `planKey` explícito (DEC-031); HTTP 409 quando `DB_PROVIDER=postgres`.

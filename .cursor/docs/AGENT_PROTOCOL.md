# Protocolo determinístico de execução (agentes)

Máquina de estados obrigatória para tarefas de implementação (incl. Cloud Agent):

`RECEBIDO` → `CONTEXTO_VALIDADO` → `EXISTENCIA_VERIFICADA` → `ESCOPO_DEFINIDO` → `IMPLEMENTADO` → `TESTADO` → `REVISADO` → `ENTREGA_VERIFICADA` → `REGISTRADO`

Estados terminais: `REGISTRADO`, `BLOQUEADO`.

## Artefatos versionados

| Artefato | Função |
|----------|--------|
| `.cursor/agent-run.json` | Estado da tarefa atual (gitignored; não commitar) |
| `.cursor/docs/CHANGE_LEDGER.jsonl` | Histórico estruturado de entregas |
| `scripts/agent-protocol-cli.mjs` | CLI do protocolo |
| `scripts/agent-protocol-selftest.mjs` | Cenários A–G |
| `.cursor/hooks.json` + `hooks/verify-agent-stop.mjs` | Bloqueio de encerramento falso |

## Classificação de escopo (antes de codar)

Para cada critério de aceite: `JA_IMPLEMENTADO` | `PARCIAL` | `PENDENTE`, com **evidência** (teste, rota, símbolo — não texto solto).

- Tudo `JA_IMPLEMENTADO` → `code_changes_required: false`, registrar no ledger, **sem PR**.
- `PARCIAL` / `PENDENTE` → implementar só o gap, depois gates e entrega.

## Gates executáveis

```bash
npm run agent:gates          # grava evidência em agent-run.json
npm run agent:delivery-verify
npm run agent:ledger:validate
npm run agent:verify
```

Gates finais obrigatórios (com código): `typecheck`, `test`, `build`, `test:agents`.

## Autocorreção

Falha → registrar `failure_retries` (máx. 2 por assinatura) → classificar causa → corrigir camada mínima → reexecutar gates afetados.

Assinatura esgotada → `BLOQUEADO` com evidência.

## Backend Java (`backend/`)

API: Java 25 + Spring Boot 4 + Maven (`DEC-041`, ADR 008), host separado com rewrite `/api` da Vercel. Gates de produto: `typecheck` (frontend), `npm test` (`./mvnw verify` via `scripts/mvnw.mjs` + teste do frontend; exige JDK 25), `formulas:parity` (`FormulasParityTest`), `build`. Node 22 é tooling/SPA — **não** runtime da API. Python/FastAPI (`api/index.py`) e Express/`api/index.mjs` estão **ausentes** do working tree (históricos).

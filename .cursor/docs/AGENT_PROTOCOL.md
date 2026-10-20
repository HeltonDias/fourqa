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

## Classificação N0–N3 (orquestração adaptativa)

| Nível | Gatilhos típicos | Contexto | Delegação |
|-------|------------------|----------|-----------|
| N0 | Critérios já comprovados no código | Ledger-tail + testes pontuais | Nenhuma |
| N1 | Alteração localizada | `AGENTS.md` + arquivos tocados | Nenhuma |
| N2 | Cross-module | + ADR/requisito por ID | `impact-analyst` 1× |
| N3 | Fórmula, DB, auth, contrato `/api`, .NET | + `ARCHITECTURE` seletivo | + `qa-verifier` 1× |

`npm run agent:classify -- [--cross 1|--formula 1|--persistence 1|--security 1|--api 1|--dotnet 1|--already 1]`

## Contexto seletivo

- Ledger: `npm run agent:ledger:tail -- --limit 5` — não ler JSONL inteiro.
- Requisitos: busca por ID (`US-`, `RPT-`, `OPEN-`).
- Reutilizar evidências em `agent-run.json` na mesma execução.

## Gates executáveis (progressivos)

| Fase | Comando | Escopo |
|------|---------|--------|
| Iteração | `npm run agent:gates -- --phase iterate` | Barato por tier |
| Release / PR | `npm run agent:gates` | Sempre CI completo: `typecheck`, `test`, `build`, `test_agents` |

```bash
npm run agent:delivery-verify
npm run agent:ledger:validate
npm run agent:verify
```

## Eficiência

`efficiency` em `agent-run.json`: subagentes, recuperações, runs iterate/release. Tokens só se `CURSOR_USAGE_TOTAL_TOKENS` / `CURSOR_SESSION_TOKENS` existir.

## Autocorreção

Falha → registrar `failure_retries` (máx. 2 por assinatura) → classificar causa → corrigir camada mínima → reexecutar gates afetados.

Assinatura esgotada → `BLOQUEADO` com evidência.

## Futuro ASP.NET Core 10

Módulo `dotnet` reservado em `scripts/lib/agent-protocol/module-gates.mjs` (placeholder): `typecheck`/`test`/`build` por workspace sem alterar gates Node atuais.

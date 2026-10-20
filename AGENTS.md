# FourQA — instruções para agentes (Cursor / Cloud)

Monorepo **Node 22**: API Express + SPA React/Vite. Planejamento de produto e requisitos ficam em `.cursor/docs/`; regras obrigatórias em `.cursor/rules/` (não repetir aqui).

## Intent-to-Delivery (todo pedido, inclusive celular)

O usuário envia **intenção em linguagem natural** — sem spec técnica, sem escolher agente. O Cursor interpreta, planeja, implementa, testa e entrega.

```bash
npm run agent:intent -- --message "seu pedido informal"        # plano JSON
npm run agent:intent -- --message "..." --init                 # + agent-run.json
```

Antes de codar: critérios de aceite verificáveis, contexto seletivo, `EXISTENCIA_VERIFICADA`, tier N0–N3, fatias pequenas, aprovação humana só se negócio/segurança/produção/custo. Pedido vago → investigar primeiro. Redundante → não duplicar código. Regras: `.cursor/rules/03-intent-to-delivery.mdc`.

## Executor

O **agente principal** no Cursor (incl. Cloud Agent) implementa, testa e abre PR. Não criar orquestrador paralelo.

Classifique **antes** de codar (`npm run agent:classify -- --cross 1` etc.). Detalhes: `.cursor/docs/AGENT_PROTOCOL.md`.

| Nível | Quando | Delegação |
|-------|--------|-----------|
| **N0** | Já implementado (evidência em código/teste) | Nenhuma; sem PR |
| **N1** | Alteração localizada | Agente principal só |
| **N2** | Cross-module / risco moderado | **Uma vez** `impact-analyst` |
| **N3** | Fórmula, persistência, segurança, contrato HTTP, .NET | `impact-analyst` + `qa-verifier` |

BMAD (`bmad-build-auto`) só se workflow BMAD for necessário — não padrão.

`regras` e skills de party/brainstorm são **opcionais**; não usar por padrão.

## Protocolo determinístico (todo pedido, inclusive pelo celular)

Detalhes: `.cursor/docs/AGENT_PROTOCOL.md`. Estado vivo: `.cursor/agent-run.json` (não commitar). Histórico: `.cursor/docs/CHANGE_LEDGER.jsonl`.

1. **RECEBIDO** — Intent-to-Delivery: `agent:intent` ou interpretação equivalente; localizar `US-…` / `RPT-…`, trecho em `REQUIREMENTS.md`, ADR e `OPEN-…` em `DECISIONS.md`.
2. **CONTEXTO_VALIDADO** — `npm run agent:ledger:validate`; histórico seletivo via `ledger-tail` (CLI); código/testes por busca direcionada — **não** carregar `REQUIREMENTS.md` inteiro nem ledger completo.
3. **EXISTENCIA_VERIFICADA** — classificar cada critério: `JA_IMPLEMENTADO` | `PARCIAL` | `PENDENTE` com evidência (símbolo/teste/rota). Se tudo já implementado → registrar no ledger e **encerrar sem PR**.
4. **ESCOPO_DEFINIDO** → **IMPLEMENTADO** — branch isolada; só o gap; `git status --short` antes de editar.
5. **TESTADO** — iteração: `npm run agent:gates -- --phase iterate`; antes do PR: `npm run agent:gates` (release = CI completo). Falha → autocorreção localizada, máx. 2 tentativas por assinatura.
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
npm run test:agents   # smoke BMAD + selftests protocolo
npm run agent:classify
npm run agent:gates -- --phase iterate   # durante implementação
npm run agent:gates                      # release (obrigatório no PR)
npm run build
npm run dev           # API :3001 + Vite :5173
```

Preview oficial (alias manual após validação): `https://fourqa-homolog-heltonmarques-8008.vercel.app` — ver `.cursor/docs/vercel.md`. Nunca `vercel deploy --prod` sem autorização.

## Segurança

Não ler `.env`, PAT, dumps ou planilhas `fonte/**/*.xlsx` sem necessidade. Não commitar segredos. Não alterar dados de produção neste fluxo.

## Próxima onda

Migração incremental para **ASP.NET Core 10** usará o mesmo protocolo; paridade de contratos `/api/*` e domínio (`backend/src/domain/`) antes de cortar Node.

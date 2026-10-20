# FourQA — instruções para agentes (Cursor / Cloud)

Monorepo **Node 22**: API Express + SPA React/Vite. Planejamento de produto e requisitos ficam em `.cursor/docs/`; regras obrigatórias em `.cursor/rules/` (não repetir aqui).

## Executor

O **agente principal** no Cursor (incl. Cloud Agent) implementa, testa e abre PR. Não criar orquestrador paralelo.

| Quando | Quem |
|--------|------|
| Mudança cross-module (domínio, persistência, Azure, contrato HTTP) | Delegar **uma vez** `impact-analyst` (`.cursor/agents/impact-analyst.md`) antes de codar |
| Após mudança de risco (fórmulas, sync, auth, migração) | Delegar **uma vez** `qa-verifier` (`.cursor/agents/qa-verifier.md`) ou rodar os mesmos checks localmente |
| Loop não assistido de feature/bug (BMAD) | `bmad-build-auto` — exige `_bmad/` e `uv` no ambiente |
| Ajuste local óbvio | Agente principal direto; sem delegação cerimonial |

`regras` e skills de party/brainstorm são **opcionais**; não usar por padrão.

## Protocolo (todo pedido, inclusive pelo celular)

1. Interpretar pedido informal → localizar `US-…` / `RPT-…` em `.cursor/docs/BACKLOG.md` e trecho em `REQUIREMENTS.md`; ADR em `.cursor/docs/adr/` se cruzar módulos; `DECISIONS.md` se houver `OPEN-…`.
2. Escrever escopo + critérios de aceite verificáveis (bullets testáveis).
3. Branch isolada; `git status --short` antes de editar.
4. Implementar só o escopo; decisões técnicas pequenas e reversíveis sem pedir OK.
5. **Gates obrigatórios antes do PR:** `npm run typecheck`, `npm test`, `npm run build`, `npm run test:agents`.
6. Corrigir falhas no escopo; sem refatoração paralela.
7. Abrir PR com resumo, comandos rodados, riscos, rollback. **Sem merge automático.**

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

## Próxima onda

Migração incremental para **ASP.NET Core 10** usará o mesmo protocolo; paridade de contratos `/api/*` e domínio (`backend/src/domain/`) antes de cortar Node.

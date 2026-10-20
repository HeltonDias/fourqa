# FourQA — índice da documentação oficial

**Local canônico:** `.cursor/docs/`. Para decidir *o que construir*, use requisitos/decisões; para saber *o que já existe*, confirme no código e nos testes. Não presumir que relatório histórico representa a implementação atual.

| Quando precisar de... | Ler (busca direcionada; não carregar tudo) |
|---|---|
| Visão de produto/usuários | `VISION.md` |
| Objetivo e história de usuário | `BACKLOG.md` (ID EP/FEAT/FN/US) |
| Comportamento e aceite verificável | `REQUIREMENTS.md` (RPT, PLN, EQA e demais IDs; v1.2) |
| Regra aprovada, pendência bloqueadora | `DECISIONS.md` (DEC/OPEN/ADR) |
| Arquitetura e dependências | `ARCHITECTURE.md` |
| Priorização e sequência de entrega | `ROADMAP.md` |
| Invariantes já decididas | `adr/001-*.md` a `adr/004-*.md` (somente o relevante) |
| Como trabalhar com agentes/Cursor | `AGENT_WORKFLOW.md` |
| Diagnóstico histórico | `CODEBASE_AUDIT.md`, `RESEARCH_VALIDATION.md` (auditoria 15/10) |
| Pesquisa original, com hipóteses não confirmadas | `deep-research-report.md` (**não é fonte de verdade de código**) |
| Nota operacional antiga da Vercel | `vercel.md` (**validar contra `DECISIONS.md` DEC-027 e ambiente atual**) |

**Referência atual de deploy:** `https://fourqa-homolog-heltonmarques-8008.vercel.app` é o alias oficial de Preview, mantido manualmente após validação. Outros links com hash são versões imutáveis, nunca link permanente do cliente.

**Regra de consistência:** quando código, documentação e proposta divergirem, separar *implementado*, *alvo aprovado* e *pendente*. Escopo/semântica incertos exigem decisão humana. `REQUIREMENTS.md` v1.2 contém observações históricas do Report; conferir também testes atuais.

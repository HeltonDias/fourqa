# FourQA — mapa de navegação (verificado no ZIP de 13/10/2026)

Stack: npm workspaces `backend` (Node/Express/TypeScript) e `frontend` (React/TypeScript/Vite). `package.json` na raiz: `npm run typecheck`, `npm test`, `npm run build`.

## Entrada e navegação
- `frontend/src/App.tsx`: rotas `/` (Report), `/planejamento`, `/status-frente` (Status), `/execucoes`, `/falhas`.
- `frontend/src/layout/AppLayout.tsx`: menu lateral, layout e `ReportChromeProvider`.
- `frontend/src/components/ReportChrome.tsx`: cabeçalho GLOBAL do projeto, período, atualização.
- `frontend/src/components/PageHeader.tsx`: título/descrição/ações de cada PÁGINA; wrappers em `components/ReportPageHeader.tsx` e `components/planning/PlanningPageHeader.tsx`.
- `frontend/src/context/ReportChromeContext.tsx`: estado e ações do cabeçalho global.
- `frontend/src/pages/{ReportPage,PlanejamentoPage,StatusPage,ExecucoesPage,FalhasPage}.tsx`: páginas.
- `frontend/src/styles.css`: estilos compartilhados; verificar classes existentes antes de criar novas.

## Status por frente
- `frontend/src/components/status/{FrenteCard,FrenteKpiGrid,StatusSummary,statusModel}.{tsx,ts}` (extensões conforme arquivo).
- `backend/src/routes/api.ts`: endpoints HTTP.
- `backend/src/services/reportService.ts`: agregação e dados de relatório/status.
- `backend/src/domain/`: regras de negócio, inclusive classificação/status.
- `frontend/src/api.ts`, `frontend/src/types.ts`, `backend/src/types.ts`: contratos e transporte.

## Outras fronteiras
- `backend/src/services/planningService.ts`: orquestração do planejamento.
- `backend/src/persistence/` e `backend/src/db/`: persistência; tratar alterações SQLite/PostgreSQL como críticas.
- `backend/src/azure/`: integração Azure DevOps.
- `docs/adr/`: decisões arquiteturais; consulte somente ADR relevante.
- `fonte/ENTENDIMENTO_ECOSISTEMA_PLANILHA.md`: legado Excel, apenas quando a tarefa envolver correspondência com planilha.

Este mapa é um índice, NÃO uma descrição completa nem prova de comportamento em runtime. Código e testes prevalecem. Atualize caminhos após mudanças estruturais.

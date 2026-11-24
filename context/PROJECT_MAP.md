# FourQA — mapa de navegação (verificado no working tree)

Stack atual: **API Python 3.12+ / FastAPI** em `backend/src/fourqa/` (entrada Vercel `api/index.py`); **frontend** React/TypeScript/Vite em workspace npm `frontend`. Node.js 22 cobre frontend e tooling da raiz — **não** é o runtime da API. Histórico: Express/TypeScript removido no cutover (`DEC-033` / ADR 007); C#/ASP.NET removido (`DEC-032` / ADR 005); fundação Java removida (`DEC-033` / ADR 006 superseded). Vetores de fórmulas: `backend/shared/formulas-parity-vectors.json`. Comandos raiz: `npm run typecheck`, `npm test`, `npm run formulas:parity`, `npm run build`, `npm run dev`.

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
- `backend/src/fourqa/api/routes.py`: endpoints HTTP.
- `backend/src/fourqa/services/report_service.py`: agregação e dados de relatório/status.
- `backend/src/fourqa/domain/`: regras de negócio, inclusive classificação/status.
- `frontend/src/api.ts`, `frontend/src/types.ts`, `backend/src/fourqa/types.py`: contratos e transporte.

## Outras fronteiras
- `backend/src/fourqa/services/planning_service.py`: orquestração do planejamento.
- `backend/src/fourqa/persistence/` e `backend/src/fourqa/db/`: persistência; tratar alterações SQLite/PostgreSQL como críticas.
- `backend/src/fourqa/azure/`: integração Azure DevOps.
- `backend/pyproject.toml`, `requirements.txt`, `api/index.py`: empacote Python e Function Vercel.
- `.cursor/docs/adr/`: decisões arquiteturais; consulte somente ADR relevante (005/006 históricos; 007 Python vigente).
- `fonte/ENTENDIMENTO_ECOSISTEMA_PLANILHA.md`: legado Excel, apenas quando a tarefa envolver correspondência com planilha.

Este mapa é um índice, NÃO uma descrição completa nem prova de comportamento em runtime. Código e testes prevalecem. Atualize caminhos após mudanças estruturais.

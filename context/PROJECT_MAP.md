# FourQA — mapa de navegação (verificado no working tree)

Stack atual: **API Java 25 / Spring Boot 4 + Maven** em `backend/` (`pom.xml`, código em `backend/src/main/java/com/fourqa/api/`; host separado com rewrite `/api` da Vercel; `DEC-041` / ADR 008); **frontend** React/TypeScript/Vite em workspace npm `frontend`. Node.js 22 cobre frontend e tooling da raiz — **não** é o runtime da API. Histórico: Python/FastAPI removido no cutover Java (ADR 007); Express/TypeScript removido (`DEC-033`); C#/ASP.NET removido (`DEC-032` / ADR 005). Vetores de fórmulas: `backend/shared/formulas-parity-vectors.json`. Comandos raiz: `npm run typecheck`, `npm test`, `npm run formulas:parity`, `npm run build`, `npm run dev`.

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
Pacotes Java abaixo ficam em `backend/src/main/java/com/fourqa/api/`.
- `web/ApiController.java`, `web/IdentityController.java`: endpoints HTTP; `web/IdentityFilter.java`: identidade e escopo por requisição.
- `services/ReportService.java`: agregação e dados de relatório/status.
- `domain/`: regras de negócio, inclusive classificação/status (`Formulas`, `StatusFrente`).
- `frontend/src/api.ts`, `frontend/src/types.ts`: contratos e transporte (DTOs Java são `Map` com as mesmas chaves).

## Outras fronteiras
- `services/PlanningService.java`: orquestração do planejamento.
- `persistence/` (`Database`, `Jdbc*Store`, `Migrations`) e `backend/src/main/resources/db/postgres/`: persistência; tratar alterações SQLite/PostgreSQL como críticas.
- `azure/`: integração Azure DevOps; `connector/`: porta `TestDataSource` consumida por `SyncService` (E1, DEC-043); `auth/`: sessão, Entra, RBAC, Fernet.
- `backend/pom.xml`, `backend/mvnw`, `scripts/mvnw.mjs`, `vercel.json`: build Maven e rewrite Vercel.
- `.cursor/docs/adr/`: decisões arquiteturais; consulte somente ADR relevante (005/006/007 históricos; 008 Java vigente).
- `fonte/ENTENDIMENTO_ECOSISTEMA_PLANILHA.md`: legado Excel, apenas quando a tarefa envolver correspondência com planilha.

Este mapa é um índice, NÃO uma descrição completa nem prova de comportamento em runtime. Código e testes prevalecem. Atualize caminhos após mudanças estruturais.

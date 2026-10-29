# FourQA — estado atual do frontend

**Auditoria:** 2026-10-28. Somente leitura. Nenhuma tela foi aberta no browser nesta sessão. Elemento no JSX não prova fluxo salvo.

**Stack conferida:** React 19, TypeScript, Vite, React Router. Rotas em `frontend/src/App.tsx`. Não há testes `*.test.tsx` nem `*.spec.tsx` em `frontend/`. Percentual validado de requisito de UI fica 0 quando o único critério é visual, mesmo com a tela presente.

## 1. Rotas e estado

| Rota | Página | Função observada no código |
|---|---|---|
| `/` | `pages/ReportPage.tsx` | Report: KPIs, status de cenários, gráficos, gestão de impactos |
| `/planejamento` | `pages/PlanejamentoPage.tsx` | Grade, acompanhamento, revisões, distribuição, histórico |
| `/status-frente` | `pages/StatusPage.tsx` | Cartões por frente e busca local |
| `/execucoes` | `pages/ExecucoesPage.tsx` | Tabela paginada, busca, coluna RunBy |
| `/falhas` | `pages/FalhasPage.tsx` | Tabela paginada, busca. Sem Created By |
| `/evolucao-qa` | `pages/EvolucaoQaPage.tsx` | Só o texto "Em desenvolvimento" |
| `/configuracoes` | `pages/ConfiguracoesPage.tsx` | Ambiente, integração Azure, hierarquia, responsabilidades, sync |

Layout: `layout/AppLayout.tsx`, `layout/TopAppBar.tsx`. Cliente HTTP: `frontend/src/api.ts`. Chrome do Report: `context/ReportChromeContext.tsx`. Estados de carga: `components/LoadState.tsx`.

Não há rota de login, de card de Test Plan, nem de link público. CAT-062–066 e SEC-068–072 não têm fluxo de tela.

## 2. Report

`ReportPage` pede `GET /api/home` e renderiza números do servidor. `ReportKpiRow.tsx` ainda rotula o card `% BUGS CLIENTE`. RPT-002 (Impacto do Cliente, termo configurável) não está na interface.

`ScenarioStatusPanel.tsx` mostra, nesta ordem: Total, Planejados, Finalizados, Pendentes; depois Passed, N/A, Falha, Bloqueado, Liberado, Não lib., Design. Isso cobre os dois primeiros critérios visuais de RPT-003. Os critérios da aba Evoluções não têm tela: `EvolucaoQaPage` é placeholder.

`GestaoImpactosPanel.tsx` existe (RPT-006 parcial). Não há editor de fórmula separado do nome (RPT-001, RPT-009). Título de cabeçalho é outro controle (`ReportTitles` / PUT `/api/cabecalho`), e o período altera conta (ADR 003). O código não transforma o nome do KPI em fórmula.

Gráficos: `ReportCharts.tsx`, `DonutChart.tsx`. Filtros do Report não foram exercitados no browser.

## 3. Planejamento

Página grande, com componentes em `frontend/src/components/planning/`.

O que o JSX faz:

- Grade com totais por dia calculados sobre `allRows`, não sobre a página (`PlanningGridTable.tsx`, `dayTotals`). Isso atende o critério de PLN-002 em que filtrar a página não muda o total do dia. Popover, teclado e "abrir não grava" não foram executados.
- Fins de semana com classe `plan-weekend` e bloqueio `weekendLocked` quando o dia não está em `enabledWeekendDays`. Há botão para desligar fim de semana habilitado. Papel "QA leitor" não existe, então o critério de autorização de PLN-003 falha.
- Faixa de meses via `monthSpans`. Não é um seletor direto mês/ano com proteção de rascunho (PLN-004 parcial).
- Edição de célula, responsável e prioridade chama a API com `baseValue` (`PlanejamentoPage.tsx`). Conflito usa `isConflict` em `api.ts`.
- `PlanningDistributeModal.tsx` existe. O domínio só aceita modo `manter`. Modais de transferir suíte e compartilhar QA não fecham PLN-014–016.
- `PlanningRevisoesPanel.tsx` e `PlanningChangeHistoryPanel.tsx` existem. Relógio global de DEC-022 / GOV-079 não está no chrome de usuário; há painel de alterações do planejamento.
- Acompanhamento: `PlanningAcompanhamentoTable.tsx`. O teste `suiteFillSurface.test.ts` falhou nesta sessão porque o texto "Responsável próprio da suíte" não está nesse arquivo.

## 4. Status, execuções, falhas

`StatusPage` busca no cliente com `ordenarFrentes` e mostra estado vazio quando nada casa. Dados vêm de `GET /api/status-frente`. A página não explica por que o número difere do Report (OPR-045). A divergência está no backend (`finalizadosComCancelados`), não narrada na UI.

`ExecucoesPage` e `FalhasPage` têm busca, paginação e estados de erro via o hook de fetch. Execuções exibem `run_by`. Falhas exibem impacto, status, frente. Não exibem Created By. OPR-048 parcial (mostra executor sem promover a responsável). OPR-049 ausente na tela.

## 5. Configurações e sync

`ConfiguracoesPage` tem seções Ambiente, Integrações, Usuários, Segurança, Parâmetros, Dados. Integrações editam hierarquia e responsabilidades e gravam por `PUT /api/sync/config` (nomes de campo no componente, sem segredo neste documento). Usuários e Segurança não implementam organização, papel nem sessão (SEC-074). São entradas de navegação, não o fluxo de DEC-004.

`SyncMessage.tsx` mostra estado de sync (INT-054 parcial). Disparo depende do bearer no cliente (`localStorage`, `DEC-T02`). Não há teste de conexão (INT-056) nem assistente de extensão (INT-057, adiado).

## 6. Erros, vazio, acessibilidade, visual

`LoadState` cobre carga e falha nas páginas que o usam. Evolução QA não tem estado vazio de dados: é página estática.

Acessibilidade: vários `aria-label` na grade de configuração. Não há auditoria de teclado, foco do popover de dia, nem leitor de tela. Critérios de PLN-002 e PLN-016 que exigem teclado ficam não atendidos por falta de execução, e o código de PLN-016 (suíte expansível com vários QAs) não está implementado.

Responsividade: a grade de acompanhamento mede `ResizeObserver` e escala colunas. Não houve viewport mobile nesta auditoria.

Consistência: ícones em `components/Icons.tsx`, `KpiIcons.tsx`, `config/scenarioStatusIcons.ts`. O rótulo `% BUGS CLIENTE` destoa da decisão DEC-006.

## 7. Auth na interface

Não há tela de login institucional. O cliente envia bearer se houver token local. Esconder botão não é autorização: a API recusa escrita sem bearer. Qualquer pessoa com o token compartilhado escreve. Não há modo somente leitura por papel (SEC-070) nem link de visitante (SEC-071).

## 8. Testes

Nenhum teste de frontend no repositório. Nenhum E2E. O único teste que lê fonte de componente de planejamento (`suiteFillSurface.test.ts`) **falhou** nesta sessão (239 pass, 1 fail no `npm test` do backend). Browser não foi usado. Validado de fluxo de UI = 0% nesta auditoria, salvo quando o critério é coberto por teste de domínio que passou (fórmula, curva), registrado na matriz como validação de backend, não de tela.

## 9. Percentuais de superfície

Mesma metodologia da matriz. A tela pronta não sobe o percentual se o critério de aceite pede comportamento que o JSX não faz.

| Módulo | Leitura do código | Lacuna que impede concluir |
|---|---|---|
| Report | Painel de status e KPIs ligados à API | Rótulo antigo; KPI não configurável; Evoluções ausente |
| Planejamento | Grade, revisão, distribuição modo manter | Total do dia não verificado ao vivo; modos transferir/compartilhar ausentes; teste de superfície vermelho |
| Status | Cartões e busca | Sem texto da divergência semântica |
| Execuções / Falhas | Lista, busca, página | Created By ausente; prioridade de caso não é coluna de `execucoes` |
| Evolução QA | Placeholder | Módulo inteiro EQA-001–010 |
| Configurações | Sync e parâmetros Azure | Sem usuários reais, sem teste de conexão |
| Catálogo / login | Ausente | CAT e SEC de identidade |

## 10. Critério para considerar o frontend da fase atual concluído

Rotas atuais com fluxo exercitado (carregar, vazio, erro, gravar, 409), RPT-002 visível, Evolução QA deixando de ser placeholder, distribuição só nos modos aprovados, e pelo menos um teste de componente ou E2E verde para o painel de status e para a grade. Nenhum desses passos de verificação visual ocorreu em 2026-10-28.

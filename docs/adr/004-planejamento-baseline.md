# ADR 004 — Baseline, cronograma e replanejamento

O baseline é um snapshot confirmado dos CTs, não só uma quantidade. Depois da confirmação, uma mudança no Azure não altera esse baseline. CT novo continua visível na fonte e só entra numa revisão seguinte se o baseline for confirmado de novo a partir da fonte.

A identidade é PlanId, SuiteId, TestPointId e TestCaseId. Atalho, frente, processo e nome da suíte são metadados.

Datas do cronograma são registros (`planning_allocation`: item, data, quantidade). A tela pode mostrá-las como colunas. `plannedToDate` soma alocações com data menor ou igual à data considerada, sem usar posição de coluna.

Replanejamento insere uma revisão nova e preserva a anterior, com motivo, escopo e cronograma. Não há fluxo de aprovação.

Classificação vem de `classifyExecution`. Integridade de escopo, de classificação e de cronograma são diagnósticos separados.

A aba `2) Planejamento` da planilha é referência funcional e visual. Ela não define tabelas, fórmulas nem identidade dos dados.

Planejamento legado importado só com quantidades fica `baselineOrigin = legacy` e `scopeSnapshotAvailable = false`. Sem o snapshot dos Test Points, o Motor não inventa membership e não trata isso como "sem divergência".

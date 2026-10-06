# ADR 002 — Status tem uma fonte e diverge da planilha de propósito

`classifyExecution` em `backend/src/domain/formulas.ts` é a única regra. O frontend não reclassifica.

Outcome manda:

- Passed → passed, qualquer TestCaseState (Closed, QA, UAT, BUG, Ressalva)
- NotApplicable → N/A
- Failed → falhado
- Blocked → bloqueado
- sem outcome: Design; "Não atribuído" → não liberado; Ready → liberado; resto → não liberado

A planilha às vezes cruza Passed com Closed. Essa regra foi mantida porque é a que fechou a Home da Fase 2 (907 passed, 926 finalizados). A divergência é intencional, não um erro de port.

Integridade é outra pergunta. Passed com Test Case BUG continua classificado como passed e, no Planejamento, fica marcado como combinação inconsistente. Combinação desconhecida continua no universo analisado, como não classificada.

Invariante: a soma das sete colunas é o total de test points.

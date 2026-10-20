# Validação da Pesquisa Aprofundada

Fonte: `.cursor/docs/deep-research-report.md` (Sumário Executivo, 15/10/2026).

O próprio texto diz que o front-end não foi aberto e que os nomes de entidade são hipotéticos (§2). A maior parte do documento é especificação de produto e proposta, não inventário do código. Esta validação separa as duas coisas.

Classificação: **CONFIRMADO NO CÓDIGO**, **REQUISITO DE PRODUTO**, **IMPLEMENTADO PARCIALMENTE**, **NÃO IMPLEMENTADO**, **HIPÓTESE OU INFORMAÇÃO INCORRETA**, **PENDENTE DE VALIDAÇÃO**.

## Arquitetura (§1)

| Afirmação | Classe | Evidência |
|---|---|---|
| SPA consome API REST | CONFIRMADO | `frontend/src/App.tsx`, `frontend/src/api.ts`, `backend/src/routes/api.ts` |
| Front é React ou Angular, não inspecionado | HIPÓTESE INCORRETA quanto à dúvida | É React 19 + Vite. O código está em `frontend/` |
| Telas de SSO, cartões de Test Plans, Evolução QA, histórico e configurações | NÃO IMPLEMENTADO | Rotas reais: Report, Planejamento, Status, Execuções, Falhas |
| Back-end Node/Express ou talvez Django | CONFIRMADO Express | `backend/package.json`. Django não existe |
| Rotas de usuários e autenticação OAuth | NÃO IMPLEMENTADO | Único controle: `decideReadAuth` / `decideWriteAuth` em `backend/src/http/writeAuth.ts` |
| PostgreSQL multi-tenant com `companies` e `company_id` | HIPÓTESE INCORRETA | Tabelas em `001_baseline.sql`. Isolamento por `plan_key` |
| SSO OAuth2, JWT, botões Microsoft/Google | HIPÓTESE INCORRETA | Bearer compartilhado. Login da Vercel é proteção do host, não do produto |
| Variável `Delivery` no `.env` | NÃO IMPLEMENTADO | `.env.example` não tem `Delivery`. Planos vêm de `SYNC_TEST_PLANS` |
| Credenciais por empresa | REQUISITO DE PRODUTO | Hoje um PAT e um token por ambiente |
| Containers e CRON de sync | NÃO IMPLEMENTADO | Sync manual. Deploy descrito em `.cursor/docs/vercel.md` |

## Modelo de dados (§2 e diagrama §11)

O diagrama COMPANY–USER–TESTPLAN–SUITE–SCENARIO–RESPONSIBILITY–PLANNING_CELL–EXECUTION–HISTORY_EVENT **não está no banco**.

| Entidade proposta | Classe | O que existe |
|---|---|---|
| Company, User, role | NÃO IMPLEMENTADO | Sem tabelas |
| TestPlan com `source_tool` Azure/Xray/Zephyr/Octane | HIPÓTESE INCORRETA | `planning.plan_key` e colunas do snapshot (`plan_id`, `plan_name`). Só Azure |
| Suite com `responsible_user_id` | IMPLEMENTADO PARCIALMENTE | `planning_item.responsavel` é texto, uma vez por suíte (`003_plan_suite_fill.sql`) |
| Scenario com status próprio | IMPLEMENTADO PARCIALMENTE | O ponto vive em `execucoes` (`test_point_id`, `test_case_id`, `outcome`). Não há tabela `scenario` |
| Responsibility compartilhada | NÃO IMPLEMENTADO | Sem tabela associativa |
| PlanningCell com `user_id` | HIPÓTESE INCORRETA | `planning_allocation` é quantidade por data, sem usuário |
| Execution granular ou agregada, com `executed_by` | IMPLEMENTADO PARCIALMENTE | Uma linha por Test Point. `run_by` é o último executor Azure, não um user do FourQA |
| HistoryEvent de célula | NÃO IMPLEMENTADO | `planning_revision` versiona o baseline (motivo e origem), não cada edição |
| `include_weekends` no plano | NÃO IMPLEMENTADO | Fim de semana só é ocultado na grade |

O quadro do §10 (“PlanningCell.user_id não existe”, “HistoryEvent não existe”) acerta a ausência. “Suite.responsible_user_id possivelmente já existe” e “TestPlan.external_id existe” são imprecisos: o responsável é texto; o id externo do plano está nas linhas de `execucoes.plan_id`, não numa entidade TestPlan multi-ferramenta.

## Funcionalidades (§3)

| Tema | Classe | Notas |
|---|---|---|
| Grade por dia e suíte, célula com quantidade | CONFIRMADO | `PlanningGridTable.tsx`, `savePlanningCell` com `field: "day"` |
| Pop-up “Total do dia: X” | NÃO IMPLEMENTADO | Há mapa de calor e cards de distribuído (`PlanningSummaryCards.tsx`). Não há tooltip de soma do dia |
| Distribuição montanha, modal, preservação de executados, curva | REQUISITO DE PRODUTO | Nenhuma função `distribuirMontanha` ou rota `/planning/distribute` |
| Fim de semana desligado, admin liga para o projeto | IMPLEMENTADO PARCIALMENTE | `businessDays` remove sáb/dom. Sem toggle e sem papel admin |
| Um responsável principal por suíte | IMPLEMENTADO PARCIALMENTE | Texto único em Acompanhamento. Não é FK, não destaca principal nem co-responsáveis |
| Até dois QAs, linhas expansíveis, quantidades por pessoa | REQUISITO DE PRODUTO | Não há |
| Bloqueio em lote de cenários a partir de uma falha | NÃO IMPLEMENTADO | Outcome Blocked vem do Azure. Não há modal de bloqueio |
| Histórico com ícone de relógio | REQUISITO DE PRODUTO | Revisão existe; UI de auditoria de célula não |
| Extensão de browser e `/api/quickconnect` | NÃO IMPLEMENTADO | Sem pasta de extensão |

A frase “ainda não implementada completamente” para a montanha sugere que parte já exista. No código, não há algoritmo, botão nem modal.

## Integrações (§4)

| Afirmação | Classe |
|---|---|
| Azure DevOps Test Plans é fonte de suítes, pontos e resultados | CONFIRMADO. `getTestPoints` e `loadFalhas` |
| Jira/Xray, Zephyr e ALM Octane estão auditados no produto | HIPÓTESE INCORRETA. Nenhuma ocorrência no código |
| Assigned To sugere responsabilidade, mas Evolução QA deve ignorá-lo | REQUISITO DE PRODUTO. Assigned To é pedido no lote de bugs e não é gravado |
| Created By aparece na coluna de falhas | HIPÓTESE INCORRETA. O campo é pedido em `loadFalhas` e não entra na linha. `falhas.responsavel` sai de `SYNC_RESPONSABILIDADES` |
| Status Passed/Failed/Blocked/Not Executed alimenta Status | CONFIRMADO, com tradução própria. `estadoPonto` e `classifyExecution` em `formulas.ts`. Not Applicable vira Closed no vocabulário da planilha |
| FourQA guarda só contagens, não o cenário | HIPÓTESE INCORRETA. O snapshot guarda o ponto e o caso. A agenda de planejamento é que guarda quantidade. A prioridade do caso é lida no sync e não é coluna de `execucoes` |
| Retry em 429 com `Retry-After` | CONFIRMADO. `AzureClient.request` |
| Monitorar `X-RateLimit-Remaining` | NÃO IMPLEMENTADO |
| PAT criptografado e refresh OAuth | HIPÓTESE INCORRETA. PAT em variável de ambiente. Sem refresh |
| “Última sincronização” na interface | IMPLEMENTADO PARCIALMENTE. A Home expõe data de atualização vinda da meta do lote. Não há tela de erro por conector |
| Rotas `/api/integrations/azure/connect`, `/api/testplans`, `/api/users` | NÃO IMPLEMENTADO. Sync real: `POST /api/sync`. Status: `GET /api/sync/status` |

Escrita no Azure: `client.post` existe e é chamado só em `getWorkItemsBatch` (`backend/src/azure/falhas.ts`), no endpoint de leitura `workitemsbatch`. Não há PATCH nem PUT. Não há criação nem atribuição de work item.

## Permissões (§5)

| Perfil | Classe |
|---|---|
| Visualizador por link com token UUID do plano | NÃO IMPLEMENTADO |
| QA autenticado, só leitura | NÃO IMPLEMENTADO |
| Admin com gestão de usuários e distribuição | NÃO IMPLEMENTADO |
| Quem tem o bearer escreve; na Vercel a leitura também exige o bearer | CONFIRMADO |

## Gaps que o relatório trata como código atual (§6)

| Gap descrito | Classe | Leitura correta |
|---|---|---|
| Preservar executados na redistribuição | REQUISITO DE PRODUTO | Não há redistribuição para estar errada ou certa |
| Distribuir só pendentes | REQUISITO DE PRODUTO | Idem |
| Botão Distribuir em todo o Test Plan | REQUISITO DE PRODUTO | Idem |
| Compartilhamento quantitativo sem partir o Test Case | REQUISITO DE PRODUTO | O modelo atual já é quantitativo por suíte, mas para um responsável só |
| Evolução QA pela meta do FourQA, não pelo Assigned To | REQUISITO DE PRODUTO | A métrica individual não existe. Status atual é por frente |
| Ninguém lança execução no FourQA | CONFIRMADO | Execuções e Falhas são leitura do snapshot |
| Trilha de auditoria insuficiente | CONFIRMADO como lacuna | Revisões sim; evento por célula não |
| Sem tela de falha de integração | IMPLEMENTADO PARCIALMENTE | Erro de sync fica no job (`sync_job`). Não há painel de conectores |

## Recomendações (§7 a §11)

Endpoints `PUT /planning/distribute`, `GET /planning/totals/:date`, `POST /suites/:id/shared`, `GET /history/testplan/:id`, `GET /auth/azure/callback` e `GET /integrations/:tool/status`: **NÃO IMPLEMENTADO**. São backlog.

O SQL de exemplo junta `users`, `planning_cells.user_id` e `executions.user_id`. Essas colunas não existem. Usá-lo como descrição do banco atual é **HIPÓTESE INCORRETA**.

O pseudocódigo da montanha e o Gantt são **REQUISITO DE PRODUTO**. Os números da curva (5, 10, 20, …) são exemplo do relatório, não resultado do FourQA.

Esforço e prioridade (PL-001, EQA-001, etc.) não foram medidos nesta auditoria. **PENDENTE DE VALIDAÇÃO** como plano, não como fato do código.

## Evolução QA e suíte compartilhada

Requisito explícito desta etapa, não uma tela já pronta:

- A evolução deve ser automática e por QA.
- A responsabilidade nasce no FourQA.
- O resultado nasce do Azure.
- Não se digita execução no FourQA.
- Quantidade repartida sem vínculo de Test Case não pode ser apresentada como resultado real.

O código permite o resultado por ponto (`execucoes.outcome`, `test_case_id`, `run_by`) e a meta quantitativa da suíte (`planning_allocation`). Não liga um subconjunto de pontos a cada QA. Com um único `responsavel` por suíte, a meta inteira cai nesse texto. Com dois QAs e só quantidades, não há como saber quais pontos do Azure pertencem a cada um sem uma regra nova (vínculo de Test Point ou de Test Case). `run_by` identificaria quem clicou no Azure, o que o requisito rejeita como critério da meta.

Enquanto esse vínculo não existir, uma Evolução QA individual em suíte compartilhada seria estimativa. O relatório, no §7.4, chega a sugerir “números baseados nas metas” quando a separação não existir. Isso conflita com a regra de não publicar estimativa como resultado.

## Multiempresa

Hoje: um banco, um PAT, um token, vários `plan_key`. Levar isso a várias empresas sem modelo de tenant misturaria planos, snapshots e o bearer. A pesquisa acerta a necessidade (PL-001) e erra ao descrever o isolamento como já implementado.

Impacto mínimo de uma arquitetura futura, sem desenhar a solução aqui: usuário e papel, credencial de integração por empresa, e chave de tenant em planejamento, snapshot e metas. `plan_key` sozinho não separa clientes.

## O que a pesquisa acertou

- Planejamento é grade de quantidades, não designação de casos.
- Execução compartilhada, se existir, deve continuar quantitativa no FourQA e deixar o caso no Azure.
- Execução não deve ser digitada no FourQA.
- Evolução por QA ainda é trabalho novo.
- Histórico fino de edição ainda não existe.
- Retry de 429 faz parte do cliente Azure.
- O ZIP/código não tinha sido lido de ponta a ponta. O relatório avisa isso e, ainda assim, narra várias hipóteses como arquitetura vigente.

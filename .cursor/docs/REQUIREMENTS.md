# FourQA — Requisitos funcionais do Report

Etapa 2.2. Documento de requisitos, de 16/10/2026.

Escopo: somente o módulo Report (`/`). Planejamento, Evolução QA individual, Status por frente e a tela de Falhas não são especificados aqui. Entram apenas quando uma conta do Report depende deles.

Cada requisito separa o que o código faz hoje do comportamento pedido. Onde a decisão ainda não fecha, o item fica em **Pendências**, sem escolha de solução.

Fontes: `VISION.md`, auditoria de 15/10/2026, validação da pesquisa aprofundada e a implementação do Report no frontend e no backend. A pesquisa aprofundada não é inventário do código.

## Inventário verificado

Isto é o Report atual. Não é o comportamento alvo.

### O que a tela mostra

| Região | Rótulos visíveis | Origem do número |
|---|---|---|
| Faixa de KPIs | STATUS, % BUGS DEV., % BUGS CLIENTE, % Total Impactados, Replanejados, % PLAN, % REAL, GAP | `getHome` em `reportService.ts`; rótulos em `ReportKpiRow.tsx` |
| Status dos Cenários | TTL CT's, CT's Plan, Final., Falha, Bloq., Lib., Design, Não Lib. | `ScenarioStatusPanel.tsx` |
| Cenários Impactados Por Responsáveis | Foursys, Cliente, Reteste, Total | `ImpactResponsaveisPanel.tsx` |
| Evoluções | Colunas de hierarquia, Status, Início, Fim, TTL CTs, Plan, Fin., GAP, Passed, N/A, Ress., Falh., Bloq., Lib., Design, Não Lib.; rodapé Valores Totais | `ReportPage.tsx` |
| Gráficos | Planejado Vs Realizado; Status das Execuções | `ReportCharts.tsx`, `graficos.ts` |
| Gestão de Impactos | Total de Bugs, Fechados, Pendentes, Em ReTestes, Bugs Abertos DEV, Bugs Abertos Cliente, Bugs Abertos Outros; pizzas Frentes, Status dos Defeitos, Categoria | `GestaoImpactosPanel.tsx`, `gestaoImpactos` |

O cabeçalho do projeto (título e subtítulo) e o período são editáveis. O título da página "Report" não é o título do projeto.

### Classificação de cenário

`classifyExecution` é a única regra. A interface não reclassifica. Outcome do Azure manda:

| Outcome persistido | Vocabulário interno (`estadoPonto`) | Coluna |
|---|---|---|
| `passed` | Passed | Passed |
| `notapplicable` | Closed | N/A |
| `failed` | Failed | Falha |
| `blocked` | Blocked | Bloqueio |
| sem outcome, Test Case `Design` | — | Design |
| sem outcome, Test Case "Não atribuído" | — | Não liberado |
| sem outcome, Test Point `Ready` | Ready | Liberado |
| demais sem outcome | Unspecified ou vazio | Não liberado |

Cada Test Point cai em uma dessas sete colunas. A soma das sete é o total de pontos. Não há coluna "não classificado" de cenário. Passed conta como passado mesmo se o Test Case não estiver Closed (ADR 002).

`NotApplicable` do Azure é a coluna N/A. Não é o estado Closed do Test Case.

### Contas que o Report usa hoje

- **Finalizados da linha, do card Final. e da coluna Fin.:** Passed + N/A + cancelados. Cancelados vêm da planilha legada (`cts_cancelados`), não de um outcome do Azure. Na Evoluções o cabeçalho dessa coluna é "Ress." ("CTs com ressalvas").
- **Realizado do gráfico Planejado Vs Realizado:** só Passed e N/A, pela `date_completed`, com fallback em `last_updated_date`. Cancelados não entram.
- **CTs executados** (denominador de % BUGS DEV., % BUGS CLIENTE e % Total Impactados): Passed + Falhados + Bloqueados. N/A fica de fora.
- **% PLAN:** planejado até hoje ÷ total de CTs. O planejado até hoje reparte a quantidade do grupo pelos dias úteis entre início e fim, até a data de hoje. Datas confirmadas na linha legada; senão, o período do plano; sem data, o planejado até hoje é 0 (ADR 003).
- **% REAL:** finalizados (Passed + N/A + cancelados) ÷ total de CTs.
- **GAP da suíte:** planejado até hoje − finalizados da linha. O GAP do card é a soma dos GAPs.
- **STATUS e o rosto da Evoluções:** se todos os CTs são N/A, "Não se aplica"; se finalizados cobrem o total, "Finalizado"; GAP > 3, "Atrasado"; GAP > 0, "Atenção" (GAP 3 inclusive); GAP ≤ 0, "No prazo". O STATUS geral é a maioria das suítes, sem contar as N/A. Empate fica com o mais grave.
- **Cenário impactado (cards Foursys / Cliente / Reteste):** Test Point com outcome `failed` ou `blocked`.
- **Total desses cards:** contagem de pontos Failed + Blocked. Não é contagem de bugs.
- **Baldes do KPI armazenado** (só o plano de `SYNC_KPI_PLAN_KEY`): para cada ponto failed/blocked, o bug aberto (`New` ou `Active`) mais recente ligado ao último run/result. Responsável contendo "foursys" → Foursys; contendo "cliente" ou "cvp" → Cliente; sem esse texto, sem bug ligado ou sem resultado mapeado → Reteste.
- **Balde de fallback**, quando não há KPI armazenado daquele `plan_key`: outra regra, que associa bug aberto ao ponto por tag/frente ou por trecho do título, e também empurra o não casado para Reteste.
- **% BUGS DEV. e Bugs Abertos DEV:** responsável da falha igual ao texto `Desenvolvimento Foursys`.
- **% BUGS CLIENTE e Bugs Abertos Cliente:** responsável igual ao texto `Cliente CVP`.
- **Bugs Abertos Outros:** responsável igual ao texto `Outros`.
- **Gestão de Impactos** conta bugs com `bug_id`, não Test Points. Fechado é bug com data de fechamento. Pendentes é o complemento. Em ReTestes é bug sem fechamento e com estado `Resolved`. As pizzas usam só bugs sem fechamento. Categoria vazia aparece como "(vazio)".
- O responsável gravado na falha não é Assigned To nem Created By. É o mapa de ambiente `SYNC_RESPONSABILIDADES`: categoria do bug → texto. A categoria só existe se o Azure tiver um campo cujo nome seja "Categoria da Falha" ou "Categoria Falha".

Há duas populações no Report: Test Point (cenários e KPIs de execução) e Bug (gestão de impactos e os percentuais de bugs). Um não substitui o outro.

## RPT-001 — KPIs configuráveis por projeto e Test Plan

**Estado atual:** parcial.

**Objetivo.** O Report de cada projeto e de cada Test Plan usa os indicadores daquele contexto. Título, fonte, categoria, operação, fórmula e apresentação deixam de ser constantes do código.

**Comportamento esperado.**

- A configuração vale para o projeto e para o Test Plan em que foi gravada. Outro plano não herda o rótulo nem a fórmula por acidente.
- Cada indicador tem nome exibido, fonte de dados, categorias que entram na conta, operação, fórmula e forma de apresentação.
- Alterar só o nome, a ordem ou o formato não recalcula o valor.
- Alterar fonte, categoria, operação ou fórmula recalcula o valor e é uma ação distinta da edição visual.
- O resultado continua calculado no backend. A interface não cria uma segunda fórmula.

**Regra de negócio.**

- A conta vigente, enquanto não houver configuração nova, é a do inventário acima.
- Nome exibido e fórmula são dados diferentes. Trocar "% BUGS CLIENTE" não muda o filtro `Cliente CVP`.
- Um indicador sem fonte utilizável não mostra um número inventado. Mostra ausência de base, no mesmo espírito dos estados vazio e erro já usados no produto.
- % PLAN, % REAL, GAP e STATUS dependem de finalizados e de datas. Mudar a definição de finalizados (RPT-003) muda essas contas. Isso é alteração de lógica, não de rótulo.

**Critérios de aceite.**

- Dado dois Test Plans configurados com títulos diferentes para o mesmo tipo de indicador, cada Report mostra o próprio título.
- Dado um indicador cuja única mudança foi o título, o valor numérico permanece o mesmo antes e depois da gravação.
- Dado um indicador cuja fórmula foi alterada, o valor segue a fórmula nova e o nome antigo pode permanecer.
- A interface não recalcula o KPI por conta própria a partir do nome exibido.
- Um plano sem KPI armazenado não reutiliza o número do plano indicado por `SYNC_KPI_PLAN_KEY` como se fosse seu.

**Dependências técnicas.**

- Hoje o conjunto é fixo em `ReportKpiRow.tsx` e `getHome`. Não há entidade de KPI configurável.
- O KPI exato de impactos só é calculado para `SYNC_KPI_PLAN_KEY` e guardado em `kpi_impactos:<plan_key>`. Os demais planos usam `classificarImpactosKpi`, que é outra regra.
- Formas de apresentação já existentes, e só estas: card com rosto, card com ícone e valor, painel de cards, tabela, linha acumulada e pizza com legenda. Percentual de bugs usa duas casas e vírgula; % PLAN e % REAL usam zero casas.
- Operações já presentes nas contas: contagem, soma, razão, diferença, filtro por texto exato, filtro por texto contido, maioria de rostos. Isso descreve o código. Não é o catálogo autorizado de fórmulas.
- Escrita do cabeçalho e do período usa o token compartilhado. Papel de administrador é direção futura e não é pré-requisito da demonstração.

**Pendências.**

- Catálogo fechado de operações, ou fórmula livre. Não decidido.
- Quais dos oito KPIs atuais entram na primeira configuração e quais permanecem fixos, em especial % PLAN (ADR 003), STATUS e GAP.
- "Projeto" e "Test Plan" ainda não são entidades de configuração. O isolamento real é `plan_key` dentro de um Azure por ambiente.
- Onde a configuração fica gravada, e quem pode gravá-la na demonstração, enquanto não houver administrador.

## RPT-002 — Impacto do Cliente no lugar de Bugs Cliente

**Estado atual:** não implementado.

**Objetivo.** A nomenclatura de bug do cliente sai da tela do Report. O termo do produto é Impacto do Cliente, e o cliente pode usar o termo do próprio vocabulário.

**Comportamento esperado.**

- Os rótulos visíveis do Report que dizem "BUGS CLIENTE" ou "Bugs Abertos Cliente" passam a exibir o termo configurado para aquele cliente.
- Sem termo configurado, o texto exibido é "Impacto do Cliente".
- A troca de texto não altera a população nem a fórmula do indicador.
- O termo configurado é nome de apresentação. A categoria de cálculo continua identificada à parte (RPT-009).

**Regra de negócio.**

Rótulos visíveis hoje no Report, e só estes entram neste requisito:

| Onde | Texto atual | O que o número é |
|---|---|---|
| Faixa de KPIs | % BUGS CLIENTE | falhas com responsável `Cliente CVP` ÷ CTs executados |
| Gestão de Impactos | Bugs Abertos Cliente | bugs sem fechamento, estado diferente de `Resolved`, responsável `Cliente CVP` |

O card "Cliente" em Cenários Impactados Por Responsáveis é balde de Test Point, não o texto "Bugs Cliente". O nome desse card segue RPT-004 e RPT-006. Não é renomeado aqui por conta própria para "Impacto do Cliente", porque a população é outra.

**Critérios de aceite.**

- A faixa de KPIs do Report não exibe "BUGS CLIENTE".
- A Gestão de Impactos do Report não exibe "Bugs Abertos Cliente".
- Com termo de cliente gravado, os dois lugares usam esse termo.
- Sem termo gravado, os dois lugares usam "Impacto do Cliente".
- O valor numérico permanece o da fórmula atual enquanto a fórmula não for alterada por RPT-001 ou RPT-004.

**Dependências técnicas.**

- Textos em `ReportKpiRow.tsx` e `GestaoImpactosPanel.tsx`.
- Campos de API `percentBugsCliente` e `abertosCliente` são identificadores internos. A troca de rótulo não exige, por si, renomear o contrato.
- A aba Status também exibe "% bugs cliente". Está fora deste documento. A pendência abaixo evita duas línguas para a mesma conta, sem especificar aquela aba.

**Pendências.**

- Frase exata de cada lugar. O KPI é percentual e o card da gestão é contagem de abertos. O pedido troca o núcleo "Bugs Cliente" por "Impacto do Cliente" e não fixa se o percentual continua com "%" nem se o card de abertos conserva a palavra "Abertos".
- Se o termo do cliente substitui a frase inteira ou só o núcleo "Bugs Cliente".
- Se a aba Status acompanha o mesmo termo quando a conta for a mesma. Sem decisão, o Report muda e a outra aba não entra neste requisito.

## RPT-003 — Status dos Cenários em duas linhas, e a mesma leitura em Evoluções

**Estado atual:** parcial. A regra aprovada abaixo ainda não está no código. O card Final. e a coluna Fin. continuam com a conta antiga.

**Objetivo.** Status dos Cenários passa a ter duas linhas, com Finalizados e Pendentes definidos. A Evoluções usa a mesma conta e a mesma ordem do detalhe.

**Comportamento esperado.**

A seção Status dos Cenários fica em duas linhas, nesta ordem:

1. Total, Planejados, Finalizados e Pendentes.
2. Passed, N/A, Falha, Bloqueado, Liberado, Não liberado e Design.

- Total é o total de Test Points do plano, hoje o card TTL CT's. A soma das sete colunas do detalhe é esse Total.
- Planejados é o número que hoje está no card CT's Plan e na coluna Plan: planejado até hoje. Este requisito não troca essa conta.
- Finalizados e a coluna Fin. da Evoluções usam a regra aprovada, para o mesmo conjunto de pontos.
- Pendentes aparece na primeira linha. Falha, Bloqueado, Liberado, Não liberado e Design aparecem na segunda e entram em Pendentes pela diferença Total − Finalizados.
- Na Evoluções, as colunas de detalhe seguem a segunda linha. Não liberado fica antes de Design. Hoje a tabela mostra Design e depois Não Lib.
- Passed no detalhe continua sendo só outcome `passed`. N/A continua sendo só outcome `notapplicable`.

**Regra de negócio aprovada.**

- Finalizados = Passed + N/A.
- Pendentes = Total − Finalizados.
- Cada Test Point segue em uma coluna do detalhe. Passed e N/A compõem Finalizados e não entram de novo em Pendentes.
- A regra de coluna continua `classifyExecution`. Não há status novo. Passed com Test Case aberto continua Passed (ADR 002).
- O gráfico Planejado Vs Realizado já conta realizado como Passed + N/A. A regra aprovada de Finalizados coincide com essa conta.

**O código ainda calcula de outro modo.** `totalRealizadoLinha` soma Passed + N/A + cancelados e alimenta o card Final., a coluna Fin., % REAL, GAP e o rosto STATUS. Enquanto não houver implementação, a tela continua nessa conta. A regra aprovada não substitui o código por estar escrita aqui.

Quando a regra aprovada passar a valer, estes indicadores mudam porque o finalizado deixa de incluir os cancelados legados:

| Indicador | Fórmula em vigor no código | Efeito da regra aprovada |
|---|---|---|
| % REAL | (Passed + N/A + cancelados) ÷ total de CTs | O numerador passa a ser só Passed + N/A. O percentual cai na medida dos cancelados que hoje entram nele |
| GAP | planejado até hoje − (Passed + N/A + cancelados) | A subtração deixa de abater os cancelados. O GAP sobe nessa quantidade. Os limiares do rosto (GAP > 0 atenção, GAP > 3 atrasado) podem mudar de faixa por causa desse aumento |
| STATUS | "Finalizado" quando finalizados cobrem o total; o GAP do rosto usa a mesma soma com cancelados. "Não se aplica" quando todos os CTs são N/A | "Finalizado" passa a exigir que Passed + N/A cubram o total. O GAP usado no rosto é o da linha de cima. O critério "Não se aplica" não usa cancelados e permanece |

% PLAN não usa finalizados. A repartição pelos dias úteis permanece a do ADR 003.

**Cancelados legados, à parte.**

- `cts_cancelados` vem da planilha legada. Não é outcome do Azure e não é uma das sete colunas. Na Evoluções o cabeçalho atual é "Ress." ("CTs com ressalvas").
- Total da regra aprovada é a soma das sete colunas. Não inclui cancelados. Pendentes = Total − Finalizados também não inclui cancelados.
- Na linha em que a quantidade legada entra, a coluna Fin. de hoje menos (Passed + N/A) é exatamente `cts_cancelados`. Essa diferença é divergência de contagem, não um status oculto.
- Cancelados não completam Finalizados nem Pendentes para fechar com a coluna Fin. antiga. Somá-los em Pendentes faria Pendentes deixar de ser Total − Finalizados.

**Critérios de aceite.**

- A primeira linha do painel mostra, nesta ordem, somente Total, Planejados, Finalizados e Pendentes.
- A segunda linha mostra, nesta ordem, somente Passed, N/A, Falha, Bloqueado, Liberado, Não liberado e Design.
- Finalizados = Passed + N/A. Pendentes = Total − Finalizados.
- A soma do detalhe é o Total. Nenhum ponto Failed ou Blocked entra em Finalizados.
- Fin. de cada linha da Evoluções = Passed + N/A daquela linha, e a soma das linhas é o Finalizados do painel, no mesmo plano.
- Na Evoluções, Não liberado aparece antes de Design.
- Numa linha com cancelados legados, Finalizados e Pendentes não aumentam nessa quantidade. A diferença entre a Fin. ainda produzida pelo código atual e a Finalizados aprovada é o `cts_cancelados` da linha.
- Antes da implementação, % REAL, GAP e STATUS observados na aplicação continuam os da fórmula com cancelados. O aceite da regra nova vale para a versão que a implementar, não para o build atual.

**Dependências técnicas.**

- `totalRealizadoLinha`, `statusEvolucao` e o card Final. ainda recebem Passed + N/A + cancelados.
- `isRealizado` no gráfico não soma cancelados.
- O painel atual é uma grade só, sem card N/A nem card Pendentes, e com Design antes de Não Lib. N/A aparece na Evoluções, na pizza Status das Execuções e dentro do card Final.
- A soma das sete colunas = total de Test Points (ADR 002).
- A aba Status usa a mesma noção de finalizado para % real e GAP da frente. O efeito lá fica fora deste documento.

**Pendências.**

- Se a coluna Ress. permanece na Evoluções como contagem separada de `cts_cancelados`. A regra aprovada não a absorve em Finalizados nem em Pendentes.
- A aba Status não foi incluída nesta troca de fórmula.

## RPT-004 — Responsáveis e ofensores configuráveis

**Estado atual:** parcial.

**Objetivo.** Responsável e ofensor do Report são configuração do projeto. O conjunto inicial pode crescer. A classificação não fica presa a Foursys, Cliente e Reteste.

**Comportamento esperado.**

- O projeto configura categorias de responsável/ofensor.
- O conjunto inicial disponível é: Dev Backend, Dev Frontend, Dev Mobile, PO, Cliente, Parceiro, Negócio, Infra/Ambiente, QA e Outros.
- O administrador da configuração pode incluir categoria além dessa lista.
- Indicadores, pizzas e cards do Report que repartem por responsável usam as categorias configuradas, não os três baldes fixos.
- Categoria sem dado aparece com zero ou fica oculta conforme a apresentação configurada. Não é apagada da configuração por estar zerada.
- Outros é uma categoria configurada. Não é o destino automático do que não casou. O não classificado fica em RPT-006.

**Regra de negócio.**

- Hoje o Report parte o mundo em textos fixos: `Desenvolvimento Foursys`, `Cliente CVP`, `Outros`, e, nos cenários impactados, os baldes Foursys / Cliente / Reteste por texto contido ("foursys", "cliente", "cvp").
- "Em ReTestes" na Gestão de Impactos é bug sem fechamento com estado `Resolved`. Não é a categoria Reteste do KPI. A lista inicial não tem categoria Reteste. As duas ideias não se fundem.
- O mapa `SYNC_RESPONSABILIDADES` continua sendo ambiente, não tela, até esta configuração existir. Ele traduz categoria do Azure em texto livre. Não conhece Dev Backend, Dev Frontend nem as demais categorias da lista.

**Critérios de aceite.**

- É possível gravar, para um Test Plan, as dez categorias iniciais e mais uma categoria criada no projeto.
- O Report desse plano não exige os rótulos Foursys, Cliente CVP nem Reteste para exibir a repartição.
- Um plano ainda não configurado não passa a mostrar as dez categorias com números zerados atribuídos por adivinhação aos bugs atuais.
- Incluir uma categoria não reclassifica sozinho os registros já gravados.
- O card "Em ReTestes" não muda de significado quando a lista de ofensores é gravada.

**Dependências técnicas.**

- Filtros exatos em `gestaoImpactos` e `bugsPainel`: `Desenvolvimento Foursys`, `Cliente CVP`, `Outros`.
- `classifyBugs` e `classificarImpactosKpi` usam texto contido, não a lista nova.
- Não há tabela de categorias nem tela para editá-las.
- `responsavel` da falha é texto produzido no sync. Não é usuário do FourQA.

**Pendências.**

- Correspondência entre os textos atuais (`Desenvolvimento Foursys`, `Cliente CVP`, `Outros`, balde Reteste) e a lista nova. Sem essa correspondência, trocar o rótulo reclassificaria ou esconderia número.
- Se Dev Backend, Dev Frontend e Dev Mobile substituem o único "Bugs Abertos DEV" ou se convivem com ele até o mapeamento existir.
- Se categoria nova exige mapeamento de campo (RPT-005) antes de aparecer com valor.
- Quem configura na demonstração, enquanto não houver papel de administrador.

## RPT-005 — Mapeamento dos campos disponíveis para as categorias

**Estado atual:** parcial.

**Objetivo.** A categoria configurada recebe o valor de um campo que a fonte externa realmente oferece. O Report não presume que o atributo desejado exista no Azure.

**Comportamento esperado.**

- A configuração escolhe, entre os campos disponíveis na fonte daquele plano, qual alimenta cada categoria.
- Campo ausente na fonte não é tratado como categoria preenchida.
- O que a fonte não devolve permanece não classificado (RPT-006) ou sem indicador (RPT-008), conforme o caso.
- O mapa é do plano. Outro plano, outra fonte ou outro processo do Azure pode ter outros campos.
- Jira/Xray, Zephyr e OpenText ALM Octane não são fontes desta entrega. O mapeamento não exige o catálogo de campos dessas ferramentas.

**Regra de negócio.**

Campos que o sync de fato pede ou grava hoje:

| Uso no Report | O que o Azure fornece hoje | Situação no produto |
|---|---|---|
| Status do cenário | outcome do Test Point; estado do ponto; `System.State` do Test Case | Gravado e usado por `classifyExecution` |
| Título, tags, ids, datas, quem executou | `System.Title`, `System.Tags`, ids de ponto, caso, run e result, `dateCompleted`, `runBy`, `lastUpdatedDate` | Gravados. `run_by` não define responsável do Report |
| Prioridade do Test Case | `Microsoft.VSTS.Common.Priority` | Lida no sync. Não é coluna do snapshot SQL |
| Bug | `System.WorkItemType`, `System.Title`, `System.State`, `System.CreatedDate`, `System.Tags`, `Microsoft.VSTS.Common.ClosedDate`, id | Gravados em `falhas` |
| Created By e Assigned To | pedidos no lote de bugs | Não são colunas da falha. Não classificam o Report |
| Categoria | campo cujo nome exibido é "Categoria da Falha" ou "Categoria Falha" | Usado só se a definição existir no processo. Senão a categoria fica vazia |
| Ambiente | campo "Ambiente" ou "Environment"; senão a tag `V3Online` vira o texto `V3` | Gravado em `ambiente`. A tag é inferência de um projeto, não campo garantido |
| Responsável da falha | não é campo do Azure | Texto do mapa `SYNC_RESPONSABILIDADES` a partir da categoria |

Impacto numérico do bug é a quantidade de frentes ou pontos ligados no FourQA, não um campo do Azure.

**Critérios de aceite.**

- A lista de campos oferecida para mapeamento contém somente campos que a fonte daquele plano devolveu ou que já estão persistidos a partir dela.
- Assigned To, Created By e prioridade do Test Case não aparecem como disponíveis para classificar enquanto não forem persistidos.
- Se o processo do Azure não tem "Categoria da Falha" nem "Categoria Falha", a categoria do bug fica vazia e nenhuma categoria da lista de RPT-004 recebe esses bugs por suposição.
- Gravar um mapeamento para um campo inexistente não preenche a categoria.
- Dois planos com conjuntos diferentes de campos customizados não compartilham um mapa único obrigatório.

**Dependências técnicas.**

- A descoberta atual é `findFieldReference` em `falhas.ts`, limitada àqueles apelidos.
- O snapshot não guarda o catálogo de campos do processo, só os valores já mapeados no código.
- Não há tela de mapeamento.

**Pendências.**

- Se "disponível" significa campo listado pela API de definição do processo, campo já persistido no snapshot, ou ambos.
- Se o mapeamento aponta para o valor bruto do campo ou para uma tabela de de-para (valor do Azure → categoria do FourQA). O mapa de ambiente atual é um de-para; a tela ainda não existe.
- O que acontece com o fallback `V3Online` → `V3` quando houver mapeamento explícito do campo Ambiente. Não decidido. Esse campo descreve onde o problema ocorreu. Não classifica o ofensor Infraestrutura/Ambiente (RPT-008).

## RPT-006 — Cenários impactados por responsável

**Estado atual:** parcial.

**Objetivo.** A seção Cenários Impactados Por Responsáveis acompanha as categorias configuradas, com totais que fecham e com registro não classificado visível.

**Comportamento esperado.**

- Os cards deixam de ser os quatro fixos Foursys, Cliente, Reteste e Total.
- Há um indicador por categoria configurada que tenha regra de classificação, mais o total, mais o grupo de não classificados.
- A soma dos classificados e dos não classificados é igual ao total de cenários impactados do plano.
- Nenhum ponto failed ou blocked desaparece da soma.
- Não classificado não é lançado em Outros, em Reteste nem em qualquer outra categoria sem regra que o diga.
- O total exibido ao lado do título (RPT-007) é o mesmo total desta seção.

**Regra de negócio.**

- Cenário impactado, na regra atual, é Test Point com outcome `failed` ou `blocked`. O total do card é essa contagem (`impactoTotalTestPoint`).
- Cada ponto entra em no máximo um balde nas duas regras atuais, e o que não casa com Foursys ou Cliente cai em Reteste. Por isso a soma Foursys + Cliente + Reteste tende a igualar o total, e o não classificado fica invisível dentro de Reteste.
- As duas regras não são iguais. O KPI armazenado usa o bug aberto mais recente do último run/result e só existe para `SYNC_KPI_PLAN_KEY`. O fallback casa bug aberto por tag, frente ou prefixo de título. O Report prefere o armazenado.
- Esta seção conta Test Points. A Gestão de Impactos conta bugs. As duas totais não precisam ser iguais, e o Report não apresenta uma como se fosse a outra.
- Uma regra só deve produzir o número. Enquanto as duas coexistirem, o plano sem KPI armazenado não mostra a mesma classificação do plano que tem.

**Critérios de aceite.**

- Com categorias configuradas e mapeadas, a seção mostra essas categorias, o não classificado e o total.
- Para o plano exibido, classificados + não classificados = total de Test Points failed e blocked.
- Um ponto cujo responsável não casa com nenhuma categoria aparece em não classificados e em nenhuma categoria.
- O valor de cada categoria não muda quando só o nome exibido muda.
- O número não usa o balde Reteste como resto, salvo se uma categoria configurada se chamar assim e tiver regra própria. A lista inicial de RPT-004 não tem essa categoria.

**Dependências técnicas.**

- `ImpactResponsaveisPanel.tsx` tem variantes fixas `foursys`, `cliente`, `reteste`, `total`.
- `readStoredKpi` lê só `foursys`, `cliente` e `reteste`. `semResultadoMapeado` existe no cálculo do sync e não chega à tela; esses pontos já foram somados em Reteste.
- Responsável do bug usado na classificação é o texto do mapa de categorias, não Assigned To.

**Pendências.**

- Se a população permanece "Test Point failed ou blocked" ou passa a ser bug. O pedido diz "cenários impactados". A implementação atual usa Test Point. Trocar para bug seria outra conta. Sem decisão nova, o aceite acima conserva o Test Point.
- Qual das duas regras atuais é a base quando o mapeamento novo ainda não existir.
- Se não classificado inclui ponto sem bug ligado, bug sem categoria, categoria sem de-para, e ponto cujo bug aberto não é o mais recente. São casos diferentes no código de hoje.
- Rótulo visível do grupo não classificado.

## RPT-007 — Totais junto aos títulos das seções

**Estado atual:** parcial.

**Objetivo.** O total de cada seção do Report fica junto do título, no mesmo tratamento visual.

**Comportamento esperado.**

- Onde a seção já tem um total definido, esse número aparece ao lado do título.
- A mudança é de apresentação. Não altera fórmula, população nem arredondamento.
- Seções que já usam o chip de total no cabeçalho do gráfico servem de referência visual: texto "Total:" e o valor, no mesmo bloco do título.
- O total do título e o total dentro da seção são o mesmo número.

**Regra de negócio.**

Situação atual:

| Seção | Total junto ao título | Total que já existe em outro lugar |
|---|---|---|
| Status das Execuções | Sim. Soma das fatias | Centro da pizza, "CTs" |
| Frentes, Status dos Defeitos, Categoria | Sim, em cada pizza | Centro da pizza, "Bugs" |
| Planejado Vs Realizado | Dois chips, Planejado e Realizado, não um Total único | — |
| Status dos Cenários | Não | Cards, entre eles TTL CT's |
| Cenários Impactados Por Responsáveis | Não | Card Total |
| Evoluções | Não | Rodapé Valores Totais |
| Gestão de Impactos (título da seção) | Não | Card Total de Bugs |
| Faixa de KPIs | Não há título de seção | Oito indicadores sem um total único |

A pizza de Frentes só é renderizada se alguma fatia é maior que zero. As outras pizzas da gestão aparecem mesmo zeradas, com "Sem bugs abertos." O chip de total zerado já existe nesse caso.

**Critérios de aceite.**

- Status dos Cenários, Cenários Impactados Por Responsáveis, Evoluções e Gestão de Impactos mostram, junto ao título, o total que a seção já calcula.
- Esse número é igual ao total já exibido no card, no rodapé ou na soma correspondente, para o mesmo plano e o mesmo refresh.
- Status das Execuções e as pizzas da gestão conservam o total no título.
- Nenhum aceite deste requisito muda Passed, N/A, GAP, % PLAN ou a repartição por responsável.

**Dependências técnicas.**

- O padrão visual existente é `chart-head` + `chart-chip` em `ReportCharts.tsx` e `GestaoImpactosPanel.tsx`.
- O rodapé da Evoluções soma no frontend as linhas já filtradas, excluindo a linha legada "Valores Totais". O título deve usar essa mesma soma, não uma segunda agregação.

**Pendências.**

- Qual número fica no título quando a seção tem mais de um total. Casos em aberto: Planejado Vs Realizado (dois chips); Evoluções (um total por coluna no rodapé); Status dos Cenários (TTL CT's e, depois do RPT-003, Finalizados e Pendentes); faixa de KPIs (sem total único).
- Se o card Total de Cenários Impactados permanece depois que o total estiver no título.
- Se o rodapé Valores Totais permanece depois que o total da Evoluções estiver no título. O pedido é padronizar o título, não remover o rodapé.

## RPT-008 — Infraestrutura/Ambiente na Gestão de Impactos

**Estado atual:** não implementado.

**Objetivo.** A Gestão de Impactos pode mostrar o ofensor Infraestrutura/Ambiente quando essa responsabilidade estiver identificada por regra própria. O campo Ambiente, que diz onde o problema ocorreu, não faz essa classificação.

**Comportamento esperado.**

- Campo Ambiente e categoria Infraestrutura/Ambiente permanecem conceitos distintos.
- Ambiente descreve o lugar do problema. É o valor gravado em `falhas.ambiente`.
- Infraestrutura/Ambiente identifica o ofensor. É a categoria de responsabilidade de RPT-004, preenchida só pelo mapeamento de responsável de RPT-005.
- Um bug não entra na responsabilidade Infraestrutura/Ambiente porque o campo Ambiente está preenchido, porque o valor do ambiente é um texto conhecido, ou porque a tag `V3Online` produziu "V3".
- Com a categoria de ofensor mapeada para o plano, a Gestão de Impactos exibe o indicador dessa responsabilidade, com a população e o rótulo da regra gravada.
- Sem esse mapeamento de ofensor, a seção não exibe indicador de Infraestrutura/Ambiente, nem zero apresentado como medição. A presença do campo Ambiente não liga o indicador.

**Regra de negócio.**

- `ambiente` na falha hoje é: valor do campo "Ambiente" ou "Environment", se o processo tiver esse campo e o bug tiver valor; senão, tag `V3Online` produz "V3"; senão, vazio. Isso registra onde ocorreu. Não escolhe ofensor.
- A categoria de responsabilidade continua vindo do mapa categoria do bug → responsável. Não vem do campo Ambiente.
- A tela de Falhas mostra a coluna Ambiente. A Gestão de Impactos do Report não tem card, pizza nem filtro de ambiente, nem indicador do ofensor Infraestrutura/Ambiente.
- As cores fixas de frente (GEATE, GEDEV, GEFEA, GEFIS, GEMCO, GERORJ, GERSA, GESIN) são apresentação de um projeto. Não identificam ambiente nem infraestrutura.

**Critérios de aceite.**

- Bug com Ambiente preenchido e sem ofensor mapeado para Infraestrutura/Ambiente não entra nessa responsabilidade.
- Plano em que o único sinal é a tag `V3Online`: Ambiente pode constar como "V3", e a Gestão de Impactos não mostra o ofensor Infraestrutura/Ambiente.
- Plano sem mapeamento da categoria de responsabilidade Infraestrutura/Ambiente: a Gestão de Impactos não contém esse indicador, mesmo que `falhas.ambiente` tenha valor.
- Plano com a categoria de ofensor mapeada por RPT-005: o indicador aparece e conta só o que a regra de responsável classificou. O valor de Ambiente não entra nessa conta.
- O card "Bugs Abertos Outros" não passa a se chamar Infra/Ambiente por causa deste requisito.

**Dependências técnicas.**

- `resolveEnvironment` em `falhas.ts` e a coluna `falhas.ambiente`, somente como lugar do problema.
- Categoria Infraestrutura/Ambiente da lista de RPT-004, ainda sem mapa de responsável.

**Pendências.**

- Forma do indicador do ofensor: card ou fatia. Não decidido.
- População desse indicador: bugs, bugs abertos, ou Test Points impactados. A gestão atual conta bugs. Sem decisão, não se escolhe outra população.
- Exibir o campo Ambiente como descrição do lugar, na Gestão de Impactos, não está decidido. Uma quebra por valor de Ambiente não classifica ofensor e não faz parte deste indicador.

## RPT-009 — Edição do Report sem confundir nome e fórmula

**Estado atual:** parcial.

**Objetivo.** A configuração futura do Report reutiliza a experiência de edição já existente. O nome exibido não é gravado como se fosse a fórmula.

**Comportamento esperado.**

- Nome de KPI, termo do cliente e nome de categoria editam-se com o mesmo tipo de interação do título do Report: abrir a edição, rascunho, salvar, cancelar, validação e erro.
- Salvar um nome grava o nome. A fórmula, a fonte e o filtro permanecem os que já estavam.
- Alterar a fórmula é outro passo, perceptível como mudança de cálculo, não como campo de título.
- Cancelar descarta o rascunho e mantém o valor anterior na tela e na base.
- Título vazio não grava, como já ocorre com o título do projeto.

**Regra de negócio.**

Edição que já existe no Report:

| Controle | O que grava | Efeito no cálculo |
|---|---|---|
| Lápis do título e do subtítulo (`ReportTitles.tsx`, `PUT /api/cabecalho`) | `cabecalho_titulo` e `cabecalho_subtitulo` | Nenhum. Texto padrão, se vazio: "STATUS REPORT QA" e o subtítulo de um engajamento. Título limitado a 200 caracteres; subtítulo a 300. Título em branco é recusado |
| Período no cabeçalho da página (`PUT /api/periodo`) | `data_inicio` e `data_fim` | Entra em % PLAN, GAP e no gráfico, quando a suíte não tem data própria confirmada |

O período não serve de modelo para "editar nome". Ele altera conta. O modelo de interação é o do título: rascunho explícito, salvar e cancelar. A semântica do período permanece a do ADR 003.

Não há edição de KPI, categoria ou fórmula.

**Critérios de aceite.**

- Dá para alterar o nome exibido de um indicador configurável e cancelar sem persistir.
- Depois de salvar só o nome, a fórmula armazenada é a mesma de antes e o valor numérico não muda por causa do nome.
- A tela de fórmula não é o mesmo campo do nome. Os dois não são um único texto livre interpretado como conta.
- O título do projeto continua editável pelo controle atual, com a mesma validação de título vazio.
- Editar o período continua mudando a base de % PLAN e do gráfico. Esse controle não é reaproveitado como editor de rótulo.

**Dependências técnicas.**

- `ReportTitles.tsx` e `PlanPeriodSyncMeta` no cabeçalho do Report.
- Escrita protegida pelo bearer compartilhado. Sem papéis.
- Não há modelo persistido de indicador com colunas separadas de rótulo e de fórmula.

**Pendências.**

- Se cada nome (KPI, categoria, termo Impacto do Cliente) abre o mesmo popover do título ou uma edição equivalente na própria seção. O pedido é reutilizar a experiência, não copiar o lápis para todos os textos.
- Validação além de "não vazio": duplicidade de nome de categoria, tamanho, e nome igual ao de outra categoria com fórmula diferente. Não decidido.
- Se a fórmula configurável da demonstração é escolhida num conjunto fechado (pendência de RPT-001) ou fica indisponível até esse conjunto existir. Sem o conjunto, este requisito cobre a edição de nome e a separação em relação à fórmula, e não inventa o editor de fórmula.

## Fora deste documento

Não são requisitos do Report nesta etapa, embora a visão de produto os cite: login e papéis, link de visualizador, dashboard inicial por Test Plan, Evolução QA individual, distribuição de planejamento, extensão de navegador, multiempresa e conectores Jira/Xray, Zephyr e OpenText ALM Octane.

A demonstração de curto prazo continua sendo o Report configurável. Estes requisitos não autorizam implementação por si.

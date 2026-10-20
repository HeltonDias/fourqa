# FourQA — Requisitos funcionais do produto

> **Versão documental 1.2 · 20/10/2026** — Preserva os requisitos de Report (RPT-001 a RPT-009), Planejamento (PLN-001 a PLN-019) e Evolução QA (EQA-001 a EQA-010) da v1.1; adiciona especificação funcional e técnica rastreável para EP-06 a EP-12 (US-044 a US-097). **Não autoriza implementação, alterações de banco ou deploy.**

**Escopo nesta edição:** Report, Planejamento, Evolução QA, Status por frente, Execuções, Falhas, integrações/sincronização, dashboard de planos, autenticação/permissões, multiempresa, auditoria/observabilidade, gestão nativa futura de casos/execuções e de bugs. Os itens futuros são **requisitos de horizonte ou discovery**, não promessas de release.

Cada requisito separa o que o código faz hoje do comportamento pedido. Onde a decisão ainda não fecha, o item fica em **Pendências**, sem escolha de solução.

Fontes: `VISION.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, `ROADMAP.md`, auditoria de 15/10/2026, validação da pesquisa aprofundada e arquivos do monorepo TypeScript analisados no ZIP de 20/10/2026. A pesquisa original não é inventário do código. Os testes desta elaboração **não foram executados**.

**Guia de leitura:** (a) linguagem de negócio em **Objetivo / Em palavras simples**; (b) contrato em **Regras e comportamento**; (c) verificações em **Aceite / Testes e segurança**; (d) limitações em **Decisões pendentes**. Os IDs permitem navegar do requisito ao `BACKLOG.md` e aos ADRs, mas não substituem a validação humana.

**Significado de estado:** `Existente` = caminho de implementação observado (não equivale a teste realizado nesta revisão); `Parcial` = parte existe, falta comportamento; `Planejado` = decisão ou objetivo que não consta como implementação; `Adiado` = futuro explícito. Os estados refletem o ZIP, não necessariamente o último commit em homologação.

## Inventário verificado

**Nota histórica importante (v1.2):** o inventário e as descrições de "hoje" dos requisitos RPT-001, RPT-002 e RPT-004 a RPT-009 representam a **linha de base documentada em 16/10/2026**, antes da Etapa 3.1. O RPT-003, nesta edição, separa o comportamento vigente no código do histórico dessa data. **Não assumir que os rótulos e fórmulas dos demais requisitos ainda descrevem o estado atual de todos os módulos.** Status e Planejamento ainda preservam a soma legada com cancelados; ver `DECISIONS.md` e os testes.

**Inventário da versão anterior** (útil para comparação; não é o comportamento alvo).

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

**Estado atual:** implementado no Report e na Evoluções (US-008). A aba Status e o Planejamento continuam com Passed + N/A + cancelados legados. Essa diferença é pendência, não a conta do Report.

**Objetivo.** Status dos Cenários tem duas linhas, com Finalizados e Pendentes definidos. A Evoluções usa a mesma conta e a mesma ordem do detalhe.

**Comportamento vigente.**

A seção Status dos Cenários fica em duas linhas, nesta ordem:

1. Total, Planejados, Finalizados e Pendentes.
2. Passed, N/A, Falha, Bloqueado, Liberado, Não liberado e Design.

- Total é o total de Test Points do plano. A soma das sete colunas do detalhe é esse Total.
- Planejados é o planejado até hoje, o mesmo número do card e da coluna Plan. Este requisito não troca essa conta.
- Finalizados do Report e a coluna Fin. da Evoluções usam `totalRealizadoLinha`: Passed + N/A.
- Pendentes = Total − Finalizados. Falha, Bloqueado, Liberado, Não liberado e Design entram nessa diferença. Cancelados legados não entram.
- Na Evoluções, Não liberado aparece antes de Design. A coluna Ress. permanece depois de Design, como contagem separada de `cts_cancelados`.
- Passed no detalhe continua sendo só outcome `passed`. N/A continua sendo só outcome `notapplicable`.
- % REAL, GAP e o rosto STATUS do Report usam esse Finalizados. % PLAN não usa finalizados e permanece a repartição do ADR 003.
- O gráfico Planejado Vs Realizado continua contando realizado como Passed + N/A.

**Regra de negócio aprovada e em vigor no Report.**

- Finalizados = Passed + N/A.
- Pendentes = Total − Finalizados.
- Cada Test Point segue em uma coluna do detalhe. Passed e N/A compõem Finalizados e não entram de novo em Pendentes.
- A regra de coluna continua `classifyExecution`. Não há status novo. Passed com Test Case aberto continua Passed (ADR 002).

**Ainda na conta anterior.**

- A aba Status usa `finalizadosComCancelados`: Passed + N/A + `cts_cancelados`.
- O Planejamento soma Passed + N/A + cancelados no próprio serviço. Não lê `totalRealizadoLinha`.

**Histórico da especificação de 16/10/2026, antes da Etapa 3.1.** O código daquela data fazia `totalRealizadoLinha` = Passed + N/A + cancelados e usava essa soma no card Final., na coluna Fin., em % REAL, GAP e no rosto STATUS. A regra aprovada ainda não estava implementada. Efeito observado quando a Etapa 3.1 passou a valer no Report:

| Indicador | Fórmula histórica | Efeito vigente no Report |
|---|---|---|
| % REAL | (Passed + N/A + cancelados) ÷ total de CTs | O numerador é só Passed + N/A. O percentual cai na medida dos cancelados que saíram dele |
| GAP | planejado até hoje − (Passed + N/A + cancelados) | A subtração não abate os cancelados. O GAP sobe nessa quantidade e pode mudar a faixa do rosto |
| STATUS | "Finalizado" quando a soma com cancelados cobria o total | "Finalizado" exige que Passed + N/A cubram o total. "Não se aplica" continua quando todos os CTs são N/A |

**Cancelados legados, à parte.**

- `cts_cancelados` vem da planilha legada. Não é outcome do Azure e não é uma das sete colunas.
- Total vigente é a soma das sete colunas. Não inclui cancelados. Pendentes também não.
- Na linha em que a quantidade legada entra, a Fin. histórica menos (Passed + N/A) é exatamente `cts_cancelados`.

**Critérios de aceite.**

- A primeira linha do painel mostra, nesta ordem, somente Total, Planejados, Finalizados e Pendentes.
- A segunda linha mostra, nesta ordem, somente Passed, N/A, Falha, Bloqueado, Liberado, Não liberado e Design.
- Finalizados = Passed + N/A. Pendentes = Total − Finalizados.
- A soma do detalhe é o Total. Nenhum ponto Failed ou Blocked entra em Finalizados.
- Fin. de cada linha da Evoluções = Passed + N/A daquela linha, e a soma das linhas é o Finalizados do painel, no mesmo plano.
- Na Evoluções, Não liberado aparece antes de Design.
- Numa linha com cancelados legados, Finalizados e Pendentes do Report não aumentam nessa quantidade. A aba Status e o Planejamento ainda aumentam.

**Dependências técnicas.**

- `totalRealizadoLinha` alimenta o Report. `finalizadosComCancelados` alimenta a aba Status.
- `isRealizado` no gráfico não soma cancelados.
- A soma das sete colunas = total de Test Points (ADR 002).

**Pendências.**

- Se a coluna Ress. permanece na Evoluções. A regra aprovada não a absorve em Finalizados nem em Pendentes, e a tela atual a mantém no fim.
- A troca da fórmula da aba Status e do Planejamento não faz parte do US-008.

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

## Delimitação do módulo Report

Os itens RPT-001 a RPT-009 acima descrevem exclusivamente o Report. Os requisitos de Planejamento e Evolução QA começam a seguir; nenhum deles deve ser interpretado como funcionalidade implementada por aparecer neste arquivo. A demonstração de curto prazo mantém o Report como prioridade. Estes requisitos não autorizam implementação por si.


---

# Parte II — Planejamento e responsabilidades (EP-04)

> **Para negócio:** o FourQA administra quanto precisa ser executado, por suíte, dia e QA responsável. Os resultados reais continuam vindo do Azure. **Para engenharia:** o baseline é um conjunto confirmado de Test Points, a agenda é quantitativa e revisável, e atribuição pessoal de metas é diferente de atribuir casos no Azure.

## Inventário técnico confirmado (20/10/2026)

| Assunto | Hoje no código | Limite que os requisitos ampliam |
|---|---|---|
| Fonte e identificação | `backend/src/azure/execucoes.ts` obtém suítes e Test Points Azure; `planning_scope_item` mantém membership por revisão | Não confundir `suite_id`, `test_point_id` e nomes de apresentação |
| Baseline | `planning_revision` congela escopo e agenda; `getPlanningView`, `confirmOrRevise` em `backend/src/services/planningService.ts` | Preservar revisões anteriores em todas as evoluções (ADR 004) |
| Agenda | `planning_item` agrupa por suíte, `planning_allocation` guarda quantidade por data | Não existem alocações por QA por dia nem divisão compartilhada |
| Responsável e prioridade | `planning_item.responsavel` e `prioridade` são texto por suíte; `savePlanningCell` aceita `responsavel`, `prioridade`, `day`, `start`, `end` | Não são contas de usuário nem prioridade do Test Case |
| Calendário | A tela usa `onlyWeekdays` e esconde sábados/domingos; `monthKey` permite percorrer meses do período | Ainda não há calendário com fins de semana visíveis/inativos nem seletor de salto livre por mês/ano |
| Distribuição | Edição manual por célula e revisões; **não existe** algoritmo Montanha, Decrescente ou seleção de modo de responsabilidade | Nova operação administrativa sujeita a confirmação, validação e persistência transacional |
| Execução | Snapshot com outcome por Test Point; planejamento ainda soma `Passed + N/A + cancelados legados` para `finalizedCount` | Diverge da nova definição do Report e não é histórico de todas as runs |
| Permissões | Bearer compartilhado; não existem contas/papéis próprios | Admin deve editar; QA intermediário e visualizador não devem modificar planejamento |

**Duas palavras que não podem ser misturadas:** **pendente no Report** = `Total − (Passed + N/A)` e pode conter Failed/Blocked; **não executado para redistribuição** = volume que ainda não teve execução efetiva no escopo considerado. Um Failed pode ser trabalho já executado e ainda não finalizado com sucesso. Não aplicar a fórmula do Report diretamente para decidir quantos testes podem ser redistribuídos sem definir reexecuções, runs e bloqueios (**OPEN-006/007/008**).

### PLN-001 — Escopo por Test Plan, suíte, período e revisão

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04 / FEAT-04.01; ADR 004; DEC-003/015; base transversal US-020–031.

**Objetivo.** Uma edição ou distribuição afeta apenas o plano, período e versão corretos, sem misturar fases distintas de um projeto Azure.

**Comportamento e regras.** Cada agenda pertence à versão confirmada do planejamento; uma revisão antiga permanece consultável. A identidade externa vem de IDs; nome, frente e processo são metadados, não chaves confiáveis. Plano sem baseline confirmado não aceita mutações que dependam de escopo. O seletor de Test Plan futuro precisa garantir separação mesmo com vários planos dentro do mesmo projeto Azure.

**Critérios de aceite.** Dado Plano A e Plano B, editar A não altera B; dado revisão v1 e v2, consultar v1 preserva escopo e quantidades originais; edição rejeitada de baseline não confirmado não altera nenhuma linha; divergências entre fonte e baseline ficam visíveis, sem adoção silenciosa.

**Dependências.** `planning`, `planning_revision`, `planning_scope_item`, `planning_item`, `planning_allocation`, `getPlanningView`, `confirmOrRevise`.

**Pendências.** Modelo de entidade Test Plan configurável quando houver multiempresa; política de versionamento diante de alterações de escopo Azure.

### PLN-002 — Total já planejado ao selecionar o dia

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.01 / FN-04.01.01 / US-020; DEC-020.

**Objetivo.** Quem planeja sabe a soma de testes **já alocados no dia**, antes de adicionar outra quantidade.

**Comportamento e regras.** Ao selecionar/focar uma célula de data em Planejar, mostrar popover discreto com total daquela data no Test Plan/revisão selecionados. Deve refletir as quantidades de **todas as suítes do plano dentro do escopo**, mesmo quando a tabela estiver filtrada, e atualizar após edição confirmada. O total não é capacidade máxima, nem número executado, nem meta de um único QA. Quando houver alocação compartilhada, agregar uma única vez cada parcela por QA, sem contar também a linha pai.

**Critérios de aceite.** Se no dia D existirem 4, 7 e 2 alocações em três suítes, o total exibido é 13; filtrar uma suíte não altera 13; gravar mais 1 torna 14; em revisão histórica o número corresponde à revisão histórica; abrir e fechar o popover não grava nada; teclado e foco funcionam.

**Dependências.** `PlanningGridTable.tsx`, `planningService.ts`, calendário e soma do backend. Teste de escopo/filtragem e ausência de dupla contagem.

**Pendências.** Experiência de atualização enquanto existem células com edição local ainda não salva (mostrar valor persistido e indicar mudanças pendentes).

### PLN-003 — Finais de semana visíveis e controlados

**Estado:** parcialmente implementado (hoje são ocultados). **Rastreabilidade:** EP-04 / FEAT-04.01 / FN-04.01.02 / US-021; DEC-020; OPEN-012.

**Objetivo.** Permitir planejamento excepcional em sábados e domingos sem habilitá-los por acidente.

**Comportamento e regras.** Sábados/domingos aparecem em cinza e inativos por padrão. O **administrador**, após confirmação explícita, pode habilitar o uso de fins de semana para o calendário do Test Plan, bem como desabilitá-lo. A configuração é do calendário/plano, **não é permissão individual do QA**. Desabilitar não pode apagar silenciosamente quantidade já registrada nesses dias; exigir aviso e uma política aprovada para os valores existentes. Feriados e férias não entram nesta versão.

**Critérios de aceite.** Fim de semana aparece visível e inativo no plano novo; edição é rejeitada também na API enquanto inativo; confirmar habilitação permite edição e recusa não muda nada; QA leitor não habilita; desabilitar com valores existentes apresenta aviso e preserva dados, até decisão explícita de tratamento; reiniciar aplicação preserva a configuração.

**Dependências.** Substituir uso de `onlyWeekdays` na grade, persistência de configuração por plano, autorização backend, cenários de calendário e testes de datas.

**Pendências.** Escopo “global” do calendário (global do Test Plan, não automaticamente de todas as empresas) e fluxo aprovado para alocações já existentes ao desativar.

### PLN-004 — Seletor direto de mês e ano

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04 / FEAT-04.01 / FN-04.01.03 / US-022; DEC-020.

**Objetivo.** Navegar rapidamente para qualquer mês elegível do plano, sem passar por todas as semanas.

**Comportamento e regras.** Dar acesso direto a mês/ano por seletor; manter a grade no período de planejamento válido, inclusive meses sem alocação; navegar não grava nem modifica datas de execução. A UI atual já possui `monthKey` e `monthKeys`, mas isso não equivale necessariamente à experiência direta de salto desejada.

**Critérios de aceite.** Escolher dezembro e janeiro atravessa a virada de ano sem erro; meses vazios exibem estado apropriado; voltar ao mês anterior não perde alterações salvas; navegação com alterações ainda não salvas mostra proteção adequada.

**Dependências.** `PlanejamentoPage.tsx`, utilitários de calendário, tratamento de datas locais.

**Pendências.** UX final de seletor de mês/ano e comportamento do período quando o plano não tem data definida.

### PLN-005 — Edição manual segura das quantidades e datas

**Estado:** implementado parcialmente. **Rastreabilidade:** EP-04 / FEAT-04.01; ADR 004.

**Objetivo.** Ajustar cronograma sem corromper metas ou o escopo confirmado.

**Comportamento e regras.** Editar data inicial, final e quantidades diárias somente no baseline válido e versão ativa; bloquear quantidade negativa, fracionária ou não finita; informar quando a soma alocada difere do baseline, sem mascarar inconsistência; preservar leitura de versões antigas. Cada alteração deve ser validada também na API, não apenas na interface.

**Critérios de aceite.** Salvar 0, 1 e 10 válidos produz totais coerentes; -1, 1.5, NaN e dia fora de política são rejeitados sem persistência; usuário leitor recebe erro de autorização; edição de revisão antiga é rejeitada; ao atualizar página, quantidades aprovadas reaparecem.

**Dependências.** `savePlanningCell`, validações de calendário, DTO de planejamento, RBAC futuro. Hoje `savePlanningCell` rejeita negativo/não finito, mas inteiros e todas as restrições futuras devem ser explicitamente verificados na implementação.

**Pendências.** Regras de edição fora do intervalo da suíte, sobrealocação e controle de concorrência entre dois administradores.

### PLN-006 — Baseline, revisões e rastreabilidade da agenda

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.05 / US-031; ADR 004; DEC-022.

**Objetivo.** A equipe explica por que o planejamento mudou sem apagar o plano anterior.

**Comportamento e regras.** Manter baseline congelado em revisões, escopo de IDs, datas, quantidades e motivo. A adoção de novos pontos do Azure é decisão explícita. Toda distribuição que substitui agenda cria/relaciona uma revisão auditável. Futuramente trilha de quem/antes/depois sem expor segredo ou PII desnecessária; até existir identidade não inventar autor humano.

**Critérios de aceite.** Revisão v2 não altera v1; alteração de escopo Azure sem confirmação não aumenta baseline; histórico mostra motivo/origem e o antes/depois viável; falha na gravação não deixa revisão parcial; histórico de execuções reais não é reescrito pela revisão.

**Dependências.** `planning_revision`, `planning_scope_item`, persistência SQL/Postgres, transações, futuro EP-10.

**Pendências.** Estratégia de evento por célula, autoria até login/RBAC, retenção e granularidade.

### PLN-007 — Prioridade da suíte versus prioridade do cenário

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04 / FEAT-04.04 / FN-04.04.01–02 / US-032–033.

**Objetivo.** Não confundir prioridade definida pela coordenação com prioridade de um Test Case no Azure.

**Comportamento e regras.** Suíte possui prioridade manual **1, 2 ou 3** (aprovada pelo admin); o cenário recebe sua prioridade da fonte externa `Microsoft.VSTS.Common.Priority`, sem herdar artificialmente a da suíte. O texto atual de `planning_item.prioridade` precisará validar domínio e preservar legado com valores fora da enumeração até migração aprovada.

**Critérios de aceite.** Admin grava 1/2/3; 0, 4 e texto inválido são rejeitados para dados novos; prioridade Azure diferente continua diferente; quando a prioridade externa não existe, mostrar indisponível em vez de usar prioridade da suíte; histórico não perde a escolha de versões antigas.

**Dependências.** `savePlanningCell`, `readCasePriority` em `backend/src/azure/execucoes.ts`, persistência `case_priority` ainda ausente no snapshot PostgreSQL (auditoria).

**Pendências.** Política de migração de prioridade histórica em texto livre e interface de ordenação por prioridade.

### PLN-008 — Cadastro e visualização de responsável principal por suíte

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.01 / US-027; DEC-013.

**Objetivo.** Cada suíte tem um QA principal visível como referência de responsabilidade operacional.

**Comportamento e regras.** Responsável principal é definido no FourQA, não pelo `Assigned To` ou `run_by` do Azure. Mantê-lo por padrão em qualquer redistribuição. Identificar responsáveis de forma estável quando houver contas, evitando correspondências apenas por nome livre; até então o campo existente é texto e não representa usuário autenticado. Admin define e muda; QA intermediário consulta.

**Critérios de aceite.** Principal aparece em Acompanhamento e Planejar; sync Azure não troca responsável; redistribuição padrão conserva o mesmo principal; leitor não altera; mudanças autorizadas preservam a trilha/a versão.

**Dependências.** `planning_item.responsavel`, `PlanningAcompanhamentoTable.tsx`, `PlanningGridTable.tsx`, RBAC e identidade futuros.

**Pendências.** Cadastro/catálogo dos QAs e tratamento de nomes homônimos/renomeação.

### PLN-009 — Modal administrativo de distribuição automática

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.02 / FN-04.02.01–04 / US-023–026; DEC-014/015/016.

**Objetivo.** Substituir planejamento manual de pendências por distribuição assistida, sem operação invisível.

**Comportamento e regras.** Botão **Distribuição automática** na aba Planejar (separado do botão **Atualizar** da sincronização Azure). Abrir modal com fundo escurecido, explicações e escolha do perfil Montanha (padrão) ou Decrescente; escolher o modo de responsabilidade (manter atuais por padrão / transferir suítes inteiras / compartilhar quantidades); mostrar escopo, período, total ainda não executado e aviso de substituição de alocações não executadas. Nenhuma gravação ao abrir ou ajustar opções. Cancelar é sem efeito. **Crescente não entra agora.** Simulador avançado fica adiado.

**Critérios de aceite.** Abrir/fechar modal não modifica DB; seleção padrão mantém responsáveis e Montanha; caso não haja pendentes, modal informa e não produz alocação artificial; confirmar exige confirmação explícita se houver agenda substituível; leitor não vê ação de edição e requisição direta é rejeitada.

**Dependências.** UI do Planejar, endpoints próprios, autenticação administrativa futura, serviço transacional e testes de cancelamento.

**Pendências.** Contrato exato do resumo pré-confirmação e como demonstrar impacto por suíte/QA sem construir simulação completa.

### PLN-010 — Distribuição Montanha por período remanescente

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.02 / FN-04.02.01 / US-023; DEC-014; OPEN-008.

**Objetivo.** Aumentar gradualmente metas diárias até um pico perto do centro do prazo restante e diminuí-las até o final.

**Comportamento e regras.** Considerar **somente dias habilitados a partir da data de redistribuição e até o prazo aplicável**, não reaplicar curva sobre dias passados. A forma desejada é montanha, com volumes reduzidos no início/fim e pico próximo à metade dos dias elegíveis, sem impor um zero quando impossível. Os testes são quantidades inteiras; respeitar soma total pendente e limites efetivos de responsabilidade, sem dividir Test Points específicos. O comportamento deve ser determinístico para os mesmos dados/opções.

**Critérios de aceite.** Para períodos usuais (ex.: sete dias elegíveis) a distribuição apresenta pico próximo ao meio; todos os valores são inteiros e não negativos; somatório por dia e suíte fecha exatamente o volume pendente, inclusive totais 1/2/3; nenhum sábado/domingo inativo recebe novos valores; período de 0/1/2 dias tem tratamento controlado, sem exceção ou perda de testes; mesmo input produz mesma agenda.

**Dependências.** Algoritmo isolável, `planning_allocation`, disponibilidade de dias, regra de pendência PLN-012, revisão e testes de propriedades.

**Pendências.** Pesos matemáticos, data de referência, tratamento de prazo vencido, empate e pico exato requerem ADR antes de codificar (**OPEN-008**). Não apresentar uma fórmula arbitrária como decisão aprovada.

### PLN-011 — Distribuição Decrescente, opcional

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.02 / FN-04.02.02 / US-024; DEC-014.

**Objetivo.** Concentrar parte maior do trabalho pendente nos primeiros dias restantes quando o admin escolher esse perfil.

**Comportamento e regras.** Usar mesmo escopo, permissões, transação, direitos e preservação de histórico do perfil Montanha. A curva deve tender a diminuir com o tempo, respeitando totais inteiros e os dias elegíveis. Não criar perfil Crescente nesta fase.

**Critérios de aceite.** Quantidades por dia seguem perfil decrescente quando possível; soma fecha e não fica negativa; planos com poucos pontos/dias tratam empates sem número artificial; cancelar não grava; alternar perfil muda somente proposta de alocação, não execuções ou owners.

**Dependências.** PLN-009/010/012/016, algoritmo testável.

**Pendências.** Pesos exatos e regra de empate/empacotamento inteiros (OPEN-008).

### PLN-012 — Quantidades redistribuíveis e execuções intocáveis

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.02 / FN-04.02.03 / US-025; DEC-015; OPEN-006/007.

**Objetivo.** Redistribuir **somente o trabalho ainda não executado**, sem apagar trabalho efetivamente realizado.

**Comportamento e regras.** Apurar pendência elegível por suíte no baseline confirmado usando fonte confiável de execuções e temporalidade adequada. Execução Failed **pode representar trabalho realizado**, apesar de seguir pendente de conclusão no Report; por isso `Total − (Passed+N/A)` não é automaticamente o volume para distribuir. Não sobrescrever outcomes, runs, data de execução, autora/autor ou histórico real, nem datas confirmadas de parcelas já executadas quando rastreáveis. Somente alocações referentes ao saldo redistribuível podem mudar após confirmação. Não manipular `Assigned To` no Azure.

**Critérios de aceite.** Exemplo de suíte com 5 cenários e 3 execuções efetivas inequivocamente identificadas: redistribuem-se apenas 2; as 3 execuções e suas datas permanecem; suíte sem saldo gera 0; falha de sync/resultado ambíguo impede recalcular como se não houvesse execução; Failed não é automaticamente somado ao saldo redistribuível só por não ser Finalizados no Report.

**Dependências.** Snapshot por ponto, resultado/histórico Azure, ADR 004, semântica de executado/reexecutado, consistência do sync.

**Pendências bloqueadoras.** Como distinguir cenário executado, falhado, bloqueado, reexecutado e data consolidada quando o snapshot mantém último estado; política para execuções tardias; relacionamento com cancelados legados (**OPEN-006/007**). Não codificar aproximação silenciosa.

### PLN-013 — Modo padrão: manter responsáveis e equilibrar dias

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.01 / US-027; DEC-013/016; OPEN-008.

**Objetivo.** Distribuir a agenda conservando cada suíte com seu QA principal.

**Comportamento e regras.** No modo padrão, não mudar titular nem atribuir colaboradores. Equilibrar a carga diária **na medida possível** dentro das suítes já atribuídas, respeitando formato global Montanha/Decrescente, pendência real e dias habilitados. Não prometer igualdade entre QAs com quantidades de suítes muito distintas.

**Critérios de aceite.** Para qualquer suíte, responsável antes/depois é o mesmo; soma por QA equivale ao saldo de suas suítes; total diário geral segue perfil escolhido dentro da restrição; nenhum QA recebe quantidade de suíte que não lhe pertence; quando equilíbrio perfeito é inviável, totais continuam íntegros e UI não alega igualdade.

**Dependências.** PLN-008/009/010/012; agregação por QA e regras de balanceamento.

**Pendências.** Objetivo matemático do balanceamento diário (desvio, teto, pesos) e comportamento com QA sem suíte.

### PLN-014 — Modo explícito: transferir suítes inteiras

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.02 / US-028; DEC-016.

**Objetivo.** Equilibrar volume total autorizando que uma suíte completa mude de QA principal.

**Comportamento e regras.** Admin seleciona o modo, confirma mudanças de responsabilidade e o sistema move **suítes completas**, sem dividir seus casos entre QAs. Ex.: João tem 100 em duas suítes (60+40) e Cláudia tem 20; transferir a suíte de 40 permite 60/60. Transferência modifica a responsabilidade **no FourQA**, não Assigned To no Azure; preservar trilha e responsáveis anteriores nas revisões.

**Critérios de aceite.** A suíte movida possui um só principal após a transferência; não há alocação parcial de casos; sem selecionar o modo o principal não muda; cancelar não modifica titular; totais por QA e total geral permanecem conservados; auditar antes/depois.

**Dependências.** Modelagem de responsáveis estáveis, UI confirmação, serviço transacional, identidade e revisão.

**Pendências.** Se o modo redistribui colaboradores anteriores de uma suíte já compartilhada; regra para restrições de disponibilidade.

### PLN-015 — Modo explícito: compartilhar quantidades por QA

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.03 / US-029; DEC-016/017; OPEN-001.

**Objetivo.** Permitir apoio de vários QAs na mesma suíte, definindo metas quantitativas individualizadas.

**Comportamento e regras.** Preservar **responsável principal** e adicionar N colaboradores sem limite artificial de dois. Registrar quantidades planejadas por **QA + suíte + data + revisão**, identificando participação principal/colaborador; **não relacionar essas quantidades a Test Case/Test Point específico** nem editar `Assigned To` no Azure. Ex.: João tem 60 pendentes da suíte Pagamentos e Cláudia 20 em outra; permitir 40 Pagamentos João + 20 Pagamentos Cláudia → totais por QA 40/40. Uma mesma suíte pode ter, por exemplo, João 30, Cláudia 20 e Mariana 10, total 60.

**Critérios de aceite.** Pai de uma suíte com 60 representa exatamente 60, filhos 30+20+10 = 60; metas por dia também fecham; principal é mantido; colaborador não recebe pontos IDs nem alterações Azure; sem autorização explícita nenhuma suíte vira compartilhada; nomes repetidos de QA exigem identidade distinguível.

**Dependências.** Novo modelo persistente de participantes e metas quantitativas por QA, integridade de total, versões, conciliação futura com Evolução QA.

**Pendências bloqueadoras para EVOLUÇÃO (não para registrar metas):** quem recebe crédito factual por execução não pode ser determinado automaticamente a partir do rateio numérico (**OPEN-001**). Não afirmar que compartilhamento quantitativo resolve atribuição factual.

### PLN-016 — Apresentação expansível da suíte com QAs envolvidos

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.03 / FN-04.03.04 / US-030; DEC-017.

**Objetivo.** O QA descobre suas responsabilidades na própria tela Planejar, sem depender da Evolução QA.

**Comportamento e regras.** Linha pai exibe suíte, responsável **Principal**, nomes de colaboradores de forma visível mesmo recolhida e, se útil, indicador “N QAs envolvidos”. Chevron expande linhas por pessoa com quantidade total e alocação em cada data; valor do pai é agregado e não soma novamente com os filhos. O modo leitor vê tudo sem botões de edição; admin poderá editar metas permitidas.

**Critérios de aceite.** Suíte “Pagamentos” recolhida exibe “João · Principal” e “Cláudia, Mariana”; expandida revela João30/Cláudia20/Mariana10, pai60; somatórios gerais continuam60 e não120; teclado e leitor de tela acessam chevron; filtros e paginação preservam invariantes.

**Dependências.** `PlanningGridTable.tsx`, DTO com participações, CSS responsivo, testes de agregação e acesso.

**Pendências.** Padrão exato de edição das linhas de colaborador e persistência de expansão ao filtrar; filtro “Minhas responsabilidades” é **sugestão**, ainda não aprovado.

### PLN-017 — Gravação transacional da distribuição e confirmação

**Estado:** não implementado. **Rastreabilidade:** EP-04 / FEAT-04.02 / FN-04.02.04 / US-026; DEC-015/022.

**Objetivo.** Evitar agenda parcialmente salva e permitir explicar redistribuições.

**Comportamento e regras.** Se houver valores pendentes já planejados, explicar que poderão ser substituídos; o admin confirma. Atualização de responsabilidades, metas diárias e revisão é **atômica**: tudo ou nada. Proteger contra confirmação de proposta feita sobre snapshot/revisão que mudou (concorrência otimista ou equivalente); gravar motivo e metadados de alteração disponíveis. Não registrar ficticiamente autor autenticado antes do modelo de usuário.

**Critérios de aceite.** Cancelar não modifica nenhuma tabela; falhar na metade resulta em rollback; soma após commit fecha baseline elegível; confirmação sobre versão vencida é recusada e solicita recálculo; revisão histórica permanece; nenhuma chamada de escrita ao Azure acontece.

**Dependências.** Transações PostgreSQL/SQLite compatíveis, serviço de planejamento, versão/revisão, trilha EP-10.

**Pendências.** Estratégia de log de alterações e identidade de administrador enquanto houver apenas bearer.

### PLN-018 — Integridade, diagnósticos e permissão do planejamento

**Estado:** parcialmente implementado. **Rastreabilidade:** EP-04, EP-09/10; ADR 004; DEC-004/026.

**Objetivo.** Mostrar claramente quando o plano não fecha e impedir alterações não autorizadas.

**Comportamento e regras.** Não misturar **divergência de escopo** (fonte Azure vs baseline), **integridade de classificação**, **diferença de cronograma** e **quantidades por QA**. Somente administrador altera configuração/agenda; QA autenticado vê Planejamento e revisões em leitura; link visitante só vê Report. Aplicar regras no backend, independentemente de botões escondidos.

**Critérios de aceite.** Cada divergência é identificável e rastreável; somas de metas por QA/por suíte/por dia fecham; valor não classificado não desaparece; chamadas de escrita do usuário leitor recebem 403; troca de plano não expõe dados de outro tenant quando multiempresa for implementado; baseline histórico segue consultável.

**Dependências.** `getPlanningView` já retorna avisos e divergências de escopo/classificação/distribuição; modelo de papel e tenant ainda ausente.

**Pendências.** Autorização do produto futuro e regras de exibição de aviso para usuário visitante (ele nem deve acessar Planejamento).

### PLN-019 — Capacidade, feriados, férias e simulador (adiados)

**Estado:** adiado. **Rastreabilidade:** EP-04 / FEAT-04.04 / FN-04.04.03–04 / US-034–035.

**Objetivo.** No futuro tornar o planejamento ainda mais realista sem comprometer o cronograma básico.

**Comportamento e regras.** Considerar feriados, disponibilidade por QA, férias/ausências, duração típica de testes, capacidade e cenários alternativos somente depois de acordar fontes, critérios e privacidade; não tratar capacidades inferidas como dado real. Não exigir simulador complexo para entregar Montanha/Decrescente iniciais.

**Critérios de aceite da futura fase.** Separação entre estimativa e resultado factual; dias indisponíveis respeitados por regras aprovadas; simulação nunca sobrescreve planejamento sem confirmar; feriados têm calendário local definido.

**Dependências.** Descoberta de dados e modelagem de capacidade, identidade por QA e calendário, ADRs futuros.

**Pendências.** Todo o detalhamento matemático e operacional desta fase continua aberto; **não implementar nesta etapa**.

---

# Parte III — Evolução QA automática e individual (EP-05)

> **Para negócio:** cada QA deve ter sua própria linha de acompanhamento, indicando sua meta e a evolução real do trabalho. **Para engenharia:** a fonte das metas é o FourQA, a fonte dos resultados é a ferramenta externa; a identificação de quem executou no Azure não substitui, por definição, a pessoa responsável cadastrada no FourQA.

## Inventário técnico e decisão de produto

- **Hoje:** não existe página individual de Evolução QA em `frontend/src/App.tsx`; `backend/src/domain/evolucaoStatus.ts` trata da saúde/status das frentes, **não** de produtividade individual.
- **Hoje:** `execucoes` guarda snapshot de Test Points com outcome e informações do último resultado (`run_by`, data, IDs do último run/result), **não** a série completa de movimentações e transições ao longo dos dias.
- **Hoje:** uma suíte tem no máximo um `responsavel` textual na agenda; **não há** metas persistidas por QA/suíte/data nem tabela de participação compartilhada.
- **Aprovado:** indicador **por QA**, somente consulta, atualizado automaticamente do Azure; nenhuma digitação manual de execuções/resultados no FourQA. Responsabilidades vêm do FourQA e não de `Assigned To`/`run_by`.
- **Bloqueio técnico legítimo:** metas divididas apenas por quantidade não identificam quais Test Points foram executados por cada participante. Não inventar proporcionalidade ou atribuição por quem clicou no Azure. O requisito de visão individual permanece **obrigatório**, mas necessita descoberta e decisão técnica antes do aceite de métricas compartilhadas (**OPEN-001**).

### EQA-001 — Visão individual por nome de QA

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.01 / FN-05.01.01 / US-036; DEC-018.

**Objetivo.** Cada profissional consegue acompanhar em uma visão própria seu planejamento e a movimentação associada à sua responsabilidade no FourQA.

**Comportamento e regras.** Criar seção/aba Evolução QA com uma entrada por pessoa identificável, filtros por Test Plan, período e dia; apresentação legível para coordenação e QA. Para cada pessoa, indicadores de Planejado, Executado, Finalizados sem falha, Pendentes/diferença e estados relevantes **com rótulos que indiquem claramente a fórmula**. Uma suíte compartilhada deve permitir visualização individual de João e Cláudia, não apenas total agregado.

**Critérios de aceite.** Dois QAs aparecem em linhas/quadros distintos; selecionar João não exibe metas de Cláudia; totais individuais têm escopo de plano e período; para suíte exclusivamente de um QA, atribuição segue responsabilidade do FourQA mesmo se Azure `run_by` tiver outro nome; valores ausentes indicam indisponibilidade, não sucesso presumido.

**Dependências.** Identidades estáveis de QA, PLN-015, contrato de KPIs, datasource Azure, segurança de leitura.

**Pendências.** Layout final (tabela/cartões/gráficos) e indicadores de produtividade que exigem histórico de run.

### EQA-002 — Metas individuais derivadas exclusivamente do Planejamento

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.01 / FN-05.01.02 / US-037; DEC-002/017/018.

**Objetivo.** O “Planejado” mostrado na Evolução QA é exatamente o planejado aprovado para aquele QA no FourQA.

**Comportamento e regras.** Consultar metas por QA + suíte + dia + revisão, sem editar ou recopiar valores na tela de Evolução. Agregar sem dupla contagem: soma de QAs igual ao total distribuído das suítes em escopo. Responsável principal não recebe automaticamente toda a meta quando há divisão quantitativa. Preservar o histórico de metas de versões anteriores.

**Critérios de aceite.** Para uma suíte com João40 e Cláudia20, Evolução mostra planejado40 e20 (total60) independentemente de `Assigned To`; ao revisar amanhã o cronograma, a série histórica aprovada antes da revisão não é reescrita; alterar somente filtro não altera valores persistidos.

**Dependências.** PLN-001/006/015/017, modelo de `planning_qa_allocation` **proposto, não existente**.

**Pendências.** Política exata de visualização histórica por data de vigência/revisão, ainda não definida.

### EQA-003 — Indicadores Executado, Finalizado sem falha e status separados

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.02 / FN-05.02.02 / US-039; DEC-019 (detalhe proposto).

**Objetivo.** Distinguir esforço realmente executado da conclusão sem falha para a leitura gerencial não penalizar um teste falhado.

**Comportamento e regras.** **Finalizado sem falha = Passed + Not Applicable** no universo definido. **Failed deve contar como execução/trabalho realizado**, mas **não** como conclusão sem falha. Mostrar status com categoria própria (Passed, N/A, Failed, Blocked, Liberado, Não liberado, Design, conforme o universo efetivo); não apresentar simultaneamente totais agregados e detalhes como pontos distintos. A inclusão de Blocked em “Executado” ainda exige regra de negócio explícita; não determinar por analogia. Uma falha e posterior Passed devem respeitar a política de movimento histórico e de deduplicação (**EQA-005**).

**Critérios de aceite.** Um Failed aumenta Executado sem aumentar Finalizado sem falha; Passed e N/A compõem Finalizado; somas por status do mesmo snapshot não duplicam Test Point; um Blocked não é contabilizado como “executado” até decisão; denominadores, escopo e período acompanham o KPI.

**Dependências.** `classifyExecution`, datas/outcomes Azure, EQA-004/005; reconciliação com semântica de Report/Planejamento (OPEN-006).

**Pendências.** Definição de Executado em presença de Blocked e reexecuções; comparações de acumulado e movimento diário.

### EQA-004 — Movimentação diária real, sem derivação por diferença de snapshots

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.02 / FN-05.02.01 / US-038; OPEN-007.

**Objetivo.** Mostrar quanto mudou por dia e status de execução, inclusive ao reexecutar testes.

**Comportamento e regras.** Obter uma fonte temporal verificável das runs/results (ou eventos equivalentes), guardando IDs estáveis, timestamps e status necessários para agregação diária. **Não** afirmar que o snapshot atual, que contém só último estado por ponto, permite recompor com exatidão movimentos anteriores. Sincronização parcial ou API incompleta gera indicador de período incompleto, sem produzir movimento 0 fictício. Não exigir ação manual do QA.

**Critérios de aceite.** Se um Test Point foi Failed na segunda e Passed na quarta, a linha do tempo representa transições segundo política aprovada; sincronizar duas vezes os mesmos eventos não duplica contagem; dados históricos indisponíveis não geram série falsa; fuso horário do Test Plan é respeitado e explicado.

**Dependências.** Spike OPEN-007, contratos da API Azure com runs/results, nova persistência histórica, testes de reexecução/evento tardio.

**Pendências bloqueadoras.** Retenção de runs, data de efeito de mudança, janela de coleta, múltiplas alterações no mesmo dia, fallback para planos sem histórico.

### EQA-005 — Deduplicação de eventos e classificação temporal

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.02 / FN-05.02.03 / US-040; OPEN-007.

**Objetivo.** Evitar inflar a evolução quando o Azure entrega novamente a mesma execução ou quando há reexecução legítima.

**Comportamento e regras.** Distinguir **volume de resultados de runs**, **quantidade de Test Points únicos executados** e **mudanças de status**; não usá-los como se fossem o mesmo número. Persistência incremental idempotente por chave verificável; versão, plano e escopo contextualizam resultado. Mutações de owner FourQA e revisões não reatribuem automaticamente o passado.

**Critérios de aceite.** Reimportar evento idêntico não muda KPI; duas execuções legítimas do mesmo ponto obedecem a métrica escolhida e são distinguíveis; correção tardia aparece no período correto segundo regra aprovada; classificação/status é coerente com sete estados correntes sem misturar contagem de eventos com pontos.

**Dependências.** EQA-004, integração Azure, regras de versões e ADR a criar.

**Pendências.** Unidade canônica de “executado” por KPI, política de retroatividade e duração histórica de armazenamento.

### EQA-006 — Atribuição de resultados ao responsável do FourQA

**Estado:** parcialmente viável em suítes com único responsável; **bloqueado** para compartilhamento quantitativo. **Rastreabilidade:** EP-05 / FEAT-05.03 / FN-05.03.01 / US-041; DEC-017/018; OPEN-001.

**Objetivo.** Medir a responsabilidade de cada QA conforme o FourQA, e não conforme quem clicou para executar no Azure.

**Comportamento e regras.** Em suíte com um único QA responsável no período, resultados comprovados da suíte podem ser associados à responsabilidade daquele QA segundo a versão do plano. Em suíte compartilhada, uma divisão 20/10 de metas não permite saber, a partir de 25 execuções agregadas, qual quota de execução pertenceu a João ou Cláudia. `Assigned To` e `run_by` **não podem se tornar automaticamente a regra de negócio de titularidade**, por decisão explícita do usuário. Primeiro investigar dados e alternativas sem modificar Azure ou exigir lançamento manual; documentar e aprovar formalmente qualquer nova associação.

**Critérios de aceite.** Suíte de João com resultados executados por outra pessoa no Azure continua no escopo responsável João; suíte compartilhada exige prova de atribuição factual antes de exibir “João fez X”; não dividir 25 em 20/5 ou 15/10 por proporção sem evidência; relatório de discovery exibe casos que não permitem decisão.

**Dependências.** PLN-015, EQA-004/005, integração Azure, estudo OPEN-001.

**Pendências bloqueadoras.** Fonte/regra de associação em casos compartilhados sem ligar Test Cases à meta e sem usar executor como titular; possível incompatibilidade de requisitos deve ser escalada como decisão de produto, não “corrigida” pelo desenvolvedor em silêncio.

### EQA-007 — Compartilhamento: não apresentar estimativa como fato

**Estado:** bloqueado até resolver OPEN-001. **Rastreabilidade:** EP-05 / FEAT-05.03 / FN-05.03.02 / US-042; DEC-018/029.

**Objetivo.** Garantir que a exigência de visão **por QA** não se transforme em informações falsas.

**Comportamento e regras.** O objetivo aprovado continua sendo apresentar métricas reais **para cada QA**, inclusive colaboradores da mesma suíte. Até existir mecanismo tecnicamente confiável, valores individuais não atribuíveis devem ser tratados como bloqueio para o aceite daquela funcionalidade, não rateados silenciosamente e não confundidos com execução do responsável principal. Uma indicação clara de indisponibilidade pode existir em telas de teste/protótipos, mas **não equivale à entrega final aceita** da Evolução QA individual compartilhada.

**Critérios de aceite.** Em dados de teste com duas responsabilidades e outcome agregado sem vínculo individual, a aplicação não declara distribuição factual inexistente; aceite final da Feature requer uma fonte/procedimento comprovável e regra aprovada; ausência desse suporte gera limitação rastreável e teste negativo.

**Dependências.** EQA-006, ADR da atribuição, solução técnica validada.

**Pendências.** OPEN-001, sem autorização para substituição unilateral por visão agregada ou preenchimento manual.

### EQA-008 — Evolução automática e somente leitura

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.03 / FN-05.03.03 / US-043; DEC-002/004/018.

**Objetivo.** O QA acompanha os resultados sem preencher planilha paralela ou alterar dados de execução no FourQA.

**Comportamento e regras.** Nenhum botão de lançar execução, “ajustar realizado”, atribuir status manual, substituir outcome Azure, ou editar progresso individual. Todos os resultados vêm da fonte externa e são processados automaticamente após sincronização autorizada. Alterações de **planejamento/responsabilidades** pertencem ao fluxo administrativo apropriado em Planejar, não à Evolução QA. QA intermediário consulta; admin configura em suas telas, mas não digita execução para forçar o KPI.

**Critérios de aceite.** Não há formulário ou API de lançamento manual de realizado; UI de Evolução é leitura para todos os papéis; sync atualiza indicador quando informação confiável muda; visitar a página não escreve no Azure/PostgreSQL; requisição direta de mutação de execução é rejeitada.

**Dependências.** Regras de acesso EP-09, pipeline de sincronização, EQA-001/004.

**Pendências.** Frequência de atualização e sinalização de última sincronização; sync automático agendado não existe hoje.

### EQA-009 — Histórico de responsabilidade e planejamento por data

**Estado:** não implementado. **Rastreabilidade:** EP-05 / FEAT-05.01/05.02; DEC-018/022; ADR 004.

**Objetivo.** Mudanças de responsáveis não fazem parecer que alguém executou ou planejou trabalho antes de receber a suíte.

**Comportamento e regras.** Agregação temporal usa a versão/intervalo de vigência da responsabilidade e da meta do FourQA, sem reescrever datas de execução. Métricas de “planejado naquele dia” e “planejado vigente hoje” são distinguíveis. Se transferência de suíte ocorreu hoje, histórico do período anterior não deve ser reassociado sem política explícita.

**Critérios de aceite.** Uma transferência com data registrada preserva relatórios anteriores; revisão aprovada altera projeções conforme sua vigência; filtro de data histórica recupera números justificáveis; alteração de nome exibido não altera identidade da pessoa.

**Dependências.** PLN-006/014/015, versionamento das metas, EQA-004 e histórico de auditoria.

**Pendências.** Retroatividade de transferência ou revisão e regras de correções de dados históricos.

### EQA-010 — Consistência, filtros, estados vazios e transparência de origem

**Estado:** não implementado. **Rastreabilidade:** EP-05, EP-07/09/10; DEC-026/029.

**Objetivo.** A pessoa consegue entender quando o indicador é confiável, de qual plano veio e qual período cobre.

**Comportamento e regras.** Mostrar escopo de Test Plan, período, QA, data/estado de atualização da origem, cobertura conhecida e indisponibilidades. Filtrar por QA/dia/status sem recalcular fórmulas divergentes no frontend. Estado sem dados é diferente de 0 confirmado; resultado de outra empresa ou Test Plan não é acessível. Exibir erros de sync de forma segura, sem tokens/URLs privadas. Dados de participantes devem ser somados exatamente uma vez.

**Critérios de aceite.** Com origem incompleta, página sinaliza incompletude; com valor factual 0, apresenta 0; alternar QA/plano não vaza dados do filtro anterior; somar categorias do mesmo universo fecha total; usuário somente-leitura não altera configuração; erros de API preservam último snapshot válido e aviso.

**Dependências.** Metadados de sync já existentes (`sync_job`), identidade e autorização futura, EQA-001/004/006.

**Pendências.** Contrato de frescor mínimo, escopo de leitura de relatórios individuais e formato de exportação/compartilhamento executivo.

---

# Matriz de rastreabilidade, dependências e validação das Partes II–III

## Relação funcional → história e estado

| Módulo | Requisitos | Histórias do backlog | Estado de entrega |
|---|---|---|---|
| Planejamento cotidiano | PLN-001–005 | US-020–022 (e base atual) | Parcial; total diário, fins de semana e navegação alvo não concluídos |
| Baseline, prioridade e principal | PLN-006–008 | US-031–033, US-027 | Parcial |
| Distribuição | PLN-009–014, PLN-017 | US-023–028 | Não implementada |
| Compartilhamento e tabela | PLN-015–016 | US-029–030 | Não implementados |
| Integridade/permissões e futuro | PLN-018–019 | US-034–035, EP-09/10 | Parcial/adiado |
| Metas e apresentação individual | EQA-001–003, EQA-009 | US-036–037/039 | Não implementados |
| Movimento factual e reexecuções | EQA-004–005 | US-038/040 | Não implementados; OPEN-007 |
| Atribuição e colaboração | EQA-006–007 | US-041–042 | Bloqueados; OPEN-001 |
| Leitura e confiança | EQA-008/010 | US-043, EP-09/10 | Não implementados |

## Critérios de pronto por módulo

**Planejamento** só está pronto quando: baseline e revisões permanecem íntegros; escopo e datas fecham; cálculo conserva saldo elegível; nenhum resultado Azure é sobrescrito; soma por dia/suíte/QA é conservada; concorrência e rollback são testados; autorização protege escrita; UX foi validada com dados reais nos 3 modos e nos calendários; testes SQLite/PostgreSQL relevantes e typecheck passaram.

**Evolução QA** só está pronta quando: metas são rastreáveis ao FourQA; resultados reais são rastreáveis a Azure/run/results; visão por QA inclui compartilhamento com **atribuição individual comprovável**; nenhuma execução foi digitada manualmente; reexecuções e mudança histórica são deduplicadas; dados faltantes não viram 0/estimativa; segurança e isolamento são demonstrados; painel foi visualmente revisado; sync, regressão e permissões passaram.

## Casos de teste obrigatórios para planejamento e evolução

1. Plano com duas revisões e Test Points adicionados no Azure após v1: nenhuma adoção sem nova confirmação.
2. Dia D com três suítes e filtro que oculta duas: tooltip ainda mostra soma das três, uma única vez.
3. Fim de semana desligado e com valores antigos: bloqueio de novos valores e preservação segura do histórico.
4. Curva Montanha com 0/1/2/3/60 pendentes, prazos de 0/1/2/7 dias, períodos cruzando meses e anos.
5. Modo manter principal sem transferir suítes; transferir suíte completa apenas com seleção; compartilhamento N QAs com 30/20/10.
6. Redistribuir suíte com 5 casos, 3 efetivamente executados e 2 ainda não executados; Failed versus finalizado com sucesso; cancelados legados.
7. Falha no meio da transação, confirmação concorrente, cancelamento do modal: nenhum estado parcialmente gravado.
8. QA leitor tentando editar via UI/API; administrador editando; visualizador tentando acessar Planejamento e Evolução.
9. Evolução individual com uma única pessoa responsável, mas `run_by` de outro: resultado atribuído à responsabilidade do FourQA.
10. Evolução compartilhada com 20/10 metas e 25 execuções agregadas: não inventar atribuição individual; exigir solução factual antes do aceite.
11. Resultado Failed na segunda e Passed na quarta; sync repetido e tardio; preservar linha temporal sem dupla contagem.
12. Plano sem pontos, sem resultados, com sync incompleto ou data ausente: exibir estados coerentes; não converter ausência de evidência em zero.

## Decisões abertas que bloqueiam desenho definitivo (não inventar respostas)

| ID de DECISIONS | Impacto nesta especificação | Próximo artefato técnico esperado |
|---|---|---|
| **OPEN-001** | Métrica por QA em suíte compartilhada | Spike de atribuição factual + decisão/ADR de produto |
| **OPEN-006** | Finalizados Report vs Planejamento/Status e cancelados | ADR de semântica, fórmulas e migração |
| **OPEN-007** | Movimentação diária/reexecuções/histórico Azure | Spike runs/results, contrato temporal e testes |
| **OPEN-008** | Algoritmo da Montanha e balanceamento de carga | ADR de curva e balanceamento, com exemplos testáveis |
| **OPEN-012** | Desligar fim de semana contendo alocações | Política de preservação, aviso e decisão administrativa |
| **OPEN-013** | Identidade de QA e autorização administrativa | ADR de RBAC/usuários e migração |

## Governança documental e alteração controlada

- **Fonte de código vigente:** ZIP e arquivos reais do repositório no momento da análise. **Fonte de comportamento aprovado:** DECISIONS.md e decisões expressas da conversa. **Fonte de arquitetura e invariantes:** ADRs 001–004, ARCHITECTURE.md. **Ordem e unidades de trabalho:** ROADMAP.md e BACKLOG.md.
- A presença de uma história no Backlog **não** é aprovação de um detalhe matemático ainda em aberto; criar tarefa técnica de discovery/ADR antes de construir quando houver bloqueador.
- Uma mudança de regra no Report não muda automaticamente Planejamento/Status/Evolução; sinalizar impacto e exigir aceite específico.
- Em futuras revisões, preservar IDs RPT/PLN/EQA, critérios de aceite e histórico; declarar data e motivo da revisão. Nunca reescrever decisões antigas sem rastreabilidade.
- Documentos oficiais residem **exclusivamente em `.cursor/docs/`**, preservando a decisão DEC-025. Nenhum código, migração, banco, token ou Vercel foi alterado na criação deste arquivo.


---

# Continuação da v1.2 — Requisitos dos EP-06 a EP-12

> **Importante para negócio:** esta parte completa a descrição das funcionalidades do Backlog que ainda não estavam no `REQUIREMENTS.md` v1.1. Histórias `US-044` a `US-097` não autorizam execução imediata. **Importante para engenharia:** contratos técnicos a seguir são objetivos e critérios de aceitação; estruturas de dados e endpoints novos não devem ser presumidos existentes.

## Critérios transversais para todos os novos requisitos

| Princípio | Critério verificável |
|---|---|
| Estado e origem | Distinguir dado efetivamente sincronizado, dado ausente, zero medido e cálculo sem base confiável. |
| Escopo | Em toda consulta/escrita, aplicar Test Plan e, quando existir, organização/tenant no backend, persistência e cache. |
| Responsabilidade | Responsável de suíte vem do FourQA; ofensor de bug tem regra própria; executor/Assigned To/Created By não substituem nenhum deles. |
| Semântica | Test Point, Test Case, Test Run, Bug e meta quantitativa são entidades diferentes; não somar populações incompatíveis. |
| Segurança | Não revelar PAT, bearer ou dados privados; negar escrita sem autorização mesmo que a tela esconda controles. |
| História e publicação | Novo requisito só é aceito com testes + revisão funcional; nunca efetuar deploy/commit por inferência a partir desta especificação. |
| Compatibilidade | Não alterar sem decisão as regras vigentes de cancelados em Status/Planejamento, isolamento por planKey, revisão/baseline ou classificação única de status. |

### Matriz mínima de perfis (destino futuro; NÃO implementada hoje)

| Ação | Administrador | QA intermediário autenticado | Visualizador externo por link |
|---|---|---|---|
| Ler Report do próprio plano | Sim | Sim | Sim, somente do plano compartilhado |
| Ler Planejamento, Status, Execuções, Falhas e Evolução QA | Sim | Sim (se autorizado ao plano) | Não |
| Editar planejamento, KPI, ofensor, integração, responsabilidades | Sim | Não | Não |
| Criar/revogar link de Report | Sim | Não | Não |
| Gerenciar membros/segredos/organização | Sim, dentro de seu escopo | Não | Não |
| Executar teste / registrar bug **em módulo nativo futuro** | A definir em matriz própria | **Não autorizado por padrão atual** | Não |

**Nota de segurança:** não reutilizar o `FOURQA_API_TOKEN` como senha de um cliente/QA externo; ele é proteção compartilhada transitória, não identidade individual. O link compartilhável ainda precisa de compatibilização com a Vercel Authentication e política de expiração/revogação (OPEN-011).

---

# Parte IV — Status, Execuções e Falhas (EP-06)

**Para o negócio:** Há telas de leitura de Status, Execuções e Falhas, mas não gestão de execução ou defeitos no FourQA.

**Implementação de referência (não equivale a novo escopo):** `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Regra de fronteira:** A origem atual é o último snapshot do Azure. Estado atual não é histórico completo de runs. Status e Report podem divergir quanto a cancelados legados: não alterar silenciosamente.

## OPR-044 — Preservar status dinâmico por frente

**Rastreabilidade:** EP-06 / FEAT-06.01 / FN-06.01.01 / US-044. **Situação:** **Existente/validar regressão** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Permitir ver onde há progresso e gargalos por frente.

**Objetivo da história.** Como coordenador, quero observar frentes conforme a hierarquia real do Test Plan.

**Comportamento e regras.** Não presumir que uma frente existe em todo plano; reconhecer o alerta de sobreposição de nomes de frente, que pode afetar agregações.

**Critérios de aceite observáveis:**

1. **Caso principal:** Dada uma hierarquia de frentes diferente da original, a página monta os cartões com base na dimensão detectada, sem codificar nomes universais.
2. **Caso de controle/limite:** Dada uma busca por frente, mostra apenas os cartões correspondentes sem reclassificar o resultado no navegador.
3. **Aceite do Backlog:** Frentes detectadas sem hardcode universal; sobreposições são identificadas, não duplicadas.

**Implementação e testes.** ADR 001; testes de dimensões e hierarquia; comportamento existente. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** Compatibilizar a agregação por frente com hierarquias ambíguas sem inventar novas frentes. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-045 — Explicitar divergências semânticas do Report

**Rastreabilidade:** EP-06 / FEAT-06.01 / FN-06.01.02 / US-045. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Permitir ver onde há progresso e gargalos por frente.

**Objetivo da história.** Como gestor, quero saber por que duas telas podem mostrar números distintos.

**Comportamento e regras.** Status e Planejamento ainda podem incluir cancelados; preservar ADR-003, teste de regressão e uso de `getStatusPorFrente`.

**Critérios de aceite observáveis:**

1. **Caso principal:** Se Report apresentar Finalizados=Passed+N/A, a aba Status mantém a semântica legada enquanto não houver alteração explicitamente aprovada para ela.
2. **Caso de controle/limite:** Em fixture com cancelados, documentar no próprio produto ou ajuda o motivo de dois valores diferentes, sem igualá-los silenciosamente.
3. **Aceite do Backlog:** Status mantém semântica prevista no legado até aprovação de mudança; não unifica cancelados por acidente.

**Implementação e testes.** ADR 003, testes isolados de Status e Report. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** OPEN-006: decisão de produto sobre unificação futura das fórmulas e apresentação da divergência. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-046 — Buscar e paginar Test Points

**Rastreabilidade:** EP-06 / FEAT-06.02 / FN-06.02.01 / US-046. **Situação:** **Existente/validar regressão** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Encontrar cenário e prioridade na fonte sem digitar resultados no FourQA.

**Objetivo da história.** Como QA, quero localizar cenários e consultar seus estados.

**Comportamento e regras.** Somente leitura; não oferecer botões que alterem Azure, e não misturar dados de outro `plan_key`.

**Critérios de aceite observáveis:**

1. **Caso principal:** Busca e paginação consultam o servidor, respeitam o plano selecionado, retornam total e linhas sem duplicar pontos na passagem de página.
2. **Caso de controle/limite:** Ao trocar o termo pesquisado, paginação retorna ao início; pagina vazia e erro exibem estados inteligíveis.
3. **Aceite do Backlog:** Busca e paginação estáveis, sem sair do escopo do plano; sem escrita de outcome.

**Implementação e testes.** Store/queryExecucoes, frontend; já existe busca e paginação. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** UX de filtros adicionais além da busca livre ainda requer refinamento. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-047 — Persistir prioridade real do Test Case

**Rastreabilidade:** EP-06 / FEAT-06.02 / FN-06.02.02 / US-047. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Encontrar cenário e prioridade na fonte sem digitar resultados no FourQA.

**Objetivo da história.** Como QA, quero ver a prioridade definida no Azure.

**Comportamento e regras.** Hoje `readCasePriority` extrai valor, mas `execucoes` SQL não persiste `case_priority`; demanda migração e testes de store/DTO.

**Critérios de aceite observáveis:**

1. **Caso principal:** Com Azure contendo `Microsoft.VSTS.Common.Priority`, a prioridade sobrevive à gravação PostgreSQL e aparece após um novo GET; não some após reiniciar a API.
2. **Caso de controle/limite:** Sem prioridade no Azure, a célula aparece indisponível/vazia, nunca como prioridade de suíte 1/2/3 nem como zero inventado.
3. **Aceite do Backlog:** Se Azure traz prioridade, a lista mostra o valor após refresh PostgreSQL; campo ausente é distinguível de prioridade zero.

**Implementação e testes.** `readCasePriority` já lê campo; SQL do snapshot não possui coluna persistida; migração/contrato + teste. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** Definir migração, backfill de snapshots antigos e apresentação de valores não padronizados. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-048 — Explicar data e executor sem atribuir responsabilidade

**Rastreabilidade:** EP-06 / FEAT-06.02 / FN-06.02.03 / US-048. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Encontrar cenário e prioridade na fonte sem digitar resultados no FourQA.

**Objetivo da história.** Como QA, quero consultar data e último executor sem confundir com dono da suíte.

**Comportamento e regras.** Snapshot reflete último resultado por Test Point; não afirmar que representa todas as execuções do período.

**Critérios de aceite observáveis:**

1. **Caso principal:** A coluna RunBy é identificada como último executor reportado pelo Azure, com data e `last_result_id` apenas quando recebidos.
2. **Caso de controle/limite:** Responsável cadastrado no FourQA não é alterado quando RunBy/Assigned To do Azure é outra pessoa.
3. **Aceite do Backlog:** Legenda identifica origem Azure, escopo temporal e ausência de dado; não substitui responsável FourQA.

**Implementação e testes.** `date_completed`, `run_by`, `last_result_id` e testes de DTO. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** OPEN-007: histórico completo de runs/movimentações para série temporal. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-049 — Exibir Created By do bug

**Rastreabilidade:** EP-06 / FEAT-06.03 / FN-06.03.01 / US-049. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Entender origem e impacto dos bugs ligados aos cenários.

**Objetivo da história.** Como líder, quero ver quem criou o bug no Azure.

**Comportamento e regras.** Azure `falhas.ts` já solicita Created By, mas coluna/DTO/página não o apresentam.

**Critérios de aceite observáveis:**

1. **Caso principal:** Quando Bug traz `System.CreatedBy`, o nome/identidade do criador aparece na Falhas após sync e persiste no banco.
2. **Caso de controle/limite:** Created By vazio não é preenchido com Assigned To, `responsavel` calculado ou executor de cenário.
3. **Aceite do Backlog:** Exibe identidade proveniente de `System.CreatedBy`, nunca confunde com ofensor, Assigned To ou executor.

**Implementação e testes.** Azure já solicita o campo; persistir DTO/coluna e exibir, preservando cenário sem campo. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** Representação de identidade (displayName, uniqueName, id), tratamento de ausência e migração SQL. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-050 — Preservar rastreabilidade de bug

**Rastreabilidade:** EP-06 / FEAT-06.03 / FN-06.03.02 / US-050. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Entender origem e impacto dos bugs ligados aos cenários.

**Objetivo da história.** Como QA, quero ver bug, estado, ambiente, ponto e plan associados.

**Comportamento e regras.** Distinguir entidade Bug e associação com cenário; a Gestão de Impactos conta bugs e Cenários Impactados conta Test Points.

**Critérios de aceite observáveis:**

1. **Caso principal:** Bug relacionado a múltiplos resultados mantém o mesmo identificador de bug e os vínculos de rastreabilidade sem contar bugs inventados.
2. **Caso de controle/limite:** Ambiente, origem, datas e estado exibem valores disponíveis e links abrem apenas destinos válidos.
3. **Aceite do Backlog:** Múltiplos vínculos não inventam novos bugs; data de fechamento e ambiente continuam consultáveis.

**Implementação e testes.** Teste com bugs repetidos em múltiplos resultados; manter ID e planKey. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** Formato histórico de vínculo, duplicidade de bug em múltiplos planos e restrição de campos por perfil. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## OPR-051 — Bloqueio de outros cenários por falha

**Rastreabilidade:** EP-06 / FEAT-06.03 / FN-06.03.03 / US-051. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Entender origem e impacto dos bugs ligados aos cenários.

**Objetivo da história.** Como QA, futuramente quero propor bloqueio de cenário em lote e associar um bug.

**Comportamento e regras.** Futuramente a ação pode envolver ferramenta externa; métodos POST de batch de leitura não são prova de suporte à escrita.

**Critérios de aceite observáveis:**

1. **Caso principal:** O sistema atual não escreve outcome nem vínculo no Azure; nenhuma ação de bloqueio em lote deve aparecer como disponível sem novo contrato.
2. **Caso de controle/limite:** Em um protótipo futuro, confirmar a lista de Test Points afetados, bug associado, permissões e efeitos antes de qualquer escrita.
3. **Aceite do Backlog:** Só após autorização explícita de escrita; selecionar casos, confirmação, idempotência e feedback; não disponível no produto hoje.

**Implementação e testes.** Discovery OPEN-009; não chamar POST workitemsbatch de “edição no Azure”. Teste com snapshot mockado de dois planos, cenário N/A, bloqueado e vazio; smoke de busca/paginação e link externo. Conferir que nenhum GET modifica Azure e que as sete classes não somam duplicado. Evidência concreta por arquivos: `frontend/src/pages/{StatusPage,ExecucoesPage,FalhasPage}.tsx`; `backend/src/routes/api.ts`; `backend/src/services/reportService.ts`; `backend/src/domain/{formulas,statusFrente}.ts`; `backend/src/azure/{execucoes,falhas}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`.

**Dependência, decisão ou risco pendente.** OPEN-009: autorização explícita, semântica de bloqueio, idempotência e compensação em falha parcial. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte V — Integrações externas e sincronização (EP-07)

**Para o negócio:** Somente Azure DevOps está integrado. A sincronização é manual, com snapshot; não existem conexões administráveis por empresa.

**Implementação de referência (não equivale a novo escopo):** `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Regra de fronteira:** Conector atual lê o Azure; `POST` de WorkItemsBatch é uma operação de leitura. Novos conectores e escrita no Azure não são entregas atuais.

## INT-052 — Atualizar Test Plans sem duplicação

**Rastreabilidade:** EP-07 / FEAT-07.01 / FN-07.01.01 / US-052. **Situação:** **Existente/validar regressão** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Atualizar dados sem destruir planejamento ou misturar snapshots de períodos distintos.

**Objetivo da história.** Como administrador, quero atualizar cenários de um plano usando Azure.

**Comportamento e regras.** Preservar POST de sync manual, `plan_key` e identidade dos Test Points; limites/retry e isolamento de escopo.

**Critérios de aceite observáveis:**

1. **Caso principal:** Sincronizar dois Test Plans preserva ids e escopos: nenhuma execução do plano A aparece em B mesmo com suíte de nome idêntico.
2. **Caso de controle/limite:** Refresh de pontos paginados não perde página e produz catálogo de dimensões da hierarquia real.
3. **Aceite do Backlog:** Apenas o escopo configurado é atualizado; identifica suite, ponto, caso, plan; progresso e erro são legíveis.

**Implementação e testes.** Paginação/retentativas e testes de escopo; sync manual já existe. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Critério operacional para novas conexões e descoberta de planos fora da configuração ambiente. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-053 — Garantir snapshot atômico

**Rastreabilidade:** EP-07 / FEAT-07.01 / FN-07.01.02 / US-053. **Situação:** **Existente/validar regressão** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Atualizar dados sem destruir planejamento ou misturar snapshots de períodos distintos.

**Objetivo da história.** Como gestor, quero que um refresh falho não mostre execução nova com KPI antigo.

**Comportamento e regras.** Persistência transacional do PostgreSQL + consistência do cache local; rollback; não sobrescrever baseline de forma implícita.

**Critérios de aceite observáveis:**

1. **Caso principal:** Quando o lote Azure é rejeitado/incompleto, snapshot anterior e planejamento confirmado permanecem consultáveis.
2. **Caso de controle/limite:** Lote íntegro substitui snapshot exatamente uma vez, sem mistura de metadados novos com dados antigos.
3. **Aceite do Backlog:** Ou publica o lote validado inteiro, ou preserva snapshot anterior; planejamento confirmado não some.

**Implementação e testes.** Transação no PostgreSQL, consistência do cache e teste de falhas. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Como lidar com falha/cancelamento de job após um lote parcial em provedores futuros. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-054 — Exibir estado de sincronização

**Rastreabilidade:** EP-07 / FEAT-07.01 / FN-07.01.03 / US-054. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Atualizar dados sem destruir planejamento ou misturar snapshots de períodos distintos.

**Objetivo da história.** Como QA, quero distinguir dados atualizados de dados antigos/incompletos.

**Comportamento e regras.** Hoje existe `sync_job`/`GET /api/sync/status`, sem central de saúde de conectores por empresa.

**Critérios de aceite observáveis:**

1. **Caso principal:** Usuário autorizado consulta último início, fim, resultado e falha do sync, distinguindo “em andamento”, “concluído” e “falhou”.
2. **Caso de controle/limite:** Erro de integração aparece de forma compreensível sem mostrar PAT, tokens, resposta HTTP confidencial ou stack trace ao cliente.
3. **Aceite do Backlog:** Última atualização, erro, duração e estado de job legíveis; mensagem de campo ausente quando aplicável.

**Implementação e testes.** `sync_job`, UI, retries/timeout; sem logar tokens. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Política de retenção, alertas e agendamento futuro não aprovada. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-055 — Cadastrar conexão Azure manual

**Rastreabilidade:** EP-07 / FEAT-07.02 / FN-07.02.01 / US-055. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Conectar outra organização/projeto/plano sem editar código.

**Objetivo da história.** Como admin, quero fornecer organização, projeto, plano e credencial pela interface segura.

**Comportamento e regras.** A configuração atual vem de `azure/config.ts` e um segredo de ambiente; requer modelo e criptografia/controle de acesso.

**Critérios de aceite observáveis:**

1. **Caso principal:** Admin cadastra uma conexão Azure em tela, vinculada ao projeto/plano e à organização futura, sem editar `.env` por cliente.
2. **Caso de controle/limite:** Conexão salva só devolve metadados não secretos ao frontend; PAT/segredo não é exposto em GET, logs ou histórico.
3. **Aceite do Backlog:** Credencial validada server-side, mascarada, armazenada protegida e nunca devolvida ao frontend.

**Implementação e testes.** Contrato por plano e RBAC; não copiar PAT em logs; depende de EP-09. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** OPEN-010/013: modelo multiempresa e autorização/armazenamento de credenciais. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-056 — Validar permissão e teste de conexão

**Rastreabilidade:** EP-07 / FEAT-07.02 / FN-07.02.02 / US-056. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Conectar outra organização/projeto/plano sem editar código.

**Objetivo da história.** Como admin, quero saber se tenho acesso ao Test Plan antes de salvar.

**Comportamento e regras.** Mínimo privilégio, timeout e retry conforme política; nunca exibir token no erro.

**Critérios de aceite observáveis:**

1. **Caso principal:** Testar conexão retorna sucesso apenas quando credencial e permissão alcançam recurso selecionado, sem confundir HTTP 200 de health local.
2. **Caso de controle/limite:** Falha por credencial, autorização, ausência de plano ou throttling tem mensagem separada e não grava configuração parcialmente válida sem confirmação.
3. **Aceite do Backlog:** Falhas 401/403, plano inexistente e limite de API aparecem sem segredos; zero alteração em Azure.

**Implementação e testes.** Fluxo de teste com timeouts, rate limit e schemas. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Quais escopos Azure mínimos por tipo de ação, consentimento e validade do segredo. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-057 — Extensão assistente de conexão

**Rastreabilidade:** EP-07 / FEAT-07.02 / FN-07.02.03 / US-057. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Conectar outra organização/projeto/plano sem editar código.

**Objetivo da história.** Como admin, quero iniciar conexão do navegador de ferramenta externa de modo consciente.

**Comportamento e regras.** Extensão não existe; deve ser desenhada separadamente do backend e do login empresarial.

**Critérios de aceite observáveis:**

1. **Caso principal:** Extensão sugerirá a associação de uma página Azure a um Test Plan somente após ação explícita da pessoa.
2. **Caso de controle/limite:** Ela não extrai PAT, cookie ou segredo silenciosamente, e oferece caminho equivalente via configuração manual.
3. **Aceite do Backlog:** Plugin opcional solicita consentimento, não captura PAT de página; fallback manual funciona.

**Implementação e testes.** Discovery/ameaças do navegador; futuro após conexão manual. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Requisitos de navegador, permissões mínimas e revisão de segurança antes de qualquer lançamento. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-058 — Definir contrato de integração

**Rastreabilidade:** EP-07 / FEAT-07.03 / FN-07.03.01 / US-058. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Normalizar dados de ferramentas diferentes mantendo cálculo de KPIs.

**Objetivo da história.** Como arquiteto, quero que cada ferramenta produza status, suítes, casos, bugs e datas com origem explícita.

**Comportamento e regras.** Definir contrato canônico versionado, origem, IDs, timezone, paginação, idempotência e mapeamentos.

**Critérios de aceite observáveis:**

1. **Caso principal:** Uma fonte deve informar plano, suíte, Test Point/Case, outcome, timestamps e bugs sem impor o nome de campo Azure na API de KPI.
2. **Caso de controle/limite:** Valor ausente ou não suportado permanece marcado como tal; um adaptador não inventa Passed ou identidade.
3. **Aceite do Backlog:** Adapter declara capacidades/ausências; mesma regra de indicador funciona sem campos Azure hardcoded.

**Implementação e testes.** Porta do domínio, normalizador, testes de contrato por fonte. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** Mapa de estados e equivalência por fornecedor exigem descoberta por conector. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-059 — Avaliar conector Jira/Xray

**Rastreabilidade:** EP-07 / FEAT-07.03 / FN-07.03.02 / US-059. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Normalizar dados de ferramentas diferentes mantendo cálculo de KPIs.

**Objetivo da história.** Como operação cliente, quero importar execução do conjunto Jira/Xray utilizado pela empresa.

**Comportamento e regras.** Integração Jira e produto Xray possuem superfícies distintas; evitar um conector genérico sem investigação.

**Critérios de aceite observáveis:**

1. **Caso principal:** Discovery enumera API/edição Xray utilizada, modelos de teste e evidência, credenciais e limites com fontes verificáveis.
2. **Caso de controle/limite:** Nenhuma funcionalidade Jira/Xray é tratada como pronta ou contratada antes de prova de conceito autorizada.
3. **Aceite do Backlog:** Spike documenta edição/API, autenticação, casos e resultados; piloto só quando aprovado.

**Implementação e testes.** Não assumir que Jira base substitui Xray; fornecedor/edição a confirmar. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** OPEN-014: fornecedor/edição, licenciamento e contrato de dados. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-060 — Avaliar conector Zephyr

**Rastreabilidade:** EP-07 / FEAT-07.03 / FN-07.03.03 / US-060. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Normalizar dados de ferramentas diferentes mantendo cálculo de KPIs.

**Objetivo da história.** Como operação cliente, quero usar a edição Zephyr adotada pela organização.

**Comportamento e regras.** Zephyr tem variantes e APIs; nenhuma chamada existe no ZIP.

**Critérios de aceite observáveis:**

1. **Caso principal:** Discovery descreve qual edição Zephyr está em uso e como obter runs, status e bugs reais.
2. **Caso de controle/limite:** Um resultado que não tenha equivalente nos sete estados é explicitamente mapeado ou marcado como incompatível.
3. **Aceite do Backlog:** Discovery valida produto/versão, paginação, status, bugs e limites antes de estimar.

**Implementação e testes.** Contrato por vendor; API e escopos dependem da edição. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** OPEN-014: versão/edição e autenticação da ferramenta. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## INT-061 — Avaliar conector ALM Octane

**Rastreabilidade:** EP-07 / FEAT-07.03 / FN-07.03.04 / US-061. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Normalizar dados de ferramentas diferentes mantendo cálculo de KPIs.

**Objetivo da história.** Como operação cliente, quero alimentar o FourQA com dados do OpenText ALM Octane.

**Comportamento e regras.** Não há integração Octane no ZIP.

**Critérios de aceite observáveis:**

1. **Caso principal:** Discovery valida as APIs e entidades do OpenText ALM Octane relevantes ao mesmo contrato canônico.
2. **Caso de controle/limite:** Não anunciar compatibilidade Octane antes de validar rate limits, paginação, acesso e mapeamento de resultados.
3. **Aceite do Backlog:** Discovery identifica projeto, suites, runs e token; sem prometer equivalência total ao Azure.

**Implementação e testes.** Spike e matriz de campos; integração futura. Teste de paginação, API lenta/429 com Retry-After, campo ausente, snapshot inválido e transação abortada; segredos nunca presentes em respostas ou logs. Teste externo real só sob autorização. Evidência concreta por arquivos: `backend/src/azure/{client,config,execucoes,falhas,kpis}.ts`; `backend/src/services/{syncService,syncJob}.ts`; `backend/src/db/postgres/postgresAzureSnapshotStore.ts`; `backend/src/routes/api.ts`.

**Dependência, decisão ou risco pendente.** OPEN-014: versão, permissões, contratos e disponibilidade de API. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte VI — Dashboard e catálogo de Test Plans (EP-08)

**Para o negócio:** A rota inicial é o Report. Planos são vinculados pela configuração Azure e `plan_key`; não há dashboard de cartões individuais.

**Implementação de referência (não equivale a novo escopo):** `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Regra de fronteira:** Card é por **Test Plan**, nunca por projeto Azure inteiro. Metadados externos têm prioridade de origem; personalização local não modifica Azure.

## CAT-062 — Catalogar Test Plans por origem

**Rastreabilidade:** EP-08 / FEAT-08.01 / FN-08.01.01 / US-062. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada Test Plan externo é uma unidade explícita de configuração.

**Objetivo da história.** Como líder, quero registrar Fase 1/2/3 separadamente mesmo sob o mesmo projeto Azure.

**Comportamento e regras.** Hoje `plan_key` é filtro e `plan_id` aparece no snapshot; não há catálogo de planos persistido.

**Critérios de aceite observáveis:**

1. **Caso principal:** Cada card representa um Test Plan externo individual, ainda que múltiplos pertençam ao mesmo Azure Project.
2. **Caso de controle/limite:** IDs de projeto, plano, organização e origem permanecem distintos; mesmos nomes não fundem cards.
3. **Aceite do Backlog:** Cada cartão aponta a identificador de plano externo + conexão; nenhuma colisão entre IDs de diferentes fontes.

**Implementação e testes.** Propor tabela/contrato e migração, preservar dados existentes por planKey. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** OPEN-010: identidade do plano e separação organizacional no modelo futuro. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## CAT-063 — Personalizar nome e subtítulo do card

**Rastreabilidade:** EP-08 / FEAT-08.01 / FN-08.01.02 / US-063. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada Test Plan externo é uma unidade explícita de configuração.

**Objetivo da história.** Como admin, quero chamar um Test Plan por um nome amigável sem renomeá-lo no Azure.

**Comportamento e regras.** Cabeçalho atual do Report é outra edição; não substitui nomes externos.

**Critérios de aceite observáveis:**

1. **Caso principal:** Alterar nome e subtítulo no card afeta só a exibição no FourQA; não envia PATCH para o Test Plan externo.
2. **Caso de controle/limite:** Plano sem personalização mantém identificadores/nome de origem e mostra fallback determinístico.
3. **Aceite do Backlog:** Salvar título/subtítulo só no FourQA; origem externa e ID permanecem imutáveis.

**Implementação e testes.** Separar configurações de card dos títulos atuais do Report. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** Prioridade de nome/fallback e regras de validação de duplicidade por organização. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## CAT-064 — Mostrar metadados do plano

**Rastreabilidade:** EP-08 / FEAT-08.01 / FN-08.01.03 / US-064. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada Test Plan externo é uma unidade explícita de configuração.

**Objetivo da história.** Como QA, quero saber a qual projeto/delivery e quantidade de suítes/casos o cartão pertence.

**Comportamento e regras.** Exibir métricas do plano com unidade e referência de atualização.

**Critérios de aceite observáveis:**

1. **Caso principal:** Card apresenta nome, subtítulo, fonte, projeto, delivery quando configurado, suíte/casos quando disponíveis.
2. **Caso de controle/limite:** Ausência de contagem ou último sync é identificada como “indisponível”, não zero arbitrário.
3. **Aceite do Backlog:** Campos de origem explicados com timestamp de sync; ausência de dado não é zero inventado.

**Implementação e testes.** Normalizar contadores por plano e garantir escopo. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** Quais dados do Azure devem ser cacheados por card e atualização em sincronização. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## CAT-065 — Abrir dashboard inicial

**Rastreabilidade:** EP-08 / FEAT-08.02 / FN-08.02.01 / US-065. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma entrada por Test Plan e ações proporcionais ao perfil.

**Objetivo da história.** Como usuário autenticado, quero escolher um Test Plan no início.

**Comportamento e regras.** A rota `/` hoje abre Report; dashboard inicial não existe.

**Critérios de aceite observáveis:**

1. **Caso principal:** Após login, usuário autorizado visualiza somente cards de planos que pode consultar; seleção entra no plano escolhido.
2. **Caso de controle/limite:** Logout, recarga e deep link não deixam o usuário acidentalmente no plano de outro cliente.
3. **Aceite do Backlog:** Um card por plano autorizado; escolher card abre Report/Planejamento/Status/Execuções/Falhas no escopo certo.

**Implementação e testes.** Rotas parametricas/estado sem vazamento entre planos; testes de refresh deep link. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** Experiência antes do login e pré-requisitos de autenticação/tenant. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## CAT-066 — Adicionar plano pela interface

**Rastreabilidade:** EP-08 / FEAT-08.02 / FN-08.02.02 / US-066. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma entrada por Test Plan e ações proporcionais ao perfil.

**Objetivo da história.** Como admin, quero registrar outro plano pelo botão `+`.

**Comportamento e regras.** Não buscar credenciais no navegador; vínculo com conexão já autorizada.

**Critérios de aceite observáveis:**

1. **Caso principal:** Botão `+` lista conexões e Test Plans disponíveis para aquele administrador; adicionar um não modifica o plano externo.
2. **Caso de controle/limite:** Adicionar plano duplicado no mesmo escopo é tratado sem criar dois cadastros concorrentes.
3. **Aceite do Backlog:** Card novo exige conexão validada; QA leitor não adiciona; mensagens claras para duplicidade/erro.

**Implementação e testes.** Integração com EP-07 e autorização EP-09. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** Conexão manual precede plugin; política de onboarding por organização. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## CAT-067 — Preservar contexto no menu

**Rastreabilidade:** EP-08 / FEAT-08.02 / FN-08.02.03 / US-067. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma entrada por Test Plan e ações proporcionais ao perfil.

**Objetivo da história.** Como usuário, quero navegar entre abas sem perder o Test Plan.

**Comportamento e regras.** Hoje APIs recebem planKey com fallback; falta contrato central de contexto de plano e tenant.

**Critérios de aceite observáveis:**

1. **Caso principal:** Navegar de Report para Planejamento, Status, Execuções e Falhas conserva a identidade do Test Plan selecionado.
2. **Caso de controle/limite:** URL direta de outro plano exige verificação de autorização, não apenas parâmetro manipulável.
3. **Aceite do Backlog:** A troca de página preserva plano, período e permissões; sem reutilizar snapshot de outro plano.

**Implementação e testes.** Routing e API plan scope; smoke de dois planos. Teste de dois Test Plans no mesmo projeto Azure e nomes repetidos: dois cartões separados, sem modificar origem. Testar seleção, navegação, recarga e acesso indevido. Evidência concreta por arquivos: `frontend/src/App.tsx`, `frontend/src/context/ReportChromeContext.tsx`, `backend/src/azure/config.ts`, `backend/src/routes/api.ts`, `backend/src/persistence/planKey.ts`.

**Dependência, decisão ou risco pendente.** Identificador canônico e estratégia de rota/URL do dashboard. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte VII — Identidade, acessos e multiempresa (EP-09)

**Para o negócio:** Existe bearer compartilhado e proteção de Preview, não autenticação institucional, autorização por papel ou isolamento por organização.

**Implementação de referência (não equivale a novo escopo):** `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Regra de fronteira:** Admin é o único perfil que edita no destino comercial aprovado. QA intermediário é **somente leitura**. Link externo sem login abre somente o Report. Vercel Preview Authentication é proteção operacional transitória.

## SEC-068 — Entrar com identidade institucional

**Rastreabilidade:** EP-09 / FEAT-09.01 / FN-09.01.01 / US-068. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada pessoa usa sua conta institucional e tem permissões explícitas.

**Objetivo da história.** Como QA, quero usar minha conta Microsoft ou Google quando suportada.

**Comportamento e regras.** Microsoft/Google/OIDC são direção de produto; Vercel Authentication não representa login do FourQA.

**Critérios de aceite observáveis:**

1. **Caso principal:** Usuário elegível autentica-se com provedor institucional e recebe sessão associada a identidade válida.
2. **Caso de controle/limite:** Usuário não cadastrado/inativo não ganha acesso por possuir email semelhante ou por abrir link de Preview.
3. **Aceite do Backlog:** Login autenticado valida identidade e sessão; falha de provedor é tratada; token API transitório não vira identidade.

**Implementação e testes.** Discovery OIDC/OAuth, cookies/JWT, CSRF, expiração e convite. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-013: provedores, convites, domínio corporativo, sessões e recuperação. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-069 — Autorizar administrador no backend

**Rastreabilidade:** EP-09 / FEAT-09.01 / FN-09.01.02 / US-069. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada pessoa usa sua conta institucional e tem permissões explícitas.

**Objetivo da história.** Como admin, quero editar config e planejamento, e somente pessoas autorizadas fazerem isso.

**Comportamento e regras.** Substituir autorização por bearer comum; papéis server-side em cada mutation.

**Critérios de aceite observáveis:**

1. **Caso principal:** Admin autenticado pode alterar configuração de plano/KPI/responsáveis, e a API verifica papel e escopo antes de gravar.
2. **Caso de controle/limite:** QA leitor, visualizador externo e usuário de outra organização recebem negação ao tentar PUT/POST direto, ainda que a UI esconda o controle.
3. **Aceite do Backlog:** API verifica organização, plano, papel e ação; UI escondida não basta.

**Implementação e testes.** RBAC server-side e testes de escalonamento de privilégio. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** Matriz final de ações administrativas, modelo de RBAC e transição do token atual. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-070 — Permitir QA apenas leitura

**Rastreabilidade:** EP-09 / FEAT-09.01 / FN-09.01.03 / US-070. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Cada pessoa usa sua conta institucional e tem permissões explícitas.

**Objetivo da história.** Como QA, quero consultar todas as visões sem risco de editar.

**Comportamento e regras.** Intermediário QA é somente leitura nesta fase; não transformar função futura de executor nativo em privilégio atual.

**Critérios de aceite observáveis:**

1. **Caso principal:** QA autenticado lê Report, Planejamento, Status, Execuções e Falhas, mas não edita planejamento, configuração ou resultados.
2. **Caso de controle/limite:** Acesso negado aparece corretamente quando tenta manipular chamadas administrativas pela API.
3. **Aceite do Backlog:** Tentativas PUT/POST negadas na API; Report, Planejamento, Status, Execuções, Falhas e Evolução futura legíveis.

**Implementação e testes.** Testar HTTP 403, escopo e navegação. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** Acesso de QA à aba Evolução QA e exportações pode exigir refinamento de privacidade. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-071 — Criar link restrito ao Report

**Rastreabilidade:** EP-09 / FEAT-09.02 / FN-09.02.01 / US-071. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Gestores externos conseguem consultar Report sem editar o plano.

**Objetivo da história.** Como admin, quero compartilhar uma visão executiva read-only.

**Comportamento e regras.** Token de compartilhamento revogável/escopado; não divulgar token bearer de administração; proteção host pode impedir acesso sem login.

**Critérios de aceite observáveis:**

1. **Caso principal:** Link compartilhado sem login do FourQA abre somente Report previamente definido para um plano e escopo.
2. **Caso de controle/limite:** Link não abre endpoints de Execuções, Falhas, Planejamento, dados pessoais ou mutações.
3. **Aceite do Backlog:** Link não libera Planejamento/Status/API privada; configura escopo do plano e revogação.

**Implementação e testes.** Token randômico armazenado hash, política de expiração e rate limit; OPEN-011. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-011/015: convivência com Vercel Authentication, dados exibíveis e experiência externa. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-072 — Revogar e expirar acesso

**Rastreabilidade:** EP-09 / FEAT-09.02 / FN-09.02.02 / US-072. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Gestores externos conseguem consultar Report sem editar o plano.

**Objetivo da história.** Como admin, quero invalidar um link antigo.

**Comportamento e regras.** Persistir somente identificador/segredo protegido, checagem server-side, rate limit e testes de revogação.

**Critérios de aceite observáveis:**

1. **Caso principal:** Revogar link impede acesso imediatamente mesmo que ainda esteja dentro do prazo original.
2. **Caso de controle/limite:** Link expirado ou inválido retorna bloqueio consistente; chave em URL não concede permissões a outras rotas.
3. **Aceite do Backlog:** Link revogado/expirado falha imediatamente inclusive em endpoints; sem reutilização após exclusão.

**Implementação e testes.** Persistência auditável, testes negativos e logs seguros. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** Política de prazo padrão, rotação e auditoria de acessos. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-073 — Filtrar dados sensíveis na visualização

**Rastreabilidade:** EP-09 / FEAT-09.02 / FN-09.02.03 / US-073. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Gestores externos conseguem consultar Report sem editar o plano.

**Objetivo da história.** Como gestor, quero um Report sem informações operacionais indevidas.

**Comportamento e regras.** Aplicar projeção/redação de campos no backend, não apenas CSS ou estado do componente.

**Critérios de aceite observáveis:**

1. **Caso principal:** Visualizador externo só recebe dados autorizados do Report; campos sensíveis não aparecem nem escondidos no JSON.
2. **Caso de controle/limite:** Compartilhar um plano não revela nomes, bugs ou identificadores de outro tenant.
3. **Aceite do Backlog:** Matriz de campos autorizados, nenhuma credencial/identidade privada vazada por HTML/API.

**Implementação e testes.** OPEN-015; sanitização e escopo de serialização. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-015: lista aprovada de campos públicos e dados que podem ser agregados. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-074 — Definir organização e membros

**Rastreabilidade:** EP-09 / FEAT-09.03 / FN-09.03.01 / US-074. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma empresa nunca consulta dados da outra.

**Objetivo da história.** Como gestor, quero administrar usuários de minha própria empresa.

**Comportamento e regras.** Modelo conceptual Organization/Membership/User, sem tabelas atuais.

**Critérios de aceite observáveis:**

1. **Caso principal:** Admin da organização gerencia membros e papéis apenas de sua organização.
2. **Caso de controle/limite:** Identidade que pertence a várias organizações escolhe contexto explicitamente; um papel em A não vale automaticamente em B.
3. **Aceite do Backlog:** Membership e papéis por empresa; múltiplas organizações, se permitidas, exigem contexto explícito.

**Implementação e testes.** ADR de tenancy e política de associação de identidade. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-010/013: convite, membership, suborganização e administração raiz. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-075 — Isolar planos e snapshots

**Rastreabilidade:** EP-09 / FEAT-09.03 / FN-09.03.02 / US-075. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma empresa nunca consulta dados da outra.

**Objetivo da história.** Como cliente, quero segurança de que meu banco, relatórios e planejamento não vazam.

**Comportamento e regras.** Migrar query keys, FKs, índices e RLS conforme estratégia; `plan_key` sozinho é insuficiente.

**Critérios de aceite observáveis:**

1. **Caso principal:** Dados de planejamento, execuções, bugs, indicadores, caches e revisões do tenant A não são retornados a membro de B.
2. **Caso de controle/limite:** Tentativas por UUID, ID sequencial e alteração manual de planKey são negadas no backend/store.
3. **Aceite do Backlog:** Todas as rotas, queries, jobs, cache e arquivos filtram tenant; testes de acesso cruzado falham fechados.

**Implementação e testes.** Chaves de organização, índices, transações e RLS/roles revisadas. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-010: estratégia por schema/instância, RLS e política de dados. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-076 — Separar credenciais por organização

**Rastreabilidade:** EP-09 / FEAT-09.03 / FN-09.03.03 / US-076. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma empresa nunca consulta dados da outra.

**Objetivo da história.** Como admin, quero conectar Azure sem expor acesso a outro cliente.

**Comportamento e regras.** Segredos isolados em cofre/camada server-side, auditoria de acesso e mascaramento completo em logs.

**Critérios de aceite observáveis:**

1. **Caso principal:** PAT/credenciais do tenant A jamais aparecem para usuário, log, job ou worker do tenant B.
2. **Caso de controle/limite:** Excluir/rotacionar segredo não interrompe conexão de outro tenant, salvo falha externa global explícita.
3. **Aceite do Backlog:** Segredos não transitam em DTO; rotação e revogação não afetam tenants não relacionados.

**Implementação e testes.** Vault/criptografia/escopos de conexão, revisão de threat model. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** OPEN-010/013: modelo de chave, retenção e rotação. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## SEC-077 — Migrar dados existentes sem perda

**Rastreabilidade:** EP-09 / FEAT-09.03 / FN-09.03.04 / US-077. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Uma empresa nunca consulta dados da outra.

**Objetivo da história.** Como gestor, quero abrir meus planos antigos após a migração multiempresa.

**Comportamento e regras.** Criar fixtures, dump/restore testado, validação de row counts/checksums e plano de rollback.

**Critérios de aceite observáveis:**

1. **Caso principal:** Migração de dados existentes preserva plano, snapshots, agendas, revisões e chaves antes/depois sob equivalência medida.
2. **Caso de controle/limite:** Falha de migração permite rollback; nenhuma organização nova recebe dados legados por omissão.
3. **Aceite do Backlog:** Plano atual associado a tenant de migração explícito, sem duplicação/perda, rollback testado.

**Implementação e testes.** Backfill por chaves, dry-run SQL, snapshot pré-migração e teste em base isolada. Teste negativo obrigatório de permissão (cliente sem sessão, QA leitor tentando escrita, link expirado, usuário de outro tenant); não confiar na UI para autorização. Validar segredo/TTL e logs. Evidência concreta por arquivos: `backend/src/http/writeAuth.ts`, `backend/src/routes/api.ts`, `frontend/src/api.ts`, `backend/src/db/postgres/migrations/`.

**Dependência, decisão ou risco pendente.** Organização proprietária dos dados legados e janela de migração são decisões administrativas. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte VIII — Auditoria, observabilidade e governança (EP-10)

**Para o negócio:** Há revisões de planejamento e estado de job de sync; não há trilha nominal de edição célula por célula nem observabilidade por conector multiempresa.

**Implementação de referência (não equivale a novo escopo):** `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Regra de fronteira:** Auditoria de autoria depende de identidade de usuário, ausente hoje. Não preencher retrospectivamente autores de registros legados.

## GOV-078 — Registrar before/after das edições

**Rastreabilidade:** EP-10 / FEAT-10.01 / FN-10.01.01 / US-078. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Preservar histórico útil sem poluir a tela.

**Objetivo da história.** Como admin, quero saber quem mudou um valor do plano.

**Comportamento e regras.** Hoje planning_revision registra baseline/reason, não before/after por célula.

**Critérios de aceite observáveis:**

1. **Caso principal:** Edição de planejamento grava autor, instante, campo, valor anterior, novo valor e escopo do plano.
2. **Caso de controle/limite:** Consulta do histórico não permite editar ou alterar o conteúdo do registro já auditado.
3. **Aceite do Backlog:** Evento contém ator, plano, timestamp, tipo, valores antes/depois minimizados; nenhuma credencial.

**Implementação e testes.** Requer identidade, transação e política de retenção. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** Política de retenção, correção de dados pessoais e imutabilidade. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## GOV-079 — Exibir relógio de histórico

**Rastreabilidade:** EP-10 / FEAT-10.01 / FN-10.01.02 / US-079. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Preservar histórico útil sem poluir a tela.

**Objetivo da história.** Como usuário, quero consultar alterações sem uma área enorme.

**Comportamento e regras.** Depende de identificação real do autor, registros e acesso de leitura por perfil.

**Critérios de aceite observáveis:**

1. **Caso principal:** Ícone discreto próximo ao usuário abre histórico das alterações autorizadas, por data e por objeto.
2. **Caso de controle/limite:** Sem eventos existentes, mostrar estado vazio honesto; não reconstituir evento antigo fictício.
3. **Aceite do Backlog:** Ícone discreto próximo à área do usuário abre histórico filtrável; QA pode ler conforme papel.

**Implementação e testes.** Componente acessível; não inventar autor para eventos legados. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** Quem pode visualizar alterações de outras pessoas e granularidade de filtros. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## GOV-080 — Auditar mudanças de KPI/ofensor

**Rastreabilidade:** EP-10 / FEAT-10.01 / FN-10.01.03 / US-080. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Preservar histórico útil sem poluir a tela.

**Objetivo da história.** Como auditor, quero rastrear mudanças que afetam números históricos.

**Comportamento e regras.** Rastreio de configuração e versionamento de KPI para auditoria e rollback.

**Critérios de aceite observáveis:**

1. **Caso principal:** Mudança de fórmula, ofensor ou campo de origem guarda versão anterior e regra nova, com autoria e escopo.
2. **Caso de controle/limite:** Recalcular KPI não apaga definição histórica nem atribui efeito retroativo sem decisão.
3. **Aceite do Backlog:** Configuração versionada permite reconstruir rótulo/fórmula usada em relatório anterior.

**Implementação e testes.** Snapshot da versão de regra, sem reclassificação silenciosa. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** OPEN-002/003: política de versões e recálculo de períodos antigos. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## GOV-081 — Mostrar proveniência dos números

**Rastreabilidade:** EP-10 / FEAT-10.02 / FN-10.02.01 / US-081. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Separar falha de sincronização de ausência real de teste.

**Objetivo da história.** Como gestor, quero conhecer fonte e momento do último refresh de um KPI.

**Comportamento e regras.** Proveniência vinculada a última sincronização e cálculo, sem duplicar fórmulas no frontend.

**Critérios de aceite observáveis:**

1. **Caso principal:** Cada indicador identifica fonte, unidade, período do snapshot e regra utilizada ao apresentar valor.
2. **Caso de controle/limite:** Campo ausente, falha de conexão e zero medido são estados distintos na UI e API.
3. **Aceite do Backlog:** Cada indicador informa data/escopo/fonte e sinaliza dado atrasado ou indisponível.

**Implementação e testes.** Metadados de snapshots, referência estável, testes sem usar horário local aleatório. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** Design do detalhe/tooltip de proveniência e nível de abertura por perfil. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## GOV-082 — Registrar falhas sem segredos

**Rastreabilidade:** EP-10 / FEAT-10.02 / FN-10.02.02 / US-082. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Separar falha de sincronização de ausência real de teste.

**Objetivo da história.** Como operador, quero diagnosticar sync sem expor PAT ou dados pessoais.

**Comportamento e regras.** Log estruturado e correlation ID por request/job podem ser propostos; não afirmar que já existem.

**Critérios de aceite observáveis:**

1. **Caso principal:** Erros operacionais descrevem o componente e a causa sanitizada, sem PAT, bearer ou payload sensível.
2. **Caso de controle/limite:** Em integração fora do ar, status de job e dados de último refresh permanecem rastreáveis sem falsificar atualização.
3. **Aceite do Backlog:** Erros têm categoria, etapa, ID de correlação e retry seguro; logs redigem segredos.

**Implementação e testes.** Tratamento 429, timeout, falhas de banco e PIIs. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** Retenção/monitoramento e políticas de alertas a definir. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## GOV-083 — Manter contexto de desenvolvimento atualizado

**Rastreabilidade:** EP-10 / FEAT-10.02 / FN-10.02.03 / US-083. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Separar falha de sincronização de ausência real de teste.

**Objetivo da história.** Como desenvolvedor, quero receber handoff curto sem documentação contraditória.

**Comportamento e regras.** Documentos canônicos em `.cursor/docs/`. As referências operacionais de `context/` apontam para `.cursor/docs/adr/` e para o alias oficial de homologação. URLs com hash de deployment permanecem só como histórico.

**Critérios de aceite observáveis:**

1. **Caso principal:** Atualização do produto acompanha revisão de requisitos, ADR, testes e release quando muda comportamento.
2. **Caso de controle/limite:** Caminhos de docs e alias oficial de homologação usados nas regras de agente estão corretos, não apontam para Preview obsoleto.
3. **Aceite do Backlog:** `context/*` e `.cursor/docs/*` descrevem caminhos e URLs atuais, com data/fonte, sem dumps de chats.

**Implementação e testes.** Uma story de manutenção separada para docs de contexto. Teste de alteração antes/depois, autoria, ordenação de eventos, permissão de leitura do histórico, erro sanitizado e revisão documental sem links obsoletos. Evidência concreta por arquivos: `backend/src/services/{planningService,syncJob}.ts`, `backend/src/db/postgres/migrations/`, `backend/src/routes/api.ts`, `.cursor/docs/`, `backend/src/vercel/deployShape.test.ts`.

**Dependência, decisão ou risco pendente.** Regras de agente Cursor e revisão periódica ficam para o item 2 após este documento. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte IX — Gestão nativa futura de Test Cases e execuções (EP-11)

**Para o negócio:** Gestão nativa é horizonte posterior, não funcionalidade existente. Registrar resultado ao executar no futuro não é digitar KPI manual.

**Implementação de referência (não equivale a novo escopo):** `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Regra de fronteira:** Este módulo é horizonte futuro. Registro de um teste executado **dentro do FourQA** não viola a regra atual de não redigitar execuções realizadas no Azure.

## NAT-084 — Criar e editar Test Case

**Rastreabilidade:** EP-11 / FEAT-11.01 / FN-11.01.01 / US-084. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Organizar casos quando o cliente não dispõe de uma ferramenta externa.

**Objetivo da história.** Como QA autorizado, quero documentar passos, dados e resultado esperado do caso.

**Comportamento e regras.** Novas entidades e autorização; inexistentes no backend atual.

**Critérios de aceite observáveis:**

1. **Caso principal:** Usuário autorizado cadastra caso de teste nativo com título, pré-condições, passos e resultado esperado; recebe ID local.
2. **Caso de controle/limite:** Criar caso não altera Work Item Azure nem duplica Test Point sem vínculo autorizado.
3. **Aceite do Backlog:** Casos com ID, versão, suíte, pré-condições e autor; validação de campos e histórico.

**Implementação e testes.** Modelo normalizado sem copiar dados/licença TestLink; autorização EP-09. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Campos mínimos, tipo de caso, papéis de autoria e tenancy. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-085 — Versionar revisão de cenário

**Rastreabilidade:** EP-11 / FEAT-11.01 / FN-11.01.02 / US-085. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Organizar casos quando o cliente não dispõe de uma ferramenta externa.

**Objetivo da história.** Como líder, quero saber qual versão foi executada.

**Comportamento e regras.** Versionamento imutável de testcase, compatibilidade entre ciclos e revisão.

**Critérios de aceite observáveis:**

1. **Caso principal:** Alterar passos de caso cria versão, preservando qual versão foi usada em execução histórica.
2. **Caso de controle/limite:** Uma execução antiga continua apontando ao conjunto de passos da época, não ao texto mais recente.
3. **Aceite do Backlog:** Edição gera versão/referência; execução histórica permanece ligada à versão usada.

**Implementação e testes.** Controle de alterações com integridade referencial. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Política de publicação, revisão e aprovação de versão. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-086 — Organizar suites e prioridades

**Rastreabilidade:** EP-11 / FEAT-11.01 / FN-11.01.03 / US-086. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Organizar casos quando o cliente não dispõe de uma ferramenta externa.

**Objetivo da história.** Como líder, quero navegar por hierarquia e prioridade nativas.

**Comportamento e regras.** Modelar namespaces de IDs por origem, hierarquia e integridade referencial.

**Critérios de aceite observáveis:**

1. **Caso principal:** Suite nativa agrupa casos com hierarquia e prioridade; mesma numeração externa não colide com ID interno.
2. **Caso de controle/limite:** Ordenar, mover ou renomear uma suite não apaga casos ou resultados históricos.
3. **Aceite do Backlog:** Suíte pode conter casos e prioridades; não conflitar IDs externos com IDs internos.

**Implementação e testes.** Camada de origem IDs e normalização de hierarquia. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Política de vincular/deduplicar suíte nativa e externa. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-087 — Iniciar ciclo de testes

**Rastreabilidade:** EP-11 / FEAT-11.02 / FN-11.02.01 / US-087. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Fazer execução no FourQA sem digitar contagens artificiais.

**Objetivo da história.** Como admin, quero escolher escopo, responsáveis e período de uma execução.

**Comportamento e regras.** Conceitos de Test Cycle/Run/Result devem ser modelados antes da UI; diferente do snapshot Azure.

**Critérios de aceite observáveis:**

1. **Caso principal:** Admin abre ciclo com escopo de casos versionados, período e responsáveis conforme papel autorizado.
2. **Caso de controle/limite:** Revisão do ciclo não modifica execuções anteriores nem agenda de Test Plan externo sem ação autorizada.
3. **Aceite do Backlog:** Ciclo referencia versões de casos, testers e Test Plan interno, sem apagar planejamentos antigos.

**Implementação e testes.** Contratos próprios do motor de execução e testes de baseline. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Granularidade de ciclo e ligação com metas de Planejamento. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-088 — Registrar resultado ao executar

**Rastreabilidade:** EP-11 / FEAT-11.02 / FN-11.02.02 / US-088. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Fazer execução no FourQA sem digitar contagens artificiais.

**Objetivo da história.** Como QA executor autorizado, quero marcar Passed/Failed/Blocked e evidências no ato de executar.

**Comportamento e regras.** Módulo nativo pode exigir papel de executor novo; isso não altera perfil QA intermediário somente leitura atual.

**Critérios de aceite observáveis:**

1. **Caso principal:** QA executor explicitamente autorizado marca Passed/Failed/Blocked no próprio ato de executar, gerando evento real.
2. **Caso de controle/limite:** Indicadores derivam de runs/resultados, e não de uma caixa onde se digita quantidade de produtividade.
3. **Aceite do Backlog:** Um run real gera evento e histórico; painel automático deriva contagens do evento, não de campo manual de produtividade.

**Implementação e testes.** Modelo de Test Run/Result, regras de transição e trilha de autoria. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Matriz de papéis do módulo nativo, política de reexecução e cancelamento. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-089 — Associar evidências com segurança

**Rastreabilidade:** EP-11 / FEAT-11.02 / FN-11.02.03 / US-089. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Fazer execução no FourQA sem digitar contagens artificiais.

**Objetivo da história.** Como QA, quero anexar provas de falhas sem expor arquivos a outras empresas.

**Comportamento e regras.** Storage/antivírus/ACL/URL assinada e retenção em futuro ADR.

**Critérios de aceite observáveis:**

1. **Caso principal:** Evidence anexada a resultado pertence ao tenant/plano/run correto e só é acessível a perfil autorizado.
2. **Caso de controle/limite:** Arquivo incorreto, malicioso, grande ou expirado é rejeitado sem vazar metadados sensíveis.
3. **Aceite do Backlog:** Arquivos com limites, antivírus/política e ACL por tenant; link expirado ou não autorizado negado.

**Implementação e testes.** Storage, metadata, segurança e retention a definir. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Limites, formatos, custos e gestão de dados pessoais. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-090 — Identificar origem de cada execução

**Rastreabilidade:** EP-11 / FEAT-11.03 / FN-11.03.01 / US-090. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Clientes escolhem se executam no FourQA ou em fonte externa.

**Objetivo da história.** Como gestor, quero somar resultados de fontes distintas sem duplicar cenário.

**Comportamento e regras.** Contratos de origem, normalização, transformação de status e idempotência.

**Critérios de aceite observáveis:**

1. **Caso principal:** Resultado carrega namespace da origem e ID estável; dados Azure e FourQA não são somados duas vezes se refletem o mesmo teste.
2. **Caso de controle/limite:** Mudança de conector não apaga a origem histórica nem reatribui executores/responsáveis.
3. **Aceite do Backlog:** IDs externos e internos têm namespaces separados; transformação de status documentada.

**Implementação e testes.** Contrato de origem, deduplicação e migração gradual. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Política de fusão de cenários de origens distintas sem identidade confiável. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## NAT-091 — Exportar casos autorizados

**Rastreabilidade:** EP-11 / FEAT-11.03 / FN-11.03.02 / US-091. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Clientes escolhem se executam no FourQA ou em fonte externa.

**Objetivo da história.** Como QA, quero exportar casos para uso autorizado.

**Comportamento e regras.** Exportação nativa futura não implica escrita automática no Azure ou conector bidirecional.

**Critérios de aceite observáveis:**

1. **Caso principal:** Exportação contém apenas Test Cases permitidos ao perfil e ao tenant atual.
2. **Caso de controle/limite:** Formato e versão informados no arquivo; outro tenant jamais é incluído em seleção por ID.
3. **Aceite do Backlog:** Formato/versionamento documentados e nenhum caso de outro cliente no arquivo.

**Implementação e testes.** Definir formato e testes de isolamento; sem prometer sync bidirecional automático. Na fase nativa futura, teste de versão de caso, ciclo/reexecução, transição de status e isolamento de evidências/tenant; não criar meta manual de KPI. Evidência concreta por arquivos: `backend/src/azure/execucoes.ts`, `frontend/src/pages/ExecucoesPage.tsx`, `backend/src/routes/api.ts`; código atual é somente leitura da fonte externa.

**Dependência, decisão ou risco pendente.** Formato suportado, privacidade, auditoria e limites de tamanho. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Parte X — Gestão nativa futura de bugs e fluxos de falha (EP-12)

**Para o negócio:** Gestão de defeitos própria é horizonte posterior à estabilização da plataforma de acompanhamento.

**Implementação de referência (não equivale a novo escopo):** `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Regra de fronteira:** Este módulo é horizonte futuro. Módulo atual Falhas permanece consulta; nova escrita requer papéis, rastreio e autorização distintos.

## BUG-092 — Criar bug nativo

**Rastreabilidade:** EP-12 / FEAT-12.01 / FN-12.01.01 / US-092. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Abrir e acompanhar defeito sem depender de ferramenta externa.

**Objetivo da história.** Como QA autorizado, quero registrar um defeito com evidência e prioridade.

**Comportamento e regras.** Gestão nativa posterior, com mudança formal de permissões.

**Critérios de aceite observáveis:**

1. **Caso principal:** QA autorizado registra bug com título, passos de reprodução, severidade, evidência e vínculo a resultado.
2. **Caso de controle/limite:** Bug recebe ID interno com namespace e não colide com ID de Work Item Azure.
3. **Aceite do Backlog:** Bug recebe ID interno, título, detalhes, reprodução, severity/status e vínculo com execução.

**Implementação e testes.** Autorização e campos obrigatórios; sem conflitar com bug Azure. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** Matriz de autoria e campos mandatórios do ciclo de bug. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## BUG-093 — Atualizar estado do bug

**Rastreabilidade:** EP-12 / FEAT-12.01 / FN-12.01.02 / US-093. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Abrir e acompanhar defeito sem depender de ferramenta externa.

**Objetivo da história.** Como responsável autorizado, quero mover o bug entre aberto, em correção, resolvido e fechado.

**Comportamento e regras.** Máquina de estados, autorização backend, trilha e consistência de KPI.

**Critérios de aceite observáveis:**

1. **Caso principal:** Transição de estado só ocorre entre etapas permitidas e registra autor/data.
2. **Caso de controle/limite:** QA leitor atual não pode alterar status de bug até liberação explícita de papel novo.
3. **Aceite do Backlog:** Transições válidas, autoria e audit trail; QA leitor padrão não edita até decisão de papéis para módulo nativo.

**Implementação e testes.** Máquina de estados e RBAC dedicado; não assumir permissões atuais mudaram. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** Quais transições e exceções/reabertura serão permitidas. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## BUG-094 — Relacionar bug a múltiplas execuções

**Rastreabilidade:** EP-12 / FEAT-12.01 / FN-12.01.03 / US-094. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Abrir e acompanhar defeito sem depender de ferramenta externa.

**Objetivo da história.** Como líder, quero ver cenários atingidos por um mesmo defeito.

**Comportamento e regras.** Tabela de relação N:N, chaves e testes de deduplicação.

**Critérios de aceite observáveis:**

1. **Caso principal:** Um bug pode vincular vários resultados sem se multiplicar como entidade nas contas por bug.
2. **Caso de controle/limite:** Remover vínculo não exclui bug nem altera resultado histórico sem política aprovada.
3. **Aceite do Backlog:** Uma entidade Bug pode afetar N Test Points/Results sem multiplicar contagem de bugs.

**Implementação e testes.** Tabela associação, deduplicação e testes N:N. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** Política de vínculo com resultados externos e exclusões. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## BUG-095 — Classificar ofensor do bug nativo

**Rastreabilidade:** EP-12 / FEAT-12.02 / FN-12.02.01 / US-095. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Usar defeitos como parte do acompanhamento de QA.

**Objetivo da história.** Como gestão, quero que categoria de ofensor siga mapeamento de cada plano.

**Comportamento e regras.** Reutilizar regras RPT-004/005/006, sem classificador paralelo por origem.

**Critérios de aceite observáveis:**

1. **Caso principal:** Categoria de ofensor de bug nativo usa taxonomia configurada e diferenciada do campo Ambiente.
2. **Caso de controle/limite:** Bug sem mapeamento explícito permanece não classificado; não vira Outros automaticamente.
3. **Aceite do Backlog:** Ofensor não é ambiente, fonte nem criador; registros não classificados continuam visíveis.

**Implementação e testes.** Reutilizar regras EP-03 com namespace de origem. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** Categorias obrigatórias, fallback e versionamento das regras. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## BUG-096 — Associar bug após falha

**Rastreabilidade:** EP-12 / FEAT-12.02 / FN-12.02.02 / US-096. **Situação:** **Planejado — não implementado** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Usar defeitos como parte do acompanhamento de QA.

**Objetivo da história.** Como QA, quero vincular resultado Failed a bug conhecido ou criar um novo.

**Comportamento e regras.** Vínculo entre Run Result e Bug com idempotência e auditoria; depende EP-11.

**Critérios de aceite observáveis:**

1. **Caso principal:** Após Failed em execução nativa, pessoa autorizada associa bug existente ou inicia criação, sem bloquear outros casos automaticamente.
2. **Caso de controle/limite:** Salvar vínculo duas vezes não gera duplicatas e não faz patch no Azure por engano.
3. **Aceite do Backlog:** A ação cria vínculo idempotente, sem bloquear em lote implicitamente; permissões e confirmação claras.

**Implementação e testes.** Integração com Test Run EP-11 e audit EP-10. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** Em qual momento solicitar vínculo e exigência de bug por failure. Não alterar produção, banco remoto ou integração real como parte desta especificação.

## BUG-097 — Bloqueio em lote explicitamente autorizado

**Rastreabilidade:** EP-12 / FEAT-12.02 / FN-12.02.03 / US-097. **Situação:** **Adiado — não construir agora** (classificação do Backlog, sujeita a verificação na branch de trabalho).

**Em palavras simples.** Usar defeitos como parte do acompanhamento de QA.

**Objetivo da história.** Como admin, quero bloquear cenários afetados por bug quando a política do cliente permitir.

**Comportamento e regras.** Adiado; executar primeiro em motor nativo; escrita Azure exige discovery e consentimento separados.

**Critérios de aceite observáveis:**

1. **Caso principal:** Antes de bloquear um conjunto de resultados, admin revisa seleção, motivo, bug e confirmação explícita.
2. **Caso de controle/limite:** Falha parcial ou repetição de solicitação informa quais pontos foram alterados, e ação pode ser reconciliada.
3. **Aceite do Backlog:** Lista de cenários/revisão é mostrada antes de alterar; resultados e erro parciais auditados.

**Implementação e testes.** Primeiro em motor nativo; escrita em Azure exige autorização/contrato separado; OPEN-009. Na fase nativa futura, teste da máquina de estados de bug, relacionamento N:N, classificação sem chute, falha parcial e bloqueio apenas sob permissão explícita. Evidência concreta por arquivos: `backend/src/azure/falhas.ts`, `frontend/src/pages/FalhasPage.tsx`, `backend/src/routes/api.ts`; código atual lê bugs sem criar/editar.

**Dependência, decisão ou risco pendente.** OPEN-009: política de bloqueio, rollback e escopo de escrita em fonte externa. Não alterar produção, banco remoto ou integração real como parte desta especificação.

---

# Rastreabilidade consolidada da v1.2

## Matriz das histórias acrescentadas

| Épico | Feature | IDs funcionais | Histórias | Direção da entrega |
|---|---|---|---|---|
| EP-06 | FEAT-06.01, FEAT-06.02, FEAT-06.03 | OPR-044–OPR-051 | US-044–US-051 | Validação/evolução planejada |
| EP-07 | FEAT-07.01, FEAT-07.02, FEAT-07.03 | INT-052–INT-061 | US-052–US-061 | Validação/evolução planejada |
| EP-08 | FEAT-08.01, FEAT-08.02 | CAT-062–CAT-067 | US-062–US-067 | Validação/evolução planejada |
| EP-09 | FEAT-09.01, FEAT-09.02, FEAT-09.03 | SEC-068–SEC-077 | US-068–US-077 | Validação/evolução planejada |
| EP-10 | FEAT-10.01, FEAT-10.02 | GOV-078–GOV-083 | US-078–US-083 | Validação/evolução planejada |
| EP-11 | FEAT-11.01, FEAT-11.02, FEAT-11.03 | NAT-084–NAT-091 | US-084–US-091 | Horizonte posterior |
| EP-12 | FEAT-12.01, FEAT-12.02 | BUG-092–BUG-097 | US-092–US-097 | Horizonte posterior |

## Ordem de decisão antes de implementação

1. **Hoje: EP-06 e EP-07:** verificar que telas existentes funcionam com snapshot válido e tests de contrato/migração; não alterar semântica de status ou sync indevidamente. Itens de EP-06 e EP-07 que exigem novas APIs/colunas só entram em sprint depois do respectivo plano aprovado.
2. **Próximo produto configurável: EP-08 e EP-09:** resolver OPEN-010/011/013 antes de publicar dashboard multiempresa, SSO, acesso por link e segregação de dados. Não usar `plan_key` como boundary de tenant.
3. **Governança: EP-10:** desenhar registro imutável e retenção, auditando mudanças do Report/KPI, planejamento e conexão; autoria nominal só com login implementado.
4. **Horizonte estratégico: EP-11/12:** gestão nativa fica adiada até módulo de acompanhamento se estabilizar, com decisão específica para papéis de executor, modelo de Run/Result e escrita externa (OPEN-009).
5. **Já priorizado no ROADMAP:** nenhuma parte nova desta versão reordena a sequência aprovada do Report: Status dos Cenários → Impacto do Cliente/totais → KPI configurável → ofensores/mapeamento → regressão/aceite. Não começar EP-06/07 só porque agora estão documentados.

## Testes obrigatórios por tipo de alteração

| Mudança | Teste automatizado mínimo | Validação humana/operacional |
|---|---|---|
| Semântica de status / relatório | Partição de Test Points, cancelados, zero, Report vs Status, fixtures de dois planos | Conferir porcentagens/unidades com dados sanitizados, sem confundir Bug com Test Point. |
| Snapshot Azure | Retentativa 429, páginas vazias e múltiplas, resultado tardio, rollback da transação, `plan_key` e IDs | Smoke autorizado de integração, sem alteração externa; checar última sync. |
| Coluna persistida / migração | Migração forward/backward se suportada, equivalência em banco de teste, valores nulos e backfill | Backup e plano de rollback validados antes de tocar no Supabase real. |
| Login / papéis / link / tenancy | Negar explicitamente acesso cruzado, escrita de QA, link expirado e escalation por ID | Revisão de ameaça e proteção Preview separadas. |
| KPIs e ofensores configuráveis | Fórmula segura, ausência de campo, divergência de populações, auditoria de regra | Revisão dos valores por quem conhece o processo Azure. |
| Fluxo nativo | Versões de Test Case, Run/Result, máquina de estados Bug, anexos ACL e idempotência | Aceite de domínio e autorização antes de permitir edição real. |
| CSS/tela | Testes de componente quando existirem, typecheck e snapshots visuais representativos | Conferir desktop com painéis lado a lado e mobile com dados preenchidos. |
| Publicação | `npm test`, `npm run typecheck`, build e checagem de artefatos/segredos; smoke Preview | **Somente mediante autorização:** projeto `fourqa`, alias único `https://fourqa-homolog-heltonmarques-8008.vercel.app`, jamais `--prod` sem autorização. |

## Limitações declaradas da revisão

- Trata-se de **requisitos**, não de prova de que as features existem, nem de execução de testes. O inventário foi baseado no ZIP de 20/10/2026 e nos documentos de referência entregues ao assistente.
- Há diferenças intencionais/transitórias entre o Report atualizado e a aba Status/Planejamento em cálculos legados. Os novos requisitos não as resolvem automaticamente.
- A **Evolução QA individual em suíte compartilhada** permanece uma pendência matemática sem contrato de atribuição factual (OPEN-001). A nova documentação não autoriza rateios como fatos ou preenchimento manual.
- Microsoft/Google OIDC, links externos, novos conectores, gerenciamento nativo e multiempresa não são funcionalidades prontas. Estimativas de esforço e datas não foram aprovadas.
- A v1.1 é preservada funcionalmente. Pendências do Report/Planejamento/Evolução QA e decisões abertas em `DECISIONS.md` continuam em aberto. Alterá-las exige revisão formal rastreável.

## Quando considerar o item 1 da documentação concluído

**Documentalmente completo para planejamento** quando os módulos acima estiverem disponíveis em `.cursor/docs/REQUIREMENTS.md`, os IDs das histórias e requisitos não colidirem, decisões pendentes estiverem explícitas e o Cursor tiver acesso à mesma versão do `BACKLOG.md`, `DECISIONS.md` e `ARCHITECTURE.md`.

**Não confundir com requisitos refinados para sprint:** cada história selecionada ainda passa por discovery técnico e critério de pronto específico, validação com usuário e testes. A próxima atividade documental/operacional é revisar a ligação dos agentes e regras de Cursor à fonte de verdade canônica, conforme etapa 2 previamente combinada.

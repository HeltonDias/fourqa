# FourQA — Visão do produto

Etapa 2.1. Documento de produto, de 16/10/2026.

Descreve o problema, o público, o que o produto faz hoje e a direção de evolução. A coluna **Hoje** apoia-se na auditoria de 15/10/2026, nos ADRs e na validação da pesquisa aprofundada. A coluna **Direção** registra decisões de produto. Não é desenho de banco, de API nem de tela.

O FourQA é um produto proprietário. O código e o uso não são abertos.

## 1. O que é e qual problema resolve

O FourQA acompanha a execução de QA e apresenta o status do trabalho sem que o time reconstrua, à mão, a planilha que antes concentrava essa conta.

O problema é operacional. Os testes nascem e são executados numa ferramenta externa — hoje, o Azure DevOps. O status que o cliente e a gestão precisam ver (quanto foi planejado, quanto foi realizado, o que falhou, de quem é o impacto, como cada frente está) não sai pronto dessa ferramenta. A resposta histórica foi uma planilha: regras próprias, cópia de dados, rótulos do projeto e risco de a conta divergir conforme quem atualiza.

O FourQA assume essa conta. Lê o plano de testes, calcula os indicadores e guarda o planejamento que a ferramenta de execução não faz: período, quantidades por data, prioridade e responsável da suíte, revisão de baseline. A planilha permanece como referência de onde as regras vieram. Deixou de ser o lugar onde o status é produzido.

| | Hoje | Direção |
|---|---|---|
| Papel | Aplicação web de acompanhamento de QA ligada a um Azure DevOps | Plataforma configurável de gestão de QA, reutilizável entre clientes e projetos |
| Sistema de registro dos testes | Azure DevOps | Azure enquanto a execução viver lá; gestão própria de testes e bugs só num horizonte posterior |
| Onde a meta é definida | No FourQA (planejamento) | No FourQA, com responsáveis e indicadores administráveis |
| Onde o resultado é digitado | Em lugar nenhum do FourQA. O resultado vem do sync | Continua calculado. A Evolução QA não se preenche à mão |

## 2. Público-alvo e potencial comercial

**Quem usa hoje**, no recorte de um projeto:

- Coordenação de QA, que apresenta o status e acompanha frente, gap e impactos.
- Quem planeja a execução: datas, quantidades, prioridade e responsável da suíte.
- Quem consulta execuções e falhas já trazidas do Azure, sem lançá-las de novo.

Não há, no produto, os papéis de administrador, QA e visualizador. Quem possui o token compartilhado escreve. Na publicação protegida, a leitura também exige esse token. Um link só de leitura, por plano, não existe.

**Quem o produto passa a poder atender**, quando a configuração deixar de morar no código:

- Operações de QA que repetem o mesmo tipo de status para clientes diferentes — fábrica, consultoria ou time interno com vários projetos.
- Cada cliente, com sua taxonomia de impactos, seus responsáveis e seus indicadores, sem uma versão do FourQA por contrato.
- A gestão do cliente, como público do Report, quando existir um acesso de leitura separado da operação.

O potencial comercial está nessa repetição. O FourQA já concentra um acompanhamento que antes vivia numa planilha de um engajamento. O valor de produto é levar o mesmo acompanhamento a outro cliente e a outro projeto sem regravar categorias, KPIs e nomes de responsável. Enquanto esses rótulos continuarem no cálculo, cada contrato novo é uma alteração de software, não uma configuração.

Não há, nesta visão, preço, pacote ou meta de mercado. A forma de isolamento entre empresas (instalação por cliente ou plataforma compartilhada) também não está escolhida. O que está escolhido é que `plan_key` sozinho não separa clientes.

## 3. Situação atual

Auditoria somente leitura de 15/10/2026. O que está abaixo é o produto em funcionamento, não o desenho da pesquisa aprofundada. Aquela pesquisa misturou proposta e hipótese com o código; a validação separou os dois. Itens citados lá e ausentes aqui — login institucional, conectores além do Azure, distribuição em montanha, extensão de navegador, evolução individual de QA, várias empresas — não estão implementados.

### O que a aplicação faz

Monorepo com interface React e API Express. Cinco telas:

| Tela | O que entrega | O que a pessoa edita |
|---|---|---|
| Report (`/`) | Indicadores, gráficos e gestão de impactos do plano | Cabeçalho e período |
| Planejamento | Grade por suíte e dia, baseline e revisão | Datas, quantidades, prioridade, responsável e motivo da revisão |
| Status (`/status-frente`) | Agregação por frente | Nada. Leitura |
| Execuções | Snapshot paginado dos Test Points | Busca |
| Falhas | Snapshot paginado dos bugs ligados ao plano | Nada. Leitura |

A sincronização é manual, pelo Atualizar. Não há agendamento no repositório. Um lote válido substitui execuções, falhas e as metas daquele refresh. O planejamento confirmado permanece. Se a validação falha, o lote anterior fica. O snapshot é o estado atual dos pontos, não o histórico de todas as execuções.

O banco operacional é PostgreSQL. SQLite permanece para testes, backup e importação histórica da planilha. O isolamento dos planos é um texto, `plan_key` (padrão `EndToEnd`), não uma empresa. Não há tabelas de empresa, usuário ou papel.

### O que já é flexível

- A hierarquia do Test Plan é detectada na árvore. Frente e prioridade não têm nível fixo. Sem confiança, o rótulo é "Nível N". Um override por ambiente pode vencer a detecção. A lista de frentes válidas é dica do projeto, não uma taxonomia global.
- O status de execução tem uma regra só, no backend. A interface não reclassifica.
- Título e subtítulo do Report, e o período do plano, são editáveis na aplicação. O texto padrão do cabeçalho ainda carrega a redação de um engajamento.
- O mapa categoria de falha → responsável pode ser informado por ambiente. Não é uma tela.

### O que ainda é de um engajamento só

- Os cortes do Report tratam responsáveis pelos nomes de um contrato, entre eles "Desenvolvimento Foursys" e "Cliente CVP". Os percentuais de bugs e os cartões de impacto dependem desses textos.
- O KPI de impactos classifica o responsável em três baldes fixos no código: Foursys, Cliente (incluindo o texto "cvp") e Reteste.
- Há tratamento explícito de um plano `UAT` no painel de bugs.
- A credencial do Azure e o token da API são do ambiente. Outra empresa não cabe em outro `plan_key`.

### Planejamento, status e evolução

O planejamento guarda quantidade por suíte e data. Suíte com identificador vira uma linha; o baseline é a contagem de Test Points. Sem suíte, cada ponto vira linha. Responsável e prioridade da suíte são texto livre, um por linha, não um usuário do sistema. A prioridade do Test Case no Azure é outro campo, lido no sync, e não fica disponível como coluna do snapshot SQL.

A Home ainda calcula o percentual planejado com as datas herdadas da importação. O módulo Planejamento usa baseline confirmado, membership e distribuição por data. As duas contas convivem de propósito: a tela de Planejamento não altera a Home.

O status por frente classifica a frente (gap, finalizado, não aplicável). Isso não é evolução de uma pessoa. Não existe tela nem métrica de Evolução QA individual. Com um único responsável por suíte, a meta inteira cai nesse texto. `run_by` identifica quem executou no Azure e não é o dono da meta.

Revisão de planejamento existe: motivo, origem do baseline e escopo. Não há trilha de cada célula (valor antigo, valor novo, autor). Fim de semana sai da grade e não há interruptor para incluí-lo. Não há distribuição automática, linhas por QA nem meta por pessoa.

### Autenticação e publicação

Um bearer compartilhado protege a escrita. Não há usuário, papel, JWT nem OAuth do produto. A proteção de URL do ambiente publicado é barreira do host, não o modelo de acesso do FourQA.

O produto não cria, não atribui e não altera work item nem resultado no Azure. Ninguém lança execução no FourQA.

## 4. Visão de evolução

O FourQA deixa de ser o relatório de um contrato e passa a ser a plataforma em que cada cliente configura o próprio acompanhamento de QA.

A primeira entrega demonstrável é o Report. Ele precisa servir a clientes e projetos diferentes sem categorias e KPIs gravados no código. Login próprio, extensão de navegador e o restante da plataforma não são pré-requisito dessa demonstração.

Em seguida, no mesmo produto e ainda sem tratar isso como pronto:

- Indicadores, classificações de impacto e responsáveis viram configuração administrável. O que hoje é nome fixo ou mapa de ambiente passa a ser dado do projeto, editável por quem administra, válido para aquele cliente.
- A Evolução QA passa a existir, individual e automática. A meta nasce no FourQA. O resultado nasce da ferramenta onde o teste foi executado. Ninguém preenche execução para alimentar essa visão.
- A entrada do produto passa a ser um dashboard inicial, com um card por Test Plan. Nome e subtítulo de cada plano são personalizados no FourQA, à parte do cabeçalho do Report que já se edita hoje.
- A hierarquia dinâmica, a regra única de status e a separação entre meta (FourQA) e resultado (fonte externa) continuam. A evolução amplia o que já é confiável; não cria uma segunda fórmula na interface.

A plataforma configurável, no sentido deste documento, é: o mesmo FourQA, vários clientes, cada um com seus planos, sua taxonomia e seus indicadores, sem ramificação de código por contrato.

Itens da pesquisa aprofundada que permanecem proposta, e não entram na demonstração do Report: distribuição em montanha, pop-up de total do dia, linhas expansíveis por QA, bloqueio em lote a partir de uma falha, histórico visual de célula e extensão de navegador. Podem voltar ao backlog quando a visão correspondente for priorizada. Não descrevem o produto atual. O link compartilhável é decisão de permissão futura, do visualizador externo, e também fica fora dessa demonstração.

## 5. Azure DevOps e integrações futuras

**Hoje** a integração em uso é o Azure DevOps Test Plans, única fonte de suítes, Test Points, resultados e bugs. Jira/Xray, Zephyr e OpenText ALM Octane são possibilidades futuras e não estão no produto.

O sync lê a árvore de suítes, os pontos paginados e as runs com bugs. O cliente espera e repete em limite de taxa e em falha transitória. Não escreve no Azure: a única chamada POST é leitura em lote de work items. O token de acesso fica no ambiente, no backend. Não vai ao banco, à interface nem a log.

Campos que a pesquisa tratou como já exibidos e que o produto ainda não usa como dono da informação:

- Assigned To é pedido no lote de bugs e não é gravado. Não define a Evolução QA.
- Created By é pedido e não entra na linha de falha. O responsável da falha sai do mapa de categorias.
- Quem executou (`run_by`) fica no snapshot e não é o critério da meta.

**Direção.** Enquanto a execução viver no Azure, ele continua a fonte do resultado. A conexão deixa de ser um único segredo de ambiente e passa a poder existir por cliente, no horizonte multiempresa. A configuração dessa conexão é administrativa; não é um passo da demonstração do Report.

Jira/Xray, Zephyr e OpenText ALM Octane podem, mais adiante, alimentar os mesmos indicadores, sem copiar os nomes de campo do Azure para dentro do relatório. São possibilidades, não compromisso da demonstração, e não estão desenhadas aqui.

A gestão própria de testes e bugs, quando existir, muda o papel do Azure: de única fonte para uma fonte possível. Até lá, o FourQA não é o sistema onde o teste ou o bug é aberto.

## 6. Princípios

1. **Automação.** Indicadores saem do sync e das regras do produto. A pessoa não recopila resultado que a ferramenta de execução já tem. A sincronização pode continuar disparada por alguém; o que não se pede é redigitar execução, bug ou status.
2. **Baixo esforço manual.** Configurar um cliente é escolher plano, taxonomia, indicadores e responsáveis. Não é manter planilha paralela nem editar código. A Evolução QA, quando existir, acompanha a meta e o resultado sozinha.
3. **Flexibilidade entre clientes.** Categorias, classificações de impacto, responsáveis e KPIs são configuração do projeto. Hierarquia de suíte continua detectada, com override quando o projeto precisar. Um rótulo de um contrato não entra na regra dos demais.
4. **Confiabilidade dos indicadores.** Uma regra de status, no backend. A interface não recalcula por conta própria. Home e Planejamento divergem de propósito enquanto a decisão do ADR correspondente valer; a visão não manda igualar as duas contas. Quantidade repartida entre pessoas, sem vínculo de Test Point ou Test Case, não pode ser publicada como resultado real de cada uma. Estimativa não ocupa o lugar de execução. O KPI de um refresh não se mistura com o snapshot anterior.
5. **Experiência de uso.** O acompanhamento é legível para quem apresenta o status e para quem planeja. Cabeçalho do projeto, estados de carregamento, vazio e erro, e status compreensível sem depender só de cor já orientam a interface. A configuração nova entra nesse mesmo produto, sem uma tela paralela por cliente.

## 7. Direção futura

Estes três eixos vêm depois do Report demonstrável. Não estão no código. Não bloqueiam a demonstração.

### Multiempresa

Hoje há um banco, uma credencial Azure, um token e vários `plan_key`. Várias empresas nesse desenho misturariam planos, snapshots e acesso.

A direção é isolar o cliente: pessoas e papéis daquela empresa, credencial de integração daquela empresa, e uma chave de tenant em planejamento, snapshot e metas. O desenho (schema, instalação, cobrança) fica para uma decisão própria. Esta visão só fixa o requisito: cliente A não vê o plano, o snapshot nem o token do cliente B.

### Autenticação

Hoje o acesso de escrita é um segredo compartilhado. A direção é identidade do produto: usuário, papel e escopo por empresa. Quando essa etapa chegar, os acessos são três:

- **Administrador:** edita e configura.
- **QA intermediário:** autenticado, com acesso somente para consulta.
- **Visualizador externo:** acessa apenas o Report, por link compartilhável.

Login próprio e o link do visualizador não são pré-requisito da demonstração do Report. Proteção do ambiente publicado continua sendo barreira de host até o modelo de papéis existir. Os dois não se substituem.

### Gestão própria de testes e bugs

Hoje o FourQA lê testes e bugs. Não os cria.

A direção é o FourQA poder ser, ele mesmo, o lugar onde testes e bugs são geridos, para clientes que não queiram depender só de uma ferramenta externa. Isso é horizonte de plataforma, posterior ao Report configurável e à Evolução QA automática.

Enquanto o resultado vier de fora, a Evolução QA continua sem preenchimento manual. Se um dia o FourQA for o sistema onde a execução acontece, o registro é o ato de executar no produto — não um número digitado para fechar indicador.

## Horizonte

| Quando | O que entra | O que fica de fora |
|---|---|---|
| Demonstração de curto prazo | Report utilizável por clientes e projetos diferentes, sem categorias e KPIs fixos no código | Login próprio, link do visualizador, dashboard inicial, extensão, multiempresa, gestão própria de testes e bugs, Jira/Xray, Zephyr e OpenText ALM Octane |
| Evolução do produto | Indicadores, classificações de impacto e responsáveis administráveis; Evolução QA individual e automática, com meta no FourQA e resultado na fonte; dashboard inicial com um card por Test Plan, nome e subtítulo personalizáveis no FourQA | Publicar estimativa como se fosse execução de cada QA |
| Plataforma | Multiempresa, autenticação com os três acessos, gestão própria de testes e bugs, Jira/Xray, Zephyr e OpenText ALM Octane se forem priorizados | Transformar proposta da pesquisa aprofundada em escopo implícito |

## Fontes

- Auditoria da implementação, 15/10/2026.
- Validação da pesquisa aprofundada, que separa código vigente de proposta.
- ADRs de hierarquia dinâmica, status, Home versus planejamento, e baseline.
- Decisões de produto desta etapa: Report configurável entre clientes; indicadores, impactos e responsáveis administráveis; Evolução QA individual e automática; demonstração pelo Report; produto proprietário; administrador, QA intermediário e visualizador externo; dashboard inicial por Test Plan; Azure DevOps como integração atual e Jira/Xray, Zephyr e OpenText ALM Octane como possibilidades futuras.

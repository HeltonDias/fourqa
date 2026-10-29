# FourQA — Backlog de produto: Epics, Features, Functions e User Stories

> **20/10/2026 | v1.0 | Plano de produto rastreável, não autorização para implementar tudo.**
> **Para uma pessoa leiga:** leia “Por que existe”, “Feature” e “Como saber que deu certo” nas histórias. **Para engenharia:** leia “Função técnica”, critérios, referência, decisão e estado.

## 1. Como está organizado o trabalho

**Epic (EP):** objetivo grande do produto (por exemplo, “Planejamento”).
**Feature (FEAT):** capacidade visível e útil (por exemplo, “Distribuição automática”).
**Function (FN):** operação específica para construir a Feature (por exemplo, “calcular curva Montanha”), **não é** uma função TypeScript obrigatoriamente.
**User Story (BRD):** necessidade expressa de uma pessoa e sua evidência de aceite.
**Task/Subtask:** criada ao detalhar implementação; não está artificialmente especificada aqui.

Relação:
**Epic → Feature → Function → Story → (futuras tasks, testes, PRs e releases)**.
Os IDs não mudam quando a história é migrada para Azure Boards, Jira ou outra plataforma.

**Estado:**
`Existente`/`Implementada no ZIP` = há código observável, ainda exige testes/aceite;
`Planejada` = não implementada;
`Bloqueada` = depende de resposta técnica/negócio;
`Adiada` = visão futura.
**Prioridade**
(`P0` a `P3`) = proposta de organização,
**não cronograma aceito**: P0 essencial agora, P1 próxima evolução, P2 produto comercial, P3 horizonte.

**Fontes:** código e testes do ZIP de 20/10/2026;
`VISION.md`;
`REQUIREMENTS.md` (RPT-001–009 **somente Report**);
`DECISIONS.md`; ADRs 001–004; conversas de produto. Não transformar a pesquisa antiga em fato sobre o código.
Atualizações de perfis e da Evolução QA têm bloqueios explícitos.

## 2. Visão geral dos Épicos

| ID | Epic | Propósito | Marco |
|---|---|---|---|
| EP-01 | Qualidade, segurança e publicação | Permitir evolução segura e previsível, sem expor planilhas ou alterar produção sem autorização. | M0 e transversal |
| EP-02 | Report executivo e indicadores | Apresentar números compreensíveis e configuráveis, mantendo sua semântica. | M1–M2 |
| EP-03 | Ofensores, impactos e classificação | Explicar quais áreas causam impedimentos sem culpar um cliente por ausência de dados. | M2 |
| EP-04 | Planejamento e responsabilidades | Transformar metas por suíte em um cronograma revisável e equilibrado. | M3 |
| EP-05 | Evolução QA automática e individual | Mostrar a evolução por nome de QA sem que ninguém preencha outra planilha. | M5 |
| EP-06 | Status, Execuções e Falhas operacionais | Detalhar situação de frentes, cenários e bugs sem retrabalho. | M4 |
| EP-07 | Integrações externas e sincronização | Receber dados de ferramentas de teste de forma previsível, segura e extensível. | M2/M6/M8 |
| EP-08 | Dashboard e catálogo de Test Plans | Escolher o plano certo antes de entrar no Report, evitando misturar fases e projetos. | M6 |
| EP-09 | Identidade, acessos e multiempresa | Dar acesso comercial seguro e impedir cruzamento de dados entre clientes. | M7 |
| EP-10 | Auditoria, observabilidade e governança | Saber o que mudou, quem alterou e se os dados estão confiáveis. | M0/M4/M7 |
| EP-11 | Gestão nativa de Test Cases e execuções | No horizonte comercial, possibilitar que testes nasçam e sejam executados dentro do FourQA. | M9 |
| EP-12 | Gestão nativa de bugs e fluxos de falha | Gerenciar defeitos próprios e relacioná-los aos casos e impactos. | M9 |

## 3. Hierarquia completa e histórias

Os títulos de Stories são escritos para negócio; cada função indica o comportamento e o teste principal. Uma história só muda para **Aceita** quando há implementação, testes relevantes e validação do responsável pelo produto. Não há aceite automático pela existência de código.


### EP-01 — Qualidade, segurança e publicação

**Por que existe:** Permitir evolução segura e previsível, sem expor planilhas ou alterar produção sem autorização.
**Fase:** M0 e transversal.
**Referências:** DEC-025/026/027; ARCHITECTURE §7–8.


#### FEAT-01.01 — Higiene do deployment

**Em palavras simples:** Só os arquivos necessários à aplicação devem chegar à Vercel.\
**Prioridade de trabalho:** P0.
**Base técnica/requisitos:** `.vercelignore`; `backend/src/vercel/deployShape.test.ts`.


##### FN-01.01.01 — Bloquear artefatos locais | US-001

**História de usuário:** Como responsável pelo produto, quero que bancos, planilhas e backups locais nunca sejam enviados no Preview.\
**Como saber que deu certo (aceite):** A lista de upload não inclui `data/`, `.db*`, `.xlsx`, backups e análise; mantém `fonte/util/` e o build compila.\
**Detalhe técnico/testes:** Conferir `.vercelignore`, teste de formato e inventário do deployment.\
**Estado:** Presente no ZIP; validar publicação.


##### FN-01.01.02 — Checklist de publicação | US-002

**História de usuário:** Como responsável pelo release, quero atualizar somente o ambiente oficial de homologação.\
**Como saber que deu certo (aceite):** Git/commit identificados, testes e saúde aprovados; alias `fourqa-homolog-heltonmarques-8008.vercel.app` aponta ao Preview novo; sem `--prod`.\
**Detalhe técnico/testes:** Documento de release, operação manual, verificação posterior e rollback; sem atualizar URL de deployment imutável.\
**Estado:** Planejada.


#### FEAT-01.02 — Confiança na entrega

**Em palavras simples:** Saber quando código, dados e visual estão realmente prontos.\
**Prioridade de trabalho:** P0. **Base técnica/requisitos:** `package.json`; testes do backend.


##### FN-01.02.01 — Critério de pronto padronizado | US-003

**História de usuário:** Como líder, quero evidência objetiva de que uma história está pronta.\
**Como saber que deu certo (aceite):** Registro mostra testes, typecheck, inspeção visual, casos de borda, riscos e aceite; Ready não basta.\
**Detalhe técnico/testes:** DoD/DoR no ROADMAP; relacionar história e evidências; sem aprovar alterações automaticamente.\
**Estado:** Planejada.


##### FN-01.02.02 — Smoke de homologação | US-004

**História de usuário:** Como QA, quero verificar se a publicação responde corretamente.\
**Como saber que deu certo (aceite):** Home e API respondem com autorização esperada; dados de escopo correto, erro e vazio tratados; nenhuma escrita acidental.\
**Detalhe técnico/testes:** Smoke manual inicialmente; automatizar quando credenciais de teste isoladas existirem.\
**Estado:** Planejada.


##### FN-01.02.03 — Reduzir divergências de contexto | US-005

**História de usuário:** Como desenvolvedor, quero encontrar documentação correta sem reler o repositório todo.\
**Como saber que deu certo (aceite):** `context/*` aponta para `.cursor/docs/adr` e URL oficial; não apresenta Preview antigo como atual.\
**Detalhe técnico/testes:** Atualizar PROJECT_MAP, DOMAIN_RULES, HANDOFF, vercel.md em mudança documental dedicada.\
**Estado:** Planejada.


##### FN-01.02.04 — Travar o porte Python com regressão | US-098

**História de usuário:** Como responsável pelo produto, quero que um desencontro de nome ou de idioma entre o domínio Python e o JSON não apareça só depois de clicar em Atualizar.\
**Como saber que deu certo (aceite):** `detect_dimensions` reconhece frente dentro do nome da suíte; planejamento com `scope_snapshot` e com alocação devolve contagens sem `KeyError` nem `TypeError`; camelCase existe só no JSON da API; uma varredura dos retornos do domínio não encontra leitor camelCase interno.\
**Detalhe técnico/testes:** pytest de dimensão, de `diff_scope`/`schedule_of` com snapshot e de alocação `planned_quantity`. A correção pontual de 2026-10-29 (regex em `dimensions.py` e chaves em `planning_service.py`) não substitui esses testes. DEC-033.\
**Estado:** Planejada. **Prioridade:** P0, depois dos dois crashes já corrigidos no código.


### EP-02 — Report executivo e indicadores

**Por que existe:** Apresentar números compreensíveis e configuráveis, mantendo sua semântica. **Fase:** M1–M2. **Referências:** RPT-001/002/003/007/009; DEC-005–010.


#### FEAT-02.01 — Semântica e nomenclatura

**Em palavras simples:** O usuário lê o mesmo fato de forma correta, sem linguagem ofensiva.\
**Prioridade de trabalho:** P0. **Base técnica/requisitos:** `ScenarioStatusPanel.tsx`, `ReportKpiRow.tsx`, `ReportPage.tsx`.


##### FN-02.01.01 — Impacto do Cliente como padrão | US-006

**História de usuário:** Como gestor, quero ler “Impacto do Cliente” no lugar de “Bugs Cliente”.\
**Como saber que deu certo (aceite):** Cards envolvidos usam termo adequado e não alteram a fórmula só porque mudou texto; percentual e total de abertos ficam distinguíveis.\
**Detalhe técnico/testes:** RPT-002; alterar apresentação sem renomear chaves DTO obrigatoriamente.\
**Estado:** Planejada.


##### FN-02.01.02 — Totais junto aos títulos | US-007

**História de usuário:** Como gestor, quero localizar imediatamente o universo de cada seção.\
**Como saber que deu certo (aceite):** Status, Impactados, Evoluções e Gestão de Impactos exibem total correto junto ao cabeçalho sem duplicar bugs/pontos.\
**Detalhe técnico/testes:** RPT-007; a unidade e o escopo devem acompanhar a métrica; evitar recomputação incompatível.\
**Estado:** Planejada.


##### FN-02.01.03 — Status em 4+7 indicadores | US-008

**História de usuário:** Como gestor, quero separar Total/Planejados/Finalizados/Pendentes dos sete estados.\
**Como saber que deu certo (aceite):** Passed+N/A fecha Finalizados; Total−Finalizados fecha Pendentes; segunda faixa contém sete cards em uma linha de desktop; sem clipping.\
**Detalhe técnico/testes:** RPT-003; testar versões desktop e 390px; não mudar `classifyExecution`.\
**Estado:** Implementada no ZIP; aceitar visualmente.


#### FEAT-02.02 — Catálogo de KPIs

**Em palavras simples:** Configurar o significado de cada indicador sem precisar modificar componentes por cliente.\
**Prioridade de trabalho:** P0. **Base técnica/requisitos:** `getHome`, `ReportKpiRow.tsx`, sem entidade KPI hoje.


##### FN-02.02.01 — Definir metadados de KPI | US-009

**História de usuário:** Como admin, quero cadastrar indicadores com título, unidade, população, fonte e fórmula.\
**Como saber que deu certo (aceite):** Configuração separa apresentação/cálculo, define versão e rejeita unidade/denominador incompatíveis.\
**Detalhe técnico/testes:** Desenhar esquema e contrato; OPEN-002/003 exigem ADR.\
**Estado:** Planejada.


##### FN-02.02.02 — Persistir KPI por Test Plan | US-010

**História de usuário:** Como admin, quero que a configuração de um plano não modifique outro.\
**Como saber que deu certo (aceite):** Plano A muda label/fórmula; plano B mantém valores; reload conserva edição; revisão é rastreável.\
**Detalhe técnico/testes:** Migrar PostgreSQL com escopo claro, testes de isolamento; não tratar `plan_key` como tenant.\
**Estado:** Planejada.


##### FN-02.02.03 — Editar títulos sem recálculo | US-011

**História de usuário:** Como admin, quero renomear um KPI sem alterar o número por acidente.\
**Como saber que deu certo (aceite):** Mudar apenas o título não altera resultado, população ou fórmula; cancelar descarta rascunho.\
**Detalhe técnico/testes:** Reutilizar UX do `ReportTitles`, respeitar permissão de escrita e diferenciar formulário de fórmula.\
**Estado:** Planejada.


##### FN-02.02.04 — Avaliar fórmulas de modo seguro | US-012

**História de usuário:** Como administrador, quero personalizar cálculos sem comprometer a integridade dos dados.\
**Como saber que deu certo (aceite):** Operadores permitidos são validados; falta de campo retorna indisponível; sem `eval` ou SQL arbitrário do navegador.\
**Detalhe técnico/testes:** Proposta de motor declarativo + testes de catálogo/limites; aprovação de OPEN-002 antes de implementar.\
**Estado:** Planejada.


##### FN-02.02.05 — Regressão do Report configurável | US-013

**História de usuário:** Como gestor, quero confiar nas métricas depois de personalizá-las.\
**Como saber que deu certo (aceite):** Dois Test Plans e três conjuntos de dados (vazio, legado, misto) reproduzem números corretos; UI não recalcula em paralelo.\
**Detalhe técnico/testes:** Testes de `reportService`, componentes, snapshot e semântica RPT-001–009.\
**Estado:** Planejada.


### EP-03 — Ofensores, impactos e classificação

**Por que existe:** Explicar quais áreas causam impedimentos sem culpar um cliente por ausência de dados. **Fase:** M2. **Referências:** RPT-004/005/006/008; DEC-011/012/029.


#### FEAT-03.01 — Taxonomia configurável

**Em palavras simples:** Categorias de impacto ajustadas por cliente e plano.\
**Prioridade de trabalho:** P0. **Base técnica/requisitos:** `kpis.ts`, `falhas.ts`, `ImpactResponsaveisPanel.tsx`.


##### FN-03.01.01 — Cadastrar ofensores | US-014

**História de usuário:** Como admin, quero cadastrar Dev Backend/Frontend/Mobile, PO, Cliente, Parceiro, Negócio, Infra/Ambiente, QA, Outros e novos nomes.\
**Como saber que deu certo (aceite):** Categorias são únicas no escopo, persistidas e não dependem de textos “Foursys/CVP”.\
**Detalhe técnico/testes:** RPT-004; não impor limite fictício de categorias.\
**Estado:** Planejada.


##### FN-03.01.02 — Mapear campos reais do Azure | US-015

**História de usuário:** Como admin, quero associar valores do Azure às categorias do FourQA.\
**Como saber que deu certo (aceite):** O editor lista somente fontes disponíveis ou descobertas; mapeamento inválido não gera classificações; regras podem ser testadas.\
**Detalhe técnico/testes:** RPT-005; resolver OPEN-004; versionar de-para e origem do campo.\
**Estado:** Planejada.


##### FN-03.01.03 — Separar ofensor de ambiente | US-016

**História de usuário:** Como gestão, quero distinguir causa responsável do local do erro.\
**Como saber que deu certo (aceite):** Bug com `Ambiente=V3` não entra automaticamente no ofensor Infra/Ambiente; campos podem aparecer separadamente.\
**Detalhe técnico/testes:** RPT-008; não assumir que tag `V3Online` identifica responsabilidade.\
**Estado:** Planejada.


#### FEAT-03.02 — Coerência das métricas de impacto

**Em palavras simples:** As quantidades atribuídas precisam somar corretamente e ter unidade clara.\
**Prioridade de trabalho:** P0. **Base técnica/requisitos:** `reportService.gestaoImpactos`, `classificarImpactosKpi`.


##### FN-03.02.01 — Fechar a soma dos cenários impactados | US-017

**História de usuário:** Como gestor, quero que classificados + não classificados somem o total de Test Points impactados.\
**Como saber que deu certo (aceite):** Cada Test Point Failed/Blocked entra uma vez; não classificado explícito; total coincide com título.\
**Detalhe técnico/testes:** RPT-006; remover lógica de “Reteste como resto” somente com migração consistente.\
**Estado:** Planejada.


##### FN-03.02.02 — Não confundir bug e Test Point | US-018

**História de usuário:** Como gestor, quero saber quando um indicador conta bugs ou cenários.\
**Como saber que deu certo (aceite):** Totais de Gestão de Impactos contam bugs; Cenários Impactados contam pontos; tooltip/legenda esclarece diferença.\
**Detalhe técnico/testes:** Validar domínios, agrupar por id correto, proteger contra duplicação de vínculo.\
**Estado:** Planejada.


##### FN-03.02.03 — Classificação por Test Plan isolada | US-019

**História de usuário:** Como admin de dois planos, quero que cada um use seus ofensores.\
**Como saber que deu certo (aceite):** Adicionar categoria no plano A não muda plano B; sync com campo ausente não copia mapa de outro.\
**Detalhe técnico/testes:** Persistência, filtros API, casos de borda multi-plano, não confundir com multiempresa.\
**Estado:** Planejada.


### EP-04 — Planejamento e responsabilidades

**Por que existe:** Transformar metas por suíte em um cronograma revisável e equilibrado. **Fase:** M3. **Referências:** ADR 004; DEC-013–017/020; OPEN-008/012.


#### FEAT-04.01 — Planejamento cotidiano

**Em palavras simples:** O responsável administra datas sem perder a visão do total.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `PlanningGridTable.tsx`, `PlanejamentoPage.tsx`.


##### FN-04.01.01 — Mostrar total planejado do dia | US-020

**História de usuário:** Como coordenador, quero ver a soma já alocada ao clicar na célula de um dia.\
**Como saber que deu certo (aceite):** O total é soma das alocações daquele dia no plano/revisão; nenhuma “capacidade máxima” inventada.\
**Detalhe técnico/testes:** Consulta do total com escopo e atualização após edição; popover acessível.\
**Estado:** Planejada.


##### FN-04.01.02 — Visualizar e habilitar fins de semana | US-021

**História de usuário:** Como admin, quero sábados e domingos visíveis cinza e inicialmente inativos.\
**Como saber que deu certo (aceite):** A ativação exige confirmação, vale no escopo escolhido e aparece na grade; QA leitor não pode alterar.\
**Detalhe técnico/testes:** Hoje a grade omite dias; definir persistência e manter alocações prévias em desativação.\
**Estado:** Planejada.


##### FN-04.01.03 — Ir diretamente ao mês/ano | US-022

**História de usuário:** Como planejador, quero escolher um período sem navegar semana por semana.\
**Como saber que deu certo (aceite):** Seletor muda visualização sem alterar agenda, timezone ou data de execução.\
**Detalhe técnico/testes:** Componente responsivo; teste virada de ano e meses sem células.\
**Estado:** Planejada.


#### FEAT-04.02 — Distribuição automática

**Em palavras simples:** O sistema propõe carga diária com controle do administrador.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `planningService.ts`, `planning_allocation`.


##### FN-04.02.01 — Distribuir em Montanha | US-023

**História de usuário:** Como admin, quero uma curva de volume crescente até perto do meio e decrescente ao final.\
**Como saber que deu certo (aceite):** Todas as suítes do plano no escopo; total pendente conservado; valores inteiros, não negativos, dias desabilitados respeitados.\
**Detalhe técnico/testes:** Algoritmo determinístico + propriedades; OPEN-008.\
**Estado:** Planejada.


##### FN-04.02.02 — Oferecer distribuição Decrescente | US-024

**História de usuário:** Como admin, quero concentrar mais testes nos primeiros dias.\
**Como saber que deu certo (aceite):** Modo explícito; totais e responsabilidades conservados; sem opção Crescente nesta fase.\
**Detalhe técnico/testes:** Função separada, testes de regressão para períodos curtos.\
**Estado:** Planejada.


##### FN-04.02.03 — Considerar apenas pendentes | US-025

**História de usuário:** Como admin, quero redistribuir somente o que ainda não foi executado.\
**Como saber que deu certo (aceite):** Execuções/feitos reais e suas datas não são sobrescritos; pendência calculada a partir de dados confiáveis.\
**Detalhe técnico/testes:** Distinção Failed como executado vs finalizado; revisar deduplicação do snapshot.\
**Estado:** Planejada.


##### FN-04.02.04 — Confirmar substituição de agenda | US-026

**História de usuário:** Como admin, quero revisar o impacto antes de substituir metas não executadas.\
**Como saber que deu certo (aceite):** Modal informa escopo/quantidade, exige confirmação, cancelar não muda nada; grava transacionalmente ou reverte.\
**Detalhe técnico/testes:** Versionar revisão, trilha before/after e testes rollback/conflito.\
**Estado:** Planejada.


#### FEAT-04.03 — Modos de responsabilidade

**Em palavras simples:** A pessoa principal não muda por acidente e o trabalho pode ser compartilhado.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `planning_item.responsavel` hoje é texto.


##### FN-04.03.01 — Manter responsáveis por padrão | US-027

**História de usuário:** Como admin, quero apenas redistribuir datas, sem trocar suítes de QA.\
**Como saber que deu certo (aceite):** Modo default conserva cada principal e seu total; equilíbrio limitado pela responsabilidade existente.\
**Detalhe técnico/testes:** Algoritmo respeita constraints sem afirmar equilíbrio impossível.\
**Estado:** Planejada.


##### FN-04.03.02 — Transferir suítes inteiras | US-028

**História de usuário:** Como admin, quero mover uma suíte completa para equilibrar carga quando eu autorizar.\
**Como saber que deu certo (aceite):** Não divide o conteúdo da suíte; principal muda só após confirmação; resultado do exemplo 100/20 com suíte 40 pode chegar a 60/60.\
**Detalhe técnico/testes:** Registro de autoria, revisão e cálculo por suíte.\
**Estado:** Planejada.


##### FN-04.03.03 — Compartilhar quantidades por suíte | US-029

**História de usuário:** Como admin, quero atribuir metas de uma suíte a mais de um QA sem apontar casos específicos.\
**Como saber que deu certo (aceite):** Principal preservado, N colaboradores; metas por QA/suíte/dia fecham o pai, nenhuma alteração no Assigned To Azure.\
**Detalhe técnico/testes:** Nova representação de QA Allocation; invariantes sem dupla contagem.\
**Estado:** Planejada.


##### FN-04.03.04 — Expandir e apresentar QAs da suíte | US-030

**História de usuário:** Como QA leitor, quero ver principal e colaboradores sem abrir outra página.\
**Como saber que deu certo (aceite):** Pai mostra nomes e total; expandir apresenta linhas por QA e por dia; somas não duplicam a suíte.\
**Detalhe técnico/testes:** `PlanningGridTable` com controle expand/collapse, acessível e responsivo.\
**Estado:** Planejada.


##### FN-04.03.05 — Proteger baseline e histórico | US-031

**História de usuário:** Como gestor, quero que replanejar não apague revisões anteriores.\
**Como saber que deu certo (aceite):** Revisões anteriores permanecem; cronograma novo é distinto, autor e motivo rastreáveis quando identidade existir.\
**Detalhe técnico/testes:** ADR 004; transação e testes de compatibilidade SQLite/PostgreSQL.\
**Estado:** Planejada.


#### FEAT-04.04 — Prioridade e acompanhamento de capacidade

**Em palavras simples:** Orientar a ordem de execução de suítes e permitir estimativas futuras sem misturar conceitos.\
**Prioridade de trabalho:** P1/P3. **Base técnica/requisitos:** `planning_item.prioridade`; `readCasePriority`.


##### FN-04.04.01 — Definir prioridade de suíte 1/2/3 | US-032

**História de usuário:** Como admin, quero escolher prioridade 1, 2 ou 3 para uma suíte no FourQA.\
**Como saber que deu certo (aceite):** Valores válidos 1/2/3, históricos preservados e critério exibido na grade; não sobrescreve prioridade dos casos no Azure.\
**Detalhe técnico/testes:** Validar UI/API, legado em texto livre e casos inválidos; não trocar campo `case_priority`.\
**Estado:** Planejada.


##### FN-04.04.02 — Exibir prioridade externa do cenário | US-033

**História de usuário:** Como QA, quero distinguir prioridade do Test Case daquela definida para suíte.\
**Como saber que deu certo (aceite):** Prioridade do caso é lida do Azure; rótulo indica fonte e não usa a prioridade manual da suíte como fallback.\
**Detalhe técnico/testes:** Conector Azure + persistência do snapshot; dependência com EP-06.\
**Estado:** Planejada.


##### FN-04.04.03 — Planejar capacidade e feriados futuramente | US-034

**História de usuário:** Como gestor, quero considerar calendários, horas úteis, férias e ausência dos QAs quando houver dados suficientes.\
**Como saber que deu certo (aceite):** Regra e fontes são aprovadas antes da automatização; estimativa de carga não se apresenta como execução real.\
**Detalhe técnico/testes:** Funcionalidade adiada; calendário configurável e cálculos com timezone.\
**Estado:** Adiada.


##### FN-04.04.04 — Simular propostas de distribuição | US-035

**História de usuário:** Como admin, quero comparar cenários de carga sem gravar imediatamente.\
**Como saber que deu certo (aceite):** A simulação é separada da agenda confirmada, tem totais e desfazer; só depois da versão básica de distribuição.\
**Detalhe técnico/testes:** Futuro: motor determinístico + overlay transacional, sem gravar até confirmação.\
**Estado:** Adiada.


### EP-05 — Evolução QA automática e individual

**Por que existe:** Mostrar a evolução por nome de QA sem que ninguém preencha outra planilha. **Fase:** M5. **Referências:** DEC-002/017–019; OPEN-001/007.


#### FEAT-05.01 — Metas e visão por QA

**Em palavras simples:** Cada pessoa encontra sua responsabilidade no plano.\
**Prioridade de trabalho:** P1 (após M3). **Base técnica/requisitos:** Metas futuras por QA e integração com planejamento.


##### FN-05.01.01 — Exibir KPIs individuais | US-036

**História de usuário:** Como QA, quero ver meu planejado, executado, finalizado sem falha e diferença.\
**Como saber que deu certo (aceite):** Cada pessoa aparece isoladamente, com plano/período filtrados; QA não edita números.\
**Detalhe técnico/testes:** Criar DTO por QA, distinguir Planned/Executed/Passed+N/A/Failed.\
**Estado:** Planejada.


##### FN-05.01.02 — Derivar metas do FourQA | US-037

**História de usuário:** Como gestor, quero que o planejado da Evolução seja exatamente o aprovado no Planejamento.\
**Como saber que deu certo (aceite):** Alterar meta aprovada recalcula view prospectivamente, sem reescrever datas históricas.\
**Detalhe técnico/testes:** Fonte única `planning_qa_allocation` após modelagem; versões por revisão.\
**Estado:** Planejada.


#### FEAT-05.02 — Execução factual e status

**Em palavras simples:** Resultados precisam vir da ferramenta externa e não de estimativas.\
**Prioridade de trabalho:** Bloqueada. **Base técnica/requisitos:** `execucoes` snapshot, `run_by`, runs Azure.


##### FN-05.02.01 — Coletar evolução por movimentação real | US-038

**História de usuário:** Como QA, quero saber o que mudou por status e dia, sem lançamentos manuais.\
**Como saber que deu certo (aceite):** Contagens por dia suportam reexecução e eventos tardios; resultados não são inferidos apenas do estado final.\
**Detalhe técnico/testes:** Discovery OPEN-007; examinar histórico Azure autorizado e política de retenção.\
**Estado:** Planejada.


##### FN-05.02.02 — Mostrar detalhamento de status | US-039

**História de usuário:** Como QA, quero ver Passed, N/A, Failed, Blocked e outros estados aplicáveis.\
**Como saber que deu certo (aceite):** Categorias não se sobrepõem no mesmo universo; Failed conta executado mas não finalizado sem falha.\
**Detalhe técnico/testes:** Reutilizar classificador, definir recorte temporal e unidade de contagem.\
**Estado:** Planejada.


##### FN-05.02.03 — Conciliar histórico e reexecuções | US-040

**História de usuário:** Como gestor, quero evitar a mesma execução contada duas vezes.\
**Como saber que deu certo (aceite):** Para run/result duplicado, contagem obedece identidade estável; mudanças de status têm regras claras.\
**Detalhe técnico/testes:** Contrato de eventos e teste de idempotência; OPEN-007.\
**Estado:** Planejada.


#### FEAT-05.03 — Suítes compartilhadas sem ficção

**Em palavras simples:** Evitar números individuais falsos quando existem vários QAs por suíte.\
**Prioridade de trabalho:** Bloqueada. **Base técnica/requisitos:** OPEN-001.


##### FN-05.03.01 — Investigar atribuição factual | US-041

**História de usuário:** Como responsável pelo produto, quero saber se a API fornece sinal confiável para atribuir resultados às metas por QA.\
**Como saber que deu certo (aceite):** Relatório de dados, exemplos de ambiguidade, alternativas e ADR aprovado antes de desenvolver o cálculo.\
**Detalhe técnico/testes:** Spike sem escrever no Azure; não usar `run_by` como propriedade por padrão.\
**Estado:** Planejada.


##### FN-05.03.02 — Apresentar apenas dados atribuíveis com confiança | US-042

**História de usuário:** Como usuário, não quero que estimativa seja apresentada como execução real.\
**Como saber que deu certo (aceite):** Sem associação comprovável, painel sinaliza limitação em vez de inventar 20/10; não pede input manual.\
**Detalhe técnico/testes:** Portão de produto para aceitar abordagem; não assumir rateio proporcional.\
**Estado:** Planejada.


##### FN-05.03.03 — Preservar evolução sem lançamento manual | US-043

**História de usuário:** Como QA, quero trabalhar só na ferramenta de execução.\
**Como saber que deu certo (aceite):** Nenhum formulário de inserção de realizado no FourQA; atualização automática a partir das fontes autorizadas.\
**Detalhe técnico/testes:** Teste de UI/API e permissão; DEC-002/018.\
**Estado:** Planejada.


### EP-06 — Status, Execuções e Falhas operacionais

**Por que existe:** Detalhar situação de frentes, cenários e bugs sem retrabalho. **Fase:** M4. **Referências:** DEC-019/021; ADR 002/003.


#### FEAT-06.01 — Status por frente

**Em palavras simples:** Permitir ver onde há progresso e gargalos por frente.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `StatusPage.tsx`, `statusFrente.ts`, `getStatusPorFrente`.


##### FN-06.01.01 — Preservar status dinâmico por frente | US-044

**História de usuário:** Como coordenador, quero observar frentes conforme a hierarquia real do Test Plan.\
**Como saber que deu certo (aceite):** Frentes detectadas sem hardcode universal; sobreposições são identificadas, não duplicadas.\
**Detalhe técnico/testes:** ADR 001; testes de dimensões e hierarquia; comportamento existente.\
**Estado:** Existente; regressão.


##### FN-06.01.02 — Explicitar divergências semânticas do Report | US-045

**História de usuário:** Como gestor, quero saber por que duas telas podem mostrar números distintos.\
**Como saber que deu certo (aceite):** Status mantém semântica prevista no legado até aprovação de mudança; não unifica cancelados por acidente.\
**Detalhe técnico/testes:** ADR 003, testes isolados de Status e Report.\
**Estado:** Planejada.


#### FEAT-06.02 — Consulta de execuções

**Em palavras simples:** Encontrar cenário e prioridade na fonte sem digitar resultados no FourQA.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `ExecucoesPage.tsx`, `execucoes.ts`, `casePriority.test.ts`.


##### FN-06.02.01 — Buscar e paginar Test Points | US-046

**História de usuário:** Como QA, quero localizar cenários e consultar seus estados.\
**Como saber que deu certo (aceite):** Busca e paginação estáveis, sem sair do escopo do plano; sem escrita de outcome.\
**Detalhe técnico/testes:** Store/queryExecucoes, frontend; já existe busca e paginação.\
**Estado:** Existente; verificar UX.


##### FN-06.02.02 — Persistir prioridade real do Test Case | US-047

**História de usuário:** Como QA, quero ver a prioridade definida no Azure.\
**Como saber que deu certo (aceite):** Se Azure traz prioridade, a lista mostra o valor após refresh PostgreSQL; campo ausente é distinguível de prioridade zero.\
**Detalhe técnico/testes:** `readCasePriority` já lê campo; SQL do snapshot não possui coluna persistida; migração/contrato + teste.\
**Estado:** Planejada.


##### FN-06.02.03 — Explicar data e executor sem atribuir responsabilidade | US-048

**História de usuário:** Como QA, quero consultar data e último executor sem confundir com dono da suíte.\
**Como saber que deu certo (aceite):** Legenda identifica origem Azure, escopo temporal e ausência de dado; não substitui responsável FourQA.\
**Detalhe técnico/testes:** `date_completed`, `run_by`, `last_result_id` e testes de DTO.\
**Estado:** Planejada.


#### FEAT-06.03 — Consulta de falhas

**Em palavras simples:** Entender origem e impacto dos bugs ligados aos cenários.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `FalhasPage.tsx`, `azure/falhas.ts`.


##### FN-06.03.01 — Exibir Created By do bug | US-049

**História de usuário:** Como líder, quero ver quem criou o bug no Azure.\
**Como saber que deu certo (aceite):** Exibe identidade proveniente de `System.CreatedBy`, nunca confunde com ofensor, Assigned To ou executor.\
**Detalhe técnico/testes:** Azure já solicita o campo; persistir DTO/coluna e exibir, preservando cenário sem campo.\
**Estado:** Planejada.


##### FN-06.03.02 — Preservar rastreabilidade de bug | US-050

**História de usuário:** Como QA, quero ver bug, estado, ambiente, ponto e plan associados.\
**Como saber que deu certo (aceite):** Múltiplos vínculos não inventam novos bugs; data de fechamento e ambiente continuam consultáveis.\
**Detalhe técnico/testes:** Teste com bugs repetidos em múltiplos resultados; manter ID e planKey.\
**Estado:** Planejada.


##### FN-06.03.03 — Bloqueio de outros cenários por falha | US-051

**História de usuário:** Como QA, futuramente quero propor bloqueio de cenário em lote e associar um bug.\
**Como saber que deu certo (aceite):** Só após autorização explícita de escrita; selecionar casos, confirmação, idempotência e feedback; não disponível no produto hoje.\
**Detalhe técnico/testes:** Discovery OPEN-009; não chamar POST workitemsbatch de “edição no Azure”.\
**Estado:** Adiada.


### EP-07 — Integrações externas e sincronização

**Por que existe:** Receber dados de ferramentas de teste de forma previsível, segura e extensível. **Fase:** M2/M6/M8. **Referências:** DEC-002/023/029; Azure coletores.


#### FEAT-07.01 — Sincronização Azure confiável

**Em palavras simples:** Atualizar dados sem destruir planejamento ou misturar snapshots de períodos distintos.\
**Prioridade de trabalho:** P0–P1. **Base técnica/requisitos:** `syncService.ts`, `postgresAzureSnapshotStore.ts`, `azure/client.ts`.


##### FN-07.01.01 — Atualizar Test Plans sem duplicação | US-052

**História de usuário:** Como administrador, quero atualizar cenários de um plano usando Azure.\
**Como saber que deu certo (aceite):** Apenas o escopo configurado é atualizado; identifica suite, ponto, caso, plan; progresso e erro são legíveis.\
**Detalhe técnico/testes:** Paginação/retentativas e testes de escopo; sync manual já existe.\
**Estado:** Existente; smoke autorizado.


##### FN-07.01.02 — Garantir snapshot atômico | US-053

**História de usuário:** Como gestor, quero que um refresh falho não mostre execução nova com KPI antigo.\
**Como saber que deu certo (aceite):** Ou publica o lote validado inteiro, ou preserva snapshot anterior; planejamento confirmado não some.\
**Detalhe técnico/testes:** Transação no PostgreSQL, consistência do cache e teste de falhas.\
**Estado:** Existente; regressão.


##### FN-07.01.03 — Exibir estado de sincronização | US-054

**História de usuário:** Como QA, quero distinguir dados atualizados de dados antigos/incompletos.\
**Como saber que deu certo (aceite):** Última atualização, erro, duração e estado de job legíveis; mensagem de campo ausente quando aplicável.\
**Detalhe técnico/testes:** `sync_job`, UI, retries/timeout; sem logar tokens.\
**Estado:** Planejada.


#### FEAT-07.02 — Conexão administrável

**Em palavras simples:** Conectar outra organização/projeto/plano sem editar código.\
**Prioridade de trabalho:** P1–P2. **Base técnica/requisitos:** Config em `.env` hoje; `SYNC_TEST_PLANS`.


##### FN-07.02.01 — Cadastrar conexão Azure manual | US-055

**História de usuário:** Como admin, quero fornecer organização, projeto, plano e credencial pela interface segura.\
**Como saber que deu certo (aceite):** Credencial validada server-side, mascarada, armazenada protegida e nunca devolvida ao frontend.\
**Detalhe técnico/testes:** Contrato por plano e RBAC; não copiar PAT em logs; depende de EP-09.\
**Estado:** Planejada.


##### FN-07.02.02 — Validar permissão e teste de conexão | US-056

**História de usuário:** Como admin, quero saber se tenho acesso ao Test Plan antes de salvar.\
**Como saber que deu certo (aceite):** Falhas 401/403, plano inexistente e limite de API aparecem sem segredos; zero alteração em Azure.\
**Detalhe técnico/testes:** Fluxo de teste com timeouts, rate limit e schemas.\
**Estado:** Planejada.


##### FN-07.02.03 — Extensão assistente de conexão | US-057

**História de usuário:** Como admin, quero iniciar conexão do navegador de ferramenta externa de modo consciente.\
**Como saber que deu certo (aceite):** Plugin opcional solicita consentimento, não captura PAT de página; fallback manual funciona.\
**Detalhe técnico/testes:** Discovery/ameaças do navegador; futuro após conexão manual.\
**Estado:** Adiada.


#### FEAT-07.03 — Novos conectores

**Em palavras simples:** Normalizar dados de ferramentas diferentes mantendo cálculo de KPIs.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Porta/adapters propostos; sem código de outros conectores hoje.


##### FN-07.03.01 — Definir contrato de integração | US-058

**História de usuário:** Como arquiteto, quero que cada ferramenta produza status, suítes, casos, bugs e datas com origem explícita.\
**Como saber que deu certo (aceite):** Adapter declara capacidades/ausências; mesma regra de indicador funciona sem campos Azure hardcoded.\
**Detalhe técnico/testes:** Porta do domínio, normalizador, testes de contrato por fonte.\
**Estado:** Planejada.


##### FN-07.03.02 — Avaliar conector Jira/Xray | US-059

**História de usuário:** Como operação cliente, quero importar execução do conjunto Jira/Xray utilizado pela empresa.\
**Como saber que deu certo (aceite):** Spike documenta edição/API, autenticação, casos e resultados; piloto só quando aprovado.\
**Detalhe técnico/testes:** Não assumir que Jira base substitui Xray; fornecedor/edição a confirmar.\
**Estado:** Adiada.


##### FN-07.03.03 — Avaliar conector Zephyr | US-060

**História de usuário:** Como operação cliente, quero usar a edição Zephyr adotada pela organização.\
**Como saber que deu certo (aceite):** Discovery valida produto/versão, paginação, status, bugs e limites antes de estimar.\
**Detalhe técnico/testes:** Contrato por vendor; API e escopos dependem da edição.\
**Estado:** Adiada.


##### FN-07.03.04 — Avaliar conector ALM Octane | US-061

**História de usuário:** Como operação cliente, quero alimentar o FourQA com dados do OpenText ALM Octane.\
**Como saber que deu certo (aceite):** Discovery identifica projeto, suites, runs e token; sem prometer equivalência total ao Azure.\
**Detalhe técnico/testes:** Spike e matriz de campos; integração futura.\
**Estado:** Adiada.


### EP-08 — Dashboard e catálogo de Test Plans

**Por que existe:** Escolher o plano certo antes de entrar no Report, evitando misturar fases e projetos. **Fase:** M6. **Referências:** DEC-003; VISION §4.


#### FEAT-08.01 — Identidade do Test Plan

**Em palavras simples:** Cada Test Plan externo é uma unidade explícita de configuração.\
**Prioridade de trabalho:** P2. **Base técnica/requisitos:** `plan_key` e metadados snapshot hoje.


##### FN-08.01.01 — Catalogar Test Plans por origem | US-062

**História de usuário:** Como líder, quero registrar Fase 1/2/3 separadamente mesmo sob o mesmo projeto Azure.\
**Como saber que deu certo (aceite):** Cada cartão aponta a identificador de plano externo + conexão; nenhuma colisão entre IDs de diferentes fontes.\
**Detalhe técnico/testes:** Propor tabela/contrato e migração, preservar dados existentes por planKey.\
**Estado:** Planejada.


##### FN-08.01.02 — Personalizar nome e subtítulo do card | US-063

**História de usuário:** Como admin, quero chamar um Test Plan por um nome amigável sem renomeá-lo no Azure.\
**Como saber que deu certo (aceite):** Salvar título/subtítulo só no FourQA; origem externa e ID permanecem imutáveis.\
**Detalhe técnico/testes:** Separar configurações de card dos títulos atuais do Report.\
**Estado:** Planejada.


##### FN-08.01.03 — Mostrar metadados do plano | US-064

**História de usuário:** Como QA, quero saber a qual projeto/delivery e quantidade de suítes/casos o cartão pertence.\
**Como saber que deu certo (aceite):** Campos de origem explicados com timestamp de sync; ausência de dado não é zero inventado.\
**Detalhe técnico/testes:** Normalizar contadores por plano e garantir escopo.\
**Estado:** Planejada.


#### FEAT-08.02 — Navegação e cadastro

**Em palavras simples:** Uma entrada por Test Plan e ações proporcionais ao perfil.\
**Prioridade de trabalho:** P2. **Base técnica/requisitos:** `frontend/src/App.tsx` hoje abre Report direto.


##### FN-08.02.01 — Abrir dashboard inicial | US-065

**História de usuário:** Como usuário autenticado, quero escolher um Test Plan no início.\
**Como saber que deu certo (aceite):** Um card por plano autorizado; escolher card abre Report/Planejamento/Status/Execuções/Falhas no escopo certo.\
**Detalhe técnico/testes:** Rotas parametricas/estado sem vazamento entre planos; testes de refresh deep link.\
**Estado:** Planejada.


##### FN-08.02.02 — Adicionar plano pela interface | US-066

**História de usuário:** Como admin, quero registrar outro plano pelo botão `+`.\
**Como saber que deu certo (aceite):** Card novo exige conexão validada; QA leitor não adiciona; mensagens claras para duplicidade/erro.\
**Detalhe técnico/testes:** Integração com EP-07 e autorização EP-09.\
**Estado:** Planejada.


##### FN-08.02.03 — Preservar contexto no menu | US-067

**História de usuário:** Como usuário, quero navegar entre abas sem perder o Test Plan.\
**Como saber que deu certo (aceite):** A troca de página preserva plano, período e permissões; sem reutilizar snapshot de outro plano.\
**Detalhe técnico/testes:** Routing e API plan scope; smoke de dois planos.\
**Estado:** Planejada.


### EP-09 — Identidade, acessos e multiempresa

**Por que existe:** Dar acesso comercial seguro e impedir cruzamento de dados entre clientes. **Fase:** M7. **Referências:** DEC-004; OPEN-010/011/013.


#### FEAT-09.01 — Autenticação e perfis

**Em palavras simples:** Cada pessoa usa sua conta institucional e tem permissões explícitas.\
**Prioridade de trabalho:** P2–P3. **Base técnica/requisitos:** `writeAuth.ts`, token atual.


##### FN-09.01.01 — Entrar com identidade institucional | US-068

**História de usuário:** Como QA, quero usar minha conta Microsoft ou Google quando suportada.\
**Como saber que deu certo (aceite):** Login autenticado valida identidade e sessão; falha de provedor é tratada; token API transitório não vira identidade.\
**Detalhe técnico/testes:** Discovery OIDC/OAuth, cookies/JWT, CSRF, expiração e convite.\
**Estado:** Planejada.


##### FN-09.01.02 — Autorizar administrador no backend | US-069

**História de usuário:** Como admin, quero editar config e planejamento, e somente pessoas autorizadas fazerem isso.\
**Como saber que deu certo (aceite):** API verifica organização, plano, papel e ação; UI escondida não basta.\
**Detalhe técnico/testes:** RBAC server-side e testes de escalonamento de privilégio.\
**Estado:** Planejada.


##### FN-09.01.03 — Permitir QA apenas leitura | US-070

**História de usuário:** Como QA, quero consultar todas as visões sem risco de editar.\
**Como saber que deu certo (aceite):** Tentativas PUT/POST negadas na API; Report, Planejamento, Status, Execuções, Falhas e Evolução futura legíveis.\
**Detalhe técnico/testes:** Testar HTTP 403, escopo e navegação.\
**Estado:** Planejada.


#### FEAT-09.02 — Report compartilhável

**Em palavras simples:** Gestores externos conseguem consultar Report sem editar o plano.\
**Prioridade de trabalho:** P2–P3. **Base técnica/requisitos:** Nenhum share token hoje.


##### FN-09.02.01 — Criar link restrito ao Report | US-071

**História de usuário:** Como admin, quero compartilhar uma visão executiva read-only.\
**Como saber que deu certo (aceite):** Link não libera Planejamento/Status/API privada; configura escopo do plano e revogação.\
**Detalhe técnico/testes:** Token randômico armazenado hash, política de expiração e rate limit; OPEN-011.\
**Estado:** Planejada.


##### FN-09.02.02 — Revogar e expirar acesso | US-072

**História de usuário:** Como admin, quero invalidar um link antigo.\
**Como saber que deu certo (aceite):** Link revogado/expirado falha imediatamente inclusive em endpoints; sem reutilização após exclusão.\
**Detalhe técnico/testes:** Persistência auditável, testes negativos e logs seguros.\
**Estado:** Planejada.


##### FN-09.02.03 — Filtrar dados sensíveis na visualização | US-073

**História de usuário:** Como gestor, quero um Report sem informações operacionais indevidas.\
**Como saber que deu certo (aceite):** Matriz de campos autorizados, nenhuma credencial/identidade privada vazada por HTML/API.\
**Detalhe técnico/testes:** OPEN-015; sanitização e escopo de serialização.\
**Estado:** Planejada.


#### FEAT-09.03 — Isolamento multiempresa

**Em palavras simples:** Uma empresa nunca consulta dados da outra.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** `plan_key` não é tenant.


##### FN-09.03.01 — Definir organização e membros | US-074

**História de usuário:** Como gestor, quero administrar usuários de minha própria empresa.\
**Como saber que deu certo (aceite):** Membership e papéis por empresa; múltiplas organizações, se permitidas, exigem contexto explícito.\
**Detalhe técnico/testes:** ADR de tenancy e política de associação de identidade.\
**Estado:** Planejada.


##### FN-09.03.02 — Isolar planos e snapshots | US-075

**História de usuário:** Como cliente, quero segurança de que meu banco, relatórios e planejamento não vazam.\
**Como saber que deu certo (aceite):** Todas as rotas, queries, jobs, cache e arquivos filtram tenant; testes de acesso cruzado falham fechados.\
**Detalhe técnico/testes:** Chaves de organização, índices, transações e RLS/roles revisadas.\
**Estado:** Planejada.


##### FN-09.03.03 — Separar credenciais por organização | US-076

**História de usuário:** Como admin, quero conectar Azure sem expor acesso a outro cliente.\
**Como saber que deu certo (aceite):** Segredos não transitam em DTO; rotação e revogação não afetam tenants não relacionados.\
**Detalhe técnico/testes:** Vault/criptografia/escopos de conexão, revisão de threat model.\
**Estado:** Planejada.


##### FN-09.03.04 — Migrar dados existentes sem perda | US-077

**História de usuário:** Como gestor, quero abrir meus planos antigos após a migração multiempresa.\
**Como saber que deu certo (aceite):** Plano atual associado a tenant de migração explícito, sem duplicação/perda, rollback testado.\
**Detalhe técnico/testes:** Backfill por chaves, dry-run SQL, snapshot pré-migração e teste em base isolada.\
**Estado:** Planejada.


### EP-10 — Auditoria, observabilidade e governança

**Por que existe:** Saber o que mudou, quem alterou e se os dados estão confiáveis. **Fase:** M0/M4/M7. **Referências:** DEC-022/025/026; OPEN-007.


#### FEAT-10.01 — Auditoria de configurações e planejamento

**Em palavras simples:** Preservar histórico útil sem poluir a tela.\
**Prioridade de trabalho:** P1–P2. **Base técnica/requisitos:** `planning_revision` sem evento por célula.


##### FN-10.01.01 — Registrar before/after das edições | US-078

**História de usuário:** Como admin, quero saber quem mudou um valor do plano.\
**Como saber que deu certo (aceite):** Evento contém ator, plano, timestamp, tipo, valores antes/depois minimizados; nenhuma credencial.\
**Detalhe técnico/testes:** Requer identidade, transação e política de retenção.\
**Estado:** Planejada.


##### FN-10.01.02 — Exibir relógio de histórico | US-079

**História de usuário:** Como usuário, quero consultar alterações sem uma área enorme.\
**Como saber que deu certo (aceite):** Ícone discreto próximo à área do usuário abre histórico filtrável; QA pode ler conforme papel.\
**Detalhe técnico/testes:** Componente acessível; não inventar autor para eventos legados.\
**Estado:** Planejada.


##### FN-10.01.03 — Auditar mudanças de KPI/ofensor | US-080

**História de usuário:** Como auditor, quero rastrear mudanças que afetam números históricos.\
**Como saber que deu certo (aceite):** Configuração versionada permite reconstruir rótulo/fórmula usada em relatório anterior.\
**Detalhe técnico/testes:** Snapshot da versão de regra, sem reclassificação silenciosa.\
**Estado:** Planejada.


#### FEAT-10.02 — Saúde do dado e operação

**Em palavras simples:** Separar falha de sincronização de ausência real de teste.\
**Prioridade de trabalho:** P1. **Base técnica/requisitos:** `sync_job`, health e logs atuais.


##### FN-10.02.01 — Mostrar proveniência dos números | US-081

**História de usuário:** Como gestor, quero conhecer fonte e momento do último refresh de um KPI.\
**Como saber que deu certo (aceite):** Cada indicador informa data/escopo/fonte e sinaliza dado atrasado ou indisponível.\
**Detalhe técnico/testes:** Metadados de snapshots, referência estável, testes sem usar horário local aleatório.\
**Estado:** Planejada.


##### FN-10.02.02 — Registrar falhas sem segredos | US-082

**História de usuário:** Como operador, quero diagnosticar sync sem expor PAT ou dados pessoais.\
**Como saber que deu certo (aceite):** Erros têm categoria, etapa, ID de correlação e retry seguro; logs redigem segredos.\
**Detalhe técnico/testes:** Tratamento 429, timeout, falhas de banco e PIIs.\
**Estado:** Planejada.


##### FN-10.02.03 — Manter contexto de desenvolvimento atualizado | US-083

**História de usuário:** Como desenvolvedor, quero receber handoff curto sem documentação contraditória.\
**Como saber que deu certo (aceite):** `context/*` e `.cursor/docs/*` descrevem caminhos e URLs atuais, com data/fonte, sem dumps de chats.\
**Detalhe técnico/testes:** Uma story de manutenção separada para docs de contexto.\
**Estado:** Planejada.


### EP-11 — Gestão nativa de Test Cases e execuções

**Por que existe:** No horizonte comercial, possibilitar que testes nasçam e sejam executados dentro do FourQA. **Fase:** M9. **Referências:** DEC-024; proposta futura.


#### FEAT-11.01 — Repositório de Test Cases

**Em palavras simples:** Organizar casos quando o cliente não dispõe de uma ferramenta externa.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Não existe CRUD nativo hoje.


##### FN-11.01.01 — Criar e editar Test Case | US-084

**História de usuário:** Como QA autorizado, quero documentar passos, dados e resultado esperado do caso.\
**Como saber que deu certo (aceite):** Casos com ID, versão, suíte, pré-condições e autor; validação de campos e histórico.\
**Detalhe técnico/testes:** Modelo normalizado sem copiar dados/licença TestLink; autorização EP-09.\
**Estado:** Planejada.


##### FN-11.01.02 — Versionar revisão de cenário | US-085

**História de usuário:** Como líder, quero saber qual versão foi executada.\
**Como saber que deu certo (aceite):** Edição gera versão/referência; execução histórica permanece ligada à versão usada.\
**Detalhe técnico/testes:** Controle de alterações com integridade referencial.\
**Estado:** Planejada.


##### FN-11.01.03 — Organizar suites e prioridades | US-086

**História de usuário:** Como líder, quero navegar por hierarquia e prioridade nativas.\
**Como saber que deu certo (aceite):** Suíte pode conter casos e prioridades; não conflitar IDs externos com IDs internos.\
**Detalhe técnico/testes:** Camada de origem IDs e normalização de hierarquia.\
**Estado:** Planejada.


#### FEAT-11.02 — Ciclos e execuções nativas

**Em palavras simples:** Fazer execução no FourQA sem digitar contagens artificiais.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Execução nativa não existe hoje.


##### FN-11.02.01 — Iniciar ciclo de testes | US-087

**História de usuário:** Como admin, quero escolher escopo, responsáveis e período de uma execução.\
**Como saber que deu certo (aceite):** Ciclo referencia versões de casos, testers e Test Plan interno, sem apagar planejamentos antigos.\
**Detalhe técnico/testes:** Contratos próprios do motor de execução e testes de baseline.\
**Estado:** Planejada.


##### FN-11.02.02 — Registrar resultado ao executar | US-088

**História de usuário:** Como QA executor autorizado, quero marcar Passed/Failed/Blocked e evidências no ato de executar.\
**Como saber que deu certo (aceite):** Um run real gera evento e histórico; painel automático deriva contagens do evento, não de campo manual de produtividade.\
**Detalhe técnico/testes:** Modelo de Test Run/Result, regras de transição e trilha de autoria.\
**Estado:** Planejada.


##### FN-11.02.03 — Associar evidências com segurança | US-089

**História de usuário:** Como QA, quero anexar provas de falhas sem expor arquivos a outras empresas.\
**Como saber que deu certo (aceite):** Arquivos com limites, antivírus/política e ACL por tenant; link expirado ou não autorizado negado.\
**Detalhe técnico/testes:** Storage, metadata, segurança e retention a definir.\
**Estado:** Planejada.


#### FEAT-11.03 — Interoperabilidade nativa/externa

**Em palavras simples:** Clientes escolhem se executam no FourQA ou em fonte externa.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Somente Azure no presente.


##### FN-11.03.01 — Identificar origem de cada execução | US-090

**História de usuário:** Como gestor, quero somar resultados de fontes distintas sem duplicar cenário.\
**Como saber que deu certo (aceite):** IDs externos e internos têm namespaces separados; transformação de status documentada.\
**Detalhe técnico/testes:** Contrato de origem, deduplicação e migração gradual.\
**Estado:** Planejada.


##### FN-11.03.02 — Exportar casos autorizados | US-091

**História de usuário:** Como QA, quero exportar casos para uso autorizado.\
**Como saber que deu certo (aceite):** Formato/versionamento documentados e nenhum caso de outro cliente no arquivo.\
**Detalhe técnico/testes:** Definir formato e testes de isolamento; sem prometer sync bidirecional automático.\
**Estado:** Planejada.


### EP-12 — Gestão nativa de bugs e fluxos de falha

**Por que existe:** Gerenciar defeitos próprios e relacioná-los aos casos e impactos. **Fase:** M9. **Referências:** DEC-024; OPEN-009.


#### FEAT-12.01 — Cadastro e ciclo de vida de bug

**Em palavras simples:** Abrir e acompanhar defeito sem depender de ferramenta externa.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Hoje FourQA apenas lê Work Items.


##### FN-12.01.01 — Criar bug nativo | US-092

**História de usuário:** Como QA autorizado, quero registrar um defeito com evidência e prioridade.\
**Como saber que deu certo (aceite):** Bug recebe ID interno, título, detalhes, reprodução, severity/status e vínculo com execução.\
**Detalhe técnico/testes:** Autorização e campos obrigatórios; sem conflitar com bug Azure.\
**Estado:** Planejada.


##### FN-12.01.02 — Atualizar estado do bug | US-093

**História de usuário:** Como responsável autorizado, quero mover o bug entre aberto, em correção, resolvido e fechado.\
**Como saber que deu certo (aceite):** Transições válidas, autoria e audit trail; QA leitor padrão não edita até decisão de papéis para módulo nativo.\
**Detalhe técnico/testes:** Máquina de estados e RBAC dedicado; não assumir permissões atuais mudaram.\
**Estado:** Planejada.


##### FN-12.01.03 — Relacionar bug a múltiplas execuções | US-094

**História de usuário:** Como líder, quero ver cenários atingidos por um mesmo defeito.\
**Como saber que deu certo (aceite):** Uma entidade Bug pode afetar N Test Points/Results sem multiplicar contagem de bugs.\
**Detalhe técnico/testes:** Tabela associação, deduplicação e testes N:N.\
**Estado:** Planejada.


#### FEAT-12.02 — Impacto e colaboração

**Em palavras simples:** Usar defeitos como parte do acompanhamento de QA.\
**Prioridade de trabalho:** P3. **Base técnica/requisitos:** Modelo de impacto atual parcial.


##### FN-12.02.01 — Classificar ofensor do bug nativo | US-095

**História de usuário:** Como gestão, quero que categoria de ofensor siga mapeamento de cada plano.\
**Como saber que deu certo (aceite):** Ofensor não é ambiente, fonte nem criador; registros não classificados continuam visíveis.\
**Detalhe técnico/testes:** Reutilizar regras EP-03 com namespace de origem.\
**Estado:** Planejada.


##### FN-12.02.02 — Associar bug após falha | US-096

**História de usuário:** Como QA, quero vincular resultado Failed a bug conhecido ou criar um novo.\
**Como saber que deu certo (aceite):** A ação cria vínculo idempotente, sem bloquear em lote implicitamente; permissões e confirmação claras.\
**Detalhe técnico/testes:** Integração com Test Run EP-11 e audit EP-10.\
**Estado:** Planejada.


##### FN-12.02.03 — Bloqueio em lote explicitamente autorizado | US-097

**História de usuário:** Como admin, quero bloquear cenários afetados por bug quando a política do cliente permitir.\
**Como saber que deu certo (aceite):** Lista de cenários/revisão é mostrada antes de alterar; resultados e erro parciais auditados.\
**Detalhe técnico/testes:** Primeiro em motor nativo; escrita em Azure exige autorização/contrato separado; OPEN-009.\
**Estado:** Adiada.


## 4. Regras de desmembramento em tarefas técnicas

Antes de iniciar uma Story: registrar `BRD ID`, `Feature`, `Epic`, referências RPT/DEC/ADR e estado real; delimitar alterações esperadas em frontend, API, banco, integração e docs; escolher fixtures que não contenham dados sensíveis; especificar aceites positivos/negativos e critérios de reversão; avaliar compatibilidade com legado e acesso a outro Test Plan. Dividir uma história se ela exigir migração e refatoração extensa além da fatia validável.

**Exemplo de desmembramento (apenas modelo; não executar):** `US-006` pode ter task de identificar rótulos na UI, task de validar que fórmulas permanecem idênticas e task de teste de regressão/print de aceite. Cada task liga-se ao mesmo ID e só é encerrada com evidência concreta.

## 5. Requisitos e bloqueios transversais

- **RPT-001–009:** fonte detalhada para EP-02 e EP-03; não são requisitos suficientes para EP-04 até EP-12.
- **ADR 001–004:** hierarquia dinâmica, status, divergência Home × Planejamento, baseline revisável. Alterar só com decisão explícita.
- **OPEN-001/007:** impedem cálculo factual individual por QA em suítes compartilhadas e séries temporais sem fonte confiável; **não** atribuir proporcionalmente como se fossem realizações verificadas.
- **OPEN-002–005:** devem ser tratados antes de persistir fórmulas e categorias como se houvesse campo universal Azure.
- **OPEN-010/011/013:** tenancy e SSO precisam de desenho/segurança antes de disponibilizar links externos.
- **Legado de cancelados:** Report novo = Passed + N/A; Status/Planejamento ainda podem somar cancelados em indicadores específicos. Não trocar regra de outros módulos silenciosamente.
- **Autorização:** as funcionalidades administrativas são plano futuro; bearer compartilhado não concede papel individual nem isolamento empresarial.

## 6. Como priorizar e acompanhar no quadro

Campos recomendados na ferramenta de gestão: `Epic ID`, `Feature ID`, `Function ID`, `Story ID`, título, benefício, estado, prioridade, requisito/ADR, dependências, quem aprovou, tamanho estimado após refinamento, teste/evidência, risco, revisão do documento e release. **Não inventar Story Points nem prometer prazo sem medição.**

Fluxo: `Ideia → Discovery → Pronta → Desenvolvimento → Validação → Aceita → Publicada`. `Bloqueada` é status explícito. O `ROADMAP.md` ordena os marcos; esse backlog é a lista de capacidades, não ordem automática de implementação.

## 7. Lacunas que ainda exigem requisitos funcionais extensos

Mesmo com este backlog completo de navegação, **a documentação mestre de requisitos funcionais ainda não terminou**: só o Report está detalhado em `REQUIREMENTS.md`. Antes de implementar os EP-04–EP-12, produzir e aprovar requisitos completos por módulo (objetivos, dados, cálculos, permissões, erros, UX, testes, critérios de aceite, migrações), usando estas histórias como índice. Isso preserva o princípio de concluir uma etapa por vez.

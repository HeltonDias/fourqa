# FourQA — matriz geral de requisitos

**Auditoria:** 2026-10-28. Leitura do repositório. Alvo dos percentuais: Node + React + SQL versionado. Java local não entra na conta.

Documentos irmãos neste diretório: backend, frontend, banco e deploy.

## Metodologia

Fonte canônica: `.cursor/docs/REQUIREMENTS.md` v1.2. **92 requisitos.** Nenhum ID foi inventado. Decisões e histórias são vínculo, não linha extra.

Critérios:

- RPT e a maior parte de PLN/EQA: orações do bloco "Critérios de aceite", separadas por ponto e vírgula quando o texto é um parágrafo.
- OPR até BUG: três casos (principal, limite, aceite do backlog).

**Implementado %** = 100 × critérios com evidência no código Node/React/SQL / critérios do requisito. Arredondamento para inteiro.

**Validado %** = 100 × critérios cobertos por teste que passou em `npm test --prefix backend` nesta sessão, ou por teste cujo comportamento o arquivo afirma e a suíte não rejeitou. Teste que falhou não conta. Teste não executado (Java, `formulas:parity`, browser) não conta.

Pesos iguais entre requisitos na média da área. A média do produto é a média simples desses 92 percentuais. A conta por critério (soma dos critérios) é só sensibilidade. Não usar um número só sem esta nota.

Confiança: média na maior parte da UI, porque o browser não abriu. Alta onde `formulas.test.ts`, `distribute.test.ts`, `writeAuth.test.ts`, `planKey.test.ts` ou `syncJob.test.ts` passaram e o critério é o que o teste afirma.

**Não aferível:** 0 requisitos. Todos os 92 tinham critérios identificáveis. Critérios internos ainda podem estar julgados com confiança média; isso não apaga o percentual, e está dito na coluna de evidência.

Java: controllers locais existem e **não** alteram estes percentuais. `ARCHITECTURE.md` ainda diz que o Java só tem health. Isso é divergência de documento.

## Cobertura

| Recorte | Valor |
|---|---|
| Requisitos identificados | 92 |
| Com critérios e percentual | 92 (cobertura 100% do inventário v1.2) |
| Não aferíveis | 0 |
| Concluídos (100% implementado e 100% validado) | 0 |
| Parciais | 45 |
| Ausentes | 27 |
| Adiados pelo próprio requisito | 7 |
| Futuros (DEC-024, fase nativa) | 13 |
| Média simples de implementado | 22% |
| Média simples de validado | 9% |
| Sensibilidade por critério | 81/350 implementados (23%); 32/350 validados (9%) |

Concluído exigiria 100% nos dois percentuais. Nenhum requisito chegou lá. Ausente significa 0% implementado e o requisito não se declara adiado nem fase nativa posterior.

## Média por área

| Área | Requisitos | Implementado % | Validado % |
|---|---|---|---|
| Report | 9 | 36 | 12 |
| Planejamento | 19 | 34 | 14 |
| Evolução QA | 10 | 0 | 0 |
| Operação | 8 | 46 | 17 |
| Integração | 10 | 30 | 13 |
| Catálogo | 6 | 11 | 0 |
| Identidade | 10 | 13 | 10 |
| Governança | 6 | 28 | 11 |
| Nativo | 14 | 0 | 0 |

A área usa só requisitos com critérios identificados. Nesta auditoria, são todos. Cobertura de cada área: 100% dos IDs da área. A média não inclui peso de negócio além de um voto por requisito.

## Tabela mestre

| ID | Área | Requisito | Fonte | Estado | Implementado % | Validado % | Falta implementar | Prioridade | Evidência |
|---|---|---|---|---|---|---|---|---|---|
| RPT-001 | Report | KPIs configuráveis por projeto e Test Plan | REQUIREMENTS v1.2; DEC-005 | parcial | 20 | 0 | Catálogo de KPI por plano e fórmula separada do nome | alta | getHome e ReportKpiRow fixos. Sem entidade de KPI |
| RPT-002 | Report | Impacto do Cliente no lugar de Bugs Cliente | REQUIREMENTS; DEC-006 | ausente | 0 | 0 | Rótulo configurável; default Impacto do Cliente | alta | ReportKpiRow ainda mostra % BUGS CLIENTE |
| RPT-003 | Report | Status dos Cenários em duas linhas | REQUIREMENTS; DEC-007/008/009; ADR 002 | parcial | 71 | 29 | Evoluções com a mesma conta e ordem Não liberado antes de Design | alta | ScenarioStatusPanel. totalRealizadoLinha. Página Evolução é stub. formulas.test.ts passou |
| RPT-004 | Report | Responsáveis e ofensores configuráveis | REQUIREMENTS; DEC-011/012 | parcial | 40 | 20 | Ofensor por contexto, distinto de ambiente, soma com não classificado | alta | SYNC_RESPONSABILIDADES e ConfiguracoesPage. Sem catálogo de ofensores |
| RPT-005 | Report | Mapeamento dos campos para categorias | REQUIREMENTS; DEC-011/029 | parcial | 40 | 20 | Campo ausente vira indisponível. Tag V3Online não pode virar ambiente | alta | falhas.ts resolveEnvironment ainda trata V3Online |
| RPT-006 | Report | Cenários impactados por responsável | REQUIREMENTS; DEC-012 | parcial | 40 | 20 | Classificados + não classificados fecham o total | alta | GestaoImpactosPanel e classificarImpactosKpi |
| RPT-007 | Report | Totais junto aos títulos | REQUIREMENTS; DEC-010 | parcial | 50 | 0 | Mesma unidade em todos os títulos de seção | média | Totais no painel de status. Browser não abriu |
| RPT-008 | Report | Infraestrutura/Ambiente na Gestão de Impactos | REQUIREMENTS; DEC-011 | parcial | 20 | 0 | Ambiente não prova ofensor | alta | Coluna ambiente. Tag V3Online ainda classifica |
| RPT-009 | Report | Edição sem confundir nome e fórmula | REQUIREMENTS; DEC-005 | parcial | 40 | 20 | Nome de indicador separado da fórmula | alta | PUT /cabecalho e /periodo. Sem modelo de KPI |
| PLN-001 | Planejamento | Escopo por plano, suíte, período e revisão | REQUIREMENTS; ADR 004; DEC-031 | parcial | 75 | 50 | Divergência de baseline visível, sem adoção silenciosa | alta | planning_revision. planKey.test.ts passou |
| PLN-002 | Planejamento | Total já planejado no dia | REQUIREMENTS; DEC-020 | parcial | 33 | 0 | Popover, teclado e revisão histórica | alta | dayTotals sobre allRows. Browser não executado |
| PLN-003 | Planejamento | Fins de semana visíveis e controlados | REQUIREMENTS; DEC-020; OPEN-012 | parcial | 50 | 17 | Recusa na API, papel leitor, preservar dados ao desligar | alta | plan-weekend-off. distribute.test.ts passou nos dias |
| PLN-004 | Planejamento | Seletor de mês e ano | REQUIREMENTS; DEC-020 | parcial | 25 | 0 | Seletor com virada de ano e rascunho | média | monthSpans é faixa, não seletor |
| PLN-005 | Planejamento | Edição manual segura | REQUIREMENTS; ADR 004; DEC-031 | parcial | 60 | 40 | Rejeitar inválidos; revisão antiga; 403 de leitor | alta | PUT /celula. planningService.test.ts passou |
| PLN-006 | Planejamento | Baseline, revisões e trilha | REQUIREMENTS; ADR 004; DEC-022 | parcial | 60 | 20 | Antes/depois de escopo e rollback de revisão | alta | planning_change_log. postgresMigrate.test.ts passou |
| PLN-007 | Planejamento | Prioridade da suíte versus a do cenário | REQUIREMENTS | parcial | 40 | 20 | 1/2/3 válidos; Azure ausente = indisponível | média | coluna prioridade. casePriority.test.ts passou |
| PLN-008 | Planejamento | Responsável principal por suíte | REQUIREMENTS; DEC-013 | parcial | 40 | 0 | Sync não troca o principal; trilha | alta | coluna responsavel. suiteFillSurface.test.ts FALHOU |
| PLN-009 | Planejamento | Modal de distribuição | REQUIREMENTS; DEC-014/015/016 | parcial | 40 | 20 | Sem pendente não aloca; leitor bloqueado | alta | PUT /distribuir. Modo manter. distribute.test.ts passou |
| PLN-010 | Planejamento | Montanha | REQUIREMENTS; DEC-014; OPEN-008 | parcial | 50 | 33 | Curva aprovada, não peso provisório | alta | spreadQuantity. Comentário OPEN-008. Teste de pico passou |
| PLN-011 | Planejamento | Decrescente | REQUIREMENTS; DEC-014 | parcial | 60 | 40 | Cancelar não grava; crescente está no código e a decisão o exclui | média | estratégia decrescente testada |
| PLN-012 | Planejamento | Redistribuir só o saldo | REQUIREMENTS; DEC-015; OPEN-006/007 | parcial | 20 | 0 | Caso 5 cenários e 3 execuções | alta | Snapshot não é apagado. Caso não comprovado |
| PLN-013 | Planejamento | Manter responsáveis e equilibrar dias | REQUIREMENTS; DEC-013/016 | parcial | 40 | 0 | Equilíbrio por QA sem transferir suíte | alta | DISTRIBUTION_ASSIGNMENT = manter |
| PLN-014 | Planejamento | Transferir suítes inteiras | REQUIREMENTS; DEC-016 | ausente | 0 | 0 | Modo explícito e um só principal | alta | Modo não aceito em distribute.ts |
| PLN-015 | Planejamento | Compartilhar quantidades | REQUIREMENTS; DEC-016/017; OPEN-001 | ausente | 0 | 0 | Pai e filhos sem dupla contagem | alta | Sem colaboradores. OPEN-001 |
| PLN-016 | Planejamento | Suíte expansível | REQUIREMENTS; DEC-017 | ausente | 0 | 0 | Chevron e totais sem duplicar | média | Depende de PLN-015 |
| PLN-017 | Planejamento | Gravação transacional | REQUIREMENTS; DEC-015 | parcial | 17 | 0 | Rollback do modal e confirmação vencida | alta | Transação de célula. Modal não testado |
| PLN-018 | Planejamento | Integridade e permissão | REQUIREMENTS; DEC-004 | parcial | 33 | 17 | 403 de papel; somas fechadas | alta | 409 por fingerprint. Bearer, não papel |
| PLN-019 | Planejamento | Capacidade, feriados, férias | REQUIREMENTS | adiado | 0 | 0 | Fase futura do próprio requisito | baixa | Adiado |
| EQA-001 | Evolução QA | Visão individual por QA | REQUIREMENTS; DEC-018 | ausente | 0 | 0 | Quadros por nome | alta | EvolucaoQaPage: Em desenvolvimento |
| EQA-002 | Evolução QA | Metas só do Planejamento | REQUIREMENTS; DEC-002/018 | ausente | 0 | 0 | Meta FourQA, não Assigned To | alta | Sem agregação |
| EQA-003 | Evolução QA | Executado versus finalizado sem falha | REQUIREMENTS; DEC-019 proposta | ausente | 0 | 0 | Failed executa e não finaliza limpo | média | Página ausente. DEC-019 não fechada |
| EQA-004 | Evolução QA | Movimento diário real | REQUIREMENTS; OPEN-007 | ausente | 0 | 0 | Eventos, não delta de snapshot | alta | DEC-T04 |
| EQA-005 | Evolução QA | Deduplicação temporal | REQUIREMENTS; OPEN-007 | ausente | 0 | 0 | Reexecução sem dupla contagem | alta | Sem event store |
| EQA-006 | Evolução QA | Atribuir ao responsável FourQA | REQUIREMENTS; OPEN-001 | ausente | 0 | 0 | run_by não vira dono | alta | Coluna RunBy não atribui meta |
| EQA-007 | Evolução QA | Estimativa não é fato | REQUIREMENTS; OPEN-001 | ausente | 0 | 0 | Não inventar cota individual | alta | Bloqueado |
| EQA-008 | Evolução QA | Somente leitura | REQUIREMENTS; DEC-002 | ausente | 0 | 0 | Painel automático | alta | Placeholder |
| EQA-009 | Evolução QA | Histórico por data | REQUIREMENTS; DEC-022 | ausente | 0 | 0 | Principal vigente na data | média | change_log não monta essa visão |
| EQA-010 | Evolução QA | Filtros, vazio, origem | REQUIREMENTS; DEC-029 | ausente | 0 | 0 | Ausência diferente de zero | média | Página sem dados |
| OPR-044 | Operação | Status dinâmico por frente | REQUIREMENTS; ADR 001 | parcial | 67 | 33 | Sobreposição clara na UI | alta | haSobreposicaoFrentes. statusFrente.test.ts passou |
| OPR-045 | Operação | Explicar divergência com o Report | REQUIREMENTS; ADR 003 | parcial | 33 | 33 | Texto na tela sobre cancelados | alta | finalizadosComCancelados. UI calada. formulas.test.ts passou |
| OPR-046 | Operação | Buscar e paginar Test Points | REQUIREMENTS | parcial | 67 | 33 | Busca sem reclassificar nem escrever no Azure | alta | GET /execucoes. Teste de cache paginou |
| OPR-047 | Operação | Prioridade real do Test Case | REQUIREMENTS | parcial | 33 | 33 | Coluna persistida; ausente = indisponível | média | casePriority.test.ts passou. Sem coluna em execucoes |
| OPR-048 | Operação | Data e executor sem virar dono | REQUIREMENTS; DEC-018 | parcial | 67 | 0 | UI explica que run_by não é responsável | média | ExecucoesPage mostra RunBy |
| OPR-049 | Operação | Created By do bug | REQUIREMENTS; DEC-021 | parcial | 33 | 0 | Persistir e exibir o campo | alta | falhas.ts lê e descarta. 1/3 é só a leitura |
| OPR-050 | Operação | Rastreabilidade de bug | REQUIREMENTS | parcial | 67 | 0 | Vínculo estável bug-plano | média | bug_id, links, plan_key |
| OPR-051 | Operação | Bloqueio de outros cenários | REQUIREMENTS | adiado | 0 | 0 | Não construir agora | baixa | Adiado |
| INT-052 | Integração | Atualizar sem duplicar | REQUIREMENTS; DEC-T03 | parcial | 67 | 33 | UNIQUE de Test Point por plano | alta | replaceSnapshot. Índice não único. Teste de cache passou |
| INT-053 | Integração | Snapshot atômico | REQUIREMENTS | parcial | 67 | 33 | Prova no Postgres do ambiente | alta | Testes locais passaram. Remoto não visto |
| INT-054 | Integração | Estado de sincronização | REQUIREMENTS | parcial | 67 | 33 | Sucesso, andamento e falha sem segredo | alta | GET /sync/status. syncJob.test.ts passou. Doc antiga estava atrás do código |
| INT-055 | Integração | Conexão Azure manual | REQUIREMENTS; DEC-023 | parcial | 67 | 33 | PAT por organização, fora do browser | alta | PUT /sync/config. syncSettings.test.ts passou |
| INT-056 | Integração | Teste de conexão | REQUIREMENTS | ausente | 0 | 0 | Prova de permissão sem gravar snapshot | alta | Sem rota |
| INT-057 | Integração | Extensão assistente | REQUIREMENTS; DEC-023 | adiado | 0 | 0 | Adiado | baixa | Sem extensão |
| INT-058 | Integração | Contrato de integração | REQUIREMENTS | parcial | 33 | 0 | Contrato de conector, não só o HTTP atual | média | HTTP-CONTRACTS.md |
| INT-059 | Integração | Avaliar Jira/Xray | REQUIREMENTS; DEC-023 | adiado | 0 | 0 | Avaliação em decisão, sem código | baixa | Sem artefato |
| INT-060 | Integração | Avaliar Zephyr | REQUIREMENTS; DEC-023 | adiado | 0 | 0 | Idem | baixa | Sem artefato |
| INT-061 | Integração | Avaliar ALM Octane | REQUIREMENTS; DEC-023 | adiado | 0 | 0 | Idem | baixa | Sem artefato |
| CAT-062 | Catálogo | Test Plans por origem | REQUIREMENTS; DEC-003 | ausente | 0 | 0 | Entidade e card | média | SYNC_TEST_PLANS |
| CAT-063 | Catálogo | Nome e subtítulo do card | REQUIREMENTS; DEC-003 | parcial | 33 | 0 | Card por plano | média | PUT /cabecalho não é card |
| CAT-064 | Catálogo | Metadados do plano | REQUIREMENTS | ausente | 0 | 0 | Metadados no card | média | Sem dashboard |
| CAT-065 | Catálogo | Dashboard inicial | REQUIREMENTS; DEC-003 | ausente | 0 | 0 | Home de cards | média | / é o Report |
| CAT-066 | Catálogo | Adicionar plano na UI | REQUIREMENTS | ausente | 0 | 0 | Alta sem editar env | média | Sem catálogo |
| CAT-067 | Catálogo | Contexto no menu | REQUIREMENTS | parcial | 33 | 0 | Seletor de plano entre abas | média | ReportChromeContext sem cards |
| SEC-068 | Identidade | Identidade institucional | REQUIREMENTS; DEC-004 | ausente | 0 | 0 | IdP. JAVA-IDENTITY é proposta | alta | Bearer DEC-T02 |
| SEC-069 | Identidade | Administrador no backend | REQUIREMENTS; DEC-004 | ausente | 0 | 0 | Papel na API | alta | decideWriteAuth sem papel |
| SEC-070 | Identidade | QA somente leitura | REQUIREMENTS; DEC-004 | ausente | 0 | 0 | 403 de papel | alta | Sem papel |
| SEC-071 | Identidade | Link de Report | REQUIREMENTS; DEC-004 | ausente | 0 | 0 | Link com escopo | média | Sem visitante |
| SEC-072 | Identidade | Revogar e expirar | REQUIREMENTS; DEC-004 | ausente | 0 | 0 | Revogação | média | Token de ambiente |
| SEC-073 | Identidade | Filtrar dados sensíveis | REQUIREMENTS | parcial | 33 | 33 | Todos os erros e logs | alta | ping.test.ts passou |
| SEC-074 | Identidade | Organização e membros | REQUIREMENTS | ausente | 0 | 0 | Tabelas de org e usuário | alta | Fora das migrações |
| SEC-075 | Identidade | Isolar planos e snapshots | REQUIREMENTS; DEC-031 | parcial | 67 | 33 | Tenant além de plan_key | alta | planKey.test.ts passou. Sem RLS de usuário |
| SEC-076 | Identidade | Credencial por organização | REQUIREMENTS | ausente | 0 | 0 | PAT por org | alta | Um AZURE_DEVOPS_PAT |
| SEC-077 | Identidade | Migrar sem perda | REQUIREMENTS | parcial | 33 | 33 | Migração multiempresa | média | importFromSqlite.test.ts passou no legado |
| GOV-078 | Governança | Before/after | REQUIREMENTS; DEC-022 | parcial | 33 | 33 | Trilha também de KPI e ofensor | média | planning_change_log |
| GOV-079 | Governança | Relógio de histórico | REQUIREMENTS; DEC-022 | parcial | 33 | 0 | Ícone com autoria | média | PlanningChangeHistoryPanel. Sem IdP |
| GOV-080 | Governança | Auditar KPI e ofensor | REQUIREMENTS | ausente | 0 | 0 | Evento de definição | média | Sem tabela de KPI |
| GOV-081 | Governança | Proveniência dos números | REQUIREMENTS; DEC-029 | parcial | 33 | 0 | Fonte visível em cada KPI | média | Fórmula no backend. UI não declara |
| GOV-082 | Governança | Falhas sem segredos | REQUIREMENTS | parcial | 33 | 33 | Redação em todo log | média | ping.test.ts passou |
| GOV-083 | Governança | Contexto atualizado | REQUIREMENTS; DEC-025 | parcial | 33 | 0 | ARCHITECTURE alinhada ao código | baixa | Docs de 20/10 atrasados |
| NAT-084 | Nativo | Criar Test Case | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Fase posterior. DEC-002 impede lançamento manual agora | baixa | Sem API |
| NAT-085 | Nativo | Versionar cenário | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Não é planning_revision | baixa | Ausente |
| NAT-086 | Nativo | Suítes nativas | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Suíte FourQA | baixa | Ausente |
| NAT-087 | Nativo | Ciclo de testes | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Ciclo nativo | baixa | Ausente |
| NAT-088 | Nativo | Registrar resultado | REQUIREMENTS; DEC-002/024 | futuro | 0 | 0 | Proibido enquanto Azure for a fonte | baixa | Ausente de propósito |
| NAT-089 | Nativo | Evidências | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Anexo autorizado | baixa | Ausente |
| NAT-090 | Nativo | Origem da execução | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Selo de origem | baixa | Só snapshot Azure |
| NAT-091 | Nativo | Exportar casos | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Export autorizado | baixa | Ausente |
| BUG-092 | Nativo | Bug nativo | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Distinto do bug importado | baixa | falhas é snapshot |
| BUG-093 | Nativo | Estado do bug | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Transição nativa | baixa | Ausente |
| BUG-094 | Nativo | Bug em várias execuções | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | N para N | baixa | Ausente |
| BUG-095 | Nativo | Ofensor nativo | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Classificação própria | baixa | Ausente |
| BUG-096 | Nativo | Bug após falha | REQUIREMENTS; DEC-024 | futuro | 0 | 0 | Fluxo | baixa | Ausente |
| BUG-097 | Nativo | Bloqueio em lote | REQUIREMENTS | adiado | 0 | 0 | Adiado no requisito | baixa | Não construir |

## Dependências entre áreas

1. Fórmulas do Report (RPT-003) já diferem de Status/Planejamento de propósito (ADR 003). Evolução QA não pode copiar uma delas sem decisão (OPEN-006).
2. EQA-004/005 dependem de histórico de runs, que o snapshot `execucoes` não é (DEC-T04, OPEN-007).
3. EQA-006/007 e PLN-015/016 dependem de OPEN-001. Não inventar atribuição.
4. PLN-010/013 dependem de OPEN-008. A curva no código é provisória.
5. SEC-068–076 bloqueiam papéis usados como critério de PLN-003, PLN-005, PLN-018 e do link de Report.
6. INT-052/053 sustentam Report, Status, Execuções e Falhas. UNIQUE de ponto ainda falta.
7. Banco remoto não confirmado. Deploy do alias não foi lido. Percentual de código não é percentual de homologação.
8. Java local depende do mesmo contrato HTTP, e já perde `/planejamento/distribuir` e `/sync/config`. Não promover Java a produção sem paridade medida.

## Divergências documento × código

- `ARCHITECTURE.md` e `AGENTS.md`: Java só health. Working tree tem Report, Planejamento, Sync e snapshot. Vercel continua no Node.
- `ARCHITECTURE.md` §3.1 omite rotas `/planejamento/lote`, `/planejamento/distribuir`, `/planejamento/alteracoes`, `/sync/config`.
- INT-054 no requisito ainda diz planejado/não implementado. `GET /api/sync/status` e `SyncMessage` existem.
- `DEC-014` exclui curva crescente. `distribute.ts` inclui `crescente`.
- `DEC-011` proíbe usar a tag `V3Online` como ofensor/ambiente de prova. `resolveEnvironment` ainda mapeia a tag para `V3`.
- `DEC-021`: Created By pedido na API Azure e não persistido.
- RPT-002 / DEC-006: rótulo de tela continua `% BUGS CLIENTE`.
- Nenhum `.csproj`. Quem esperar ASP.NET Core publicado não encontra o projeto.

## Bloqueadores

1. Suíte Node vermelha nesta sessão: `suiteFillSurface.test.ts`.
2. Evolução QA inteira ausente, com OPEN-001 e OPEN-007 abertos.
3. Sem identidade (DEC-004). Bearer único é transitório.
4. Postgres/Supabase de homologação não consultado. RLS da migração 004 não está no script de 15/10.
5. Alias de Preview não verificado por HTTP. Working tree pode não ser o que está no ar.
6. `formulas:parity` e Maven do Java não rodaram aqui.

## Ordem sugerida

1. Deixar `npm test` verde (superfície de responsável/prioridade).
2. Rodar `formulas:parity` e registrar o exit code.
3. Fechar RPT-002 (rótulo) e o texto de OPR-045, sem mudar a fórmula do Status.
4. Persistir Created By (OPR-049) ou parar de pedir o campo.
5. Tirar `V3Online` da inferência de ambiente, com teste.
6. Decidir OPEN-008 antes de tratar Montanha como pronta.
7. Não iniciar EQA compartilhada antes de OPEN-001 e OPEN-007.
8. Identidade só com decisão de IdP. Não tratar o bearer como SEC-069.
9. NAT/BUG permanecem depois, por DEC-024.
10. Deploy: só depois da suíte verde, health do alias e backup Postgres identificado. Sem `--prod` sem autorização.

## Critério de área concluída

- **Report:** RPT-001–009 com critérios de aceite verdes em teste e rótulo DEC-006 na tela.
- **Planejamento:** PLN-001–018 (019 continua adiado) com rollback, papéis e curva aprovada.
- **Evolução QA:** os dez IDs, depois das OPEN que os bloqueiam.
- **Operação:** OPR-044–050. OPR-051 segue adiado.
- **Integração:** INT-052–056 e INT-058. INT-057 e INT-059–061 seguem adiados até haver avaliação.
- **Catálogo:** CAT-062–067 com cards e login, que dependem de SEC.
- **Identidade:** SEC-068–077. Isolamento só por plan_key não basta.
- **Governança:** GOV-078–083 com ator real.
- **Nativo:** só após DEC-024 autorizar a fase. Hoje 0% é o estado correto, não um defeito de regressão.
- **Deploy:** ver o checklist em `FOURQA_DEPLOY_ESTADO_ATUAL.md`. Não há requisito de deploy com ID próprio nesta matriz.

## Testes desta auditoria

`npm test --prefix backend`: 239 passaram, 1 falhou, 0 skipped, exit code 1. Falha: `backend/src/domain/suiteFillSurface.test.ts`. `postgresReal.integration.test.ts` não ficou skipped; o arquivo só aceita localhost e o banco `fourqa_mig` e recusa Supabase. A URL não foi lida.

Não executados: `formulas:parity`, Maven Java, sync Azure, migração, browser, HTTP no alias, SQL no Supabase.

Pareceres de leitura: [impact-analyst](c7714add-0c0a-4954-a96e-20efe5a72fda) e [qa-verifier](604f4501-8e21-4c36-a57f-727334df5bd3). O verifier não rodou a suíte. O Maestro rodou.

## Complemento após os pareceres

Os percentuais da tabela não mudam. Três precisões entram no relatório:

- O boot da API não aplica a migração 004. Só aceita esquema 3 ou 4. Aplicar é `migratePostgres`, via CLI ou import.
- `HTTP-CONTRACTS.md` marca PlanKey, 409 e Finalizados no Java como "Não iniciado". O working tree Java já tem esses símbolos. `PUT /planejamento/distribuir` e `/sync/config` continuam só no Node. DEC-031 nomeia revisão e célula; o código também exige `planKey` explícito no lote e, no Node, na distribuição.
- `planningProgress.test.ts` está fora do `npm test`. Não há teste HTTP de 409 nem de `planKey` inválido com bearer válido. `validateSync` recusa ponto duplicado no lote; o SQL de `execucoes` segue sem UNIQUE. `formulas:parity`, se for rodado depois, não substitui vetor externo: o JSON nasce do próprio `formulas.ts`.

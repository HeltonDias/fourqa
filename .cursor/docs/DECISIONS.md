# FourQA — Registro de decisões de produto e arquitetura

> **20/10/2026 | v1.0 | Fonte: decisões expressas nas conversas do projeto + código do ZIP.**
> **Resumo:** este registro impede que novas sessões/Cursor confundam o que a equipe decidiu, o que o código já faz e o que ainda é hipótese. Não representa aprovação automática de implantação, migração ou lançamento comercial.

## Como ler

- **Aprovada:** decisão de produto expressa pelo responsável; deve ser respeitada nas implementações. Uma decisão aprovada **pode não estar implementada**.
- **Vigente (código/ADR):** comportamento comprovado no repositório; uma evolução pode alterá-lo sob história aprovada.
- **Proposta:** alternativa recomendada pela arquitetura, ainda sujeita a validação.
- **Em aberto:** informação ausente, conflito de requisitos ou decisão de negócio pendente. Não improvisar comportamento nem métrica.
- **Adiada:** funcionalidade desejada fora do ciclo imediato. Não significa descartada.

IDs `DEC-*` são estáveis. ADRs 001–004 em `.cursor/docs/adr/` permanecem independentes; **não** renumerar nem substituir seus fundamentos. Em qualquer revisão, adicionar data, motivo, impacto e vínculo com a Feature/Story, preservando o histórico de decisão.

## 1. Decisões aprovadas de produto

| ID | Situação | Decisão, em linguagem de negócio | Consequência técnica e rastreabilidade |
|---|---|---|---|
| DEC-001 | Aprovada | FourQA é plataforma web **proprietária** para QA, baseada em dados reais; não é open-source. | Preservar propriedade intelectual e caminho para comercialização. `VISION.md`; EP-08/09/11. |
| DEC-002 | Aprovada | Enquanto houver execução na ferramenta externa, ninguém digita resultados/bugs para fechar indicadores no FourQA. | Azure fonte de resultados; FourQA fonte de metas; não criar tela de lançamento de execução. EP-05/06/07. |
| DEC-003 | Aprovada | **Cada Test Plan** terá card próprio após login, ainda que vários planos pertençam a um projeto Azure. Nome e subtítulo exibidos pelo FourQA são editáveis sem renomear o Azure. | Entidade de configuração por Test Plan futuro; escopo isolado em todas as abas. EP-08. |
| DEC-004 | Aprovada | Administrador configura e edita; QA autenticado **somente consulta**; visitante com link vê somente Report, também sem editar. | Validar autorização no backend; link com escopo, revogação, eventual expiração a projetar. EP-09. |
| DEC-005 | Aprovada | Report deixa de usar categorias rígidas de contrato; nomes, KPIs, ofensores e mapeamentos devem ser administráveis por contexto. | Separar apresentação, definição de cálculo, unidade, fonte, filtros e regras de classificação. RPT-001, RPT-004–009. |
| DEC-006 | Aprovada | O termo padrão substituto de “Bugs Cliente” é **Impacto do Cliente**; sem trocar fórmula apenas ao trocar título. | RPT-002; revisar rótulos de quantidade vs percentual separadamente. |
| DEC-007 | Aprovada | Status de Cenários, no Report, tem duas faixas: **Total, Planejados, Finalizados, Pendentes**; e **Passed, N/A, Falha, Bloqueado, Liberado, Não liberado, Design**. No desktop, sete status na mesma faixa visual. | Critérios visual, responsivo e acessível; `ScenarioStatusPanel.tsx`. RPT-003. |
| DEC-008 | Aprovada | No Report, **Finalizados = Passed + Not Applicable**; **Pendentes = Total − Finalizados**. Falha/bloqueio ficam entre pendentes. | Conta consolidada não soma novamente o detalhe; aceitar mudança explícita em GAP, % REAL e rosto do Report. RPT-003. |
| DEC-009 | Aprovada | Ressalvas/cancelados legados não devem inflar Finalizados ou Pendentes do Report. Preservar sua informação histórica separadamente. | A aba Status e Planejamento ainda têm semântica antiga; não mudá-las silenciosamente. RPT-003; ADR 003. |
| DEC-010 | Aprovada | Exibir totais junto aos títulos das seções, com a mesma unidade e base dos indicadores existentes. | Não trocar Test Points por bugs; RPT-007. |
| DEC-011 | Aprovada | **Ofensor** (quem provocou impacto) é diferente de **Ambiente** (onde ocorreu). Preencher ambiente não prova responsabilidade Infra/Ambiente. | RPT-004/005/008; não usar a tag `V3Online` para inferir ofensor. |
| DEC-012 | Aprovada | Categorias iniciais de ofensores incluem Dev Backend, Dev Frontend, Dev Mobile, PO, Cliente, Parceiro, Negócio, Infra/Ambiente, QA e Outros, extensíveis. | Manter grupo Não Classificado explícito; a soma dos cenários impactados classificados + não classificados fecha o total. EP-03. |
| DEC-013 | Aprovada | Planejamento tem responsável principal por suíte; distribuição automática mantém essa responsabilidade por padrão. | Só alterar responsável com modo selecionado e confirmação administrativa. EP-04. |
| DEC-014 | Aprovada | Distribuição automática: **Montanha** padrão; **Decrescente** como opção admitida; tipo “Crescente” não entra agora. | Montanha sobe ao pico aproximadamente no meio do período útil restante e desce; algoritmo exato precisa projeto/testes. EP-04. |
| DEC-015 | Aprovada | Distribuição em todo o Test Plan redistribui apenas **quantidades pendentes**; preserva datas e execuções realizadas, motivo de revisão e baseline. | Substituir agenda não executada somente após confirmação; transação/rollback, impedir total indevido. EP-04. |
| DEC-016 | Aprovada | Três modos: manter responsáveis; equilibrar movendo **suítes inteiras**; permitir **compartilhamento quantitativo** por QA. | Nenhuma transferência ou compartilhamento implícito; confirmar operação. EP-04. |
| DEC-017 | Aprovada | Compartilhamento não atribui Test Cases/Test Points arbitrariamente nem modifica `Assigned To` do Azure. Suíte guarda principal e N colaboradores, sem limite de dois aprovado. | Planejar pode expandir linhas por QA; pai mostra nomes e total **sem dupla contagem**. EP-04. |
| DEC-018 | Aprovada | A Evolução QA é **por nome de QA**, com planejado, realizado, status e evolução por dia, automaticamente. | Somente consulta; responsabilidade atribuída no FourQA, não em `Assigned To` ou `run_by` Azure. EP-05. |
| DEC-019 | Direção proposta (validar detalhe de reexecução) | Um teste Failed deve contar como **trabalho executado**, mas não como **finalizado sem falha** (Passed + N/A). | Indicadores de produtividade, execução e conclusão distintos; definir deduplicação/reexecuções antes de implementar. EP-05/06. |
| DEC-020 | Aprovada | Planejar deve exibir total já planejado no dia ao selecionar célula; fins de semana cinza/desligados por padrão, ativáveis/desativáveis por admin após confirmação; seletor mês/ano. | Não inventar capacidade máxima; preservar dados previamente alocados ao reconfigurar dias. EP-04. |
| DEC-021 | Aprovada | Falhas devem exibir **Created By** verdadeiro do bug externo, distinto do campo de ofensor e executor. | Campo já solicitado pela API, ainda não persistido/exibido; EP-06. |
| DEC-022 | Aprovada | Histórico discreto com ícone de relógio próximo ao usuário e registro de alterações importantes. | Exige autoria/identidade e before/after seguro. EP-10. |
| DEC-023 | Aprovada | Azure DevOps é o conector inicial; Jira/Xray, Zephyr e OpenText ALM Octane são integrações possíveis; conexão manual e extensão assistente são direções. | Não capturar token sem consentimento nem prometer plugin já existente. EP-07. |
| DEC-024 | Aprovada | Primeiro consolidar Report, planejamento e acompanhamento; somente depois gestão **nativa** de testes e bugs. | TestLink/Mantis são referências de UX/negócio, não código a copiar ou licença do produto. EP-11/12. |
| DEC-025 | Aprovada | A documentação mestre mora em **`.cursor/docs/`**; especificações detalhadas e história de decisões devem durar entre sessões. | Não criar cópias concorrentes em `docs/` na raiz; ADRs movidos para `.cursor/docs/adr/`. |
| DEC-026 | Aprovada | Desenvolvimento em pequenas etapas: plano → implementação → teste → inspeção visual/funcional → aceite → publicação autorizada. | Cursor não dá aceite sozinho. Registrar testes/limitações e evitar alterações dispersas. EP-01. |
| DEC-027 | Aprovada | **Um projeto Vercel `fourqa`, um único link oficial para compartilhar:** `https://fourqa-homolog-heltonmarques-8008.vercel.app`. | É alias manual; reapontar ao novo deployment Preview após validar. Nunca `--prod`, criar outro projeto/domínio compartilhado ou mudar link sem autorização. |
| DEC-028 | Aprovada | Prioridades atuais de implementação: (1) Status dos Cenários; (2) Impacto do Cliente e totais; (3) KPIs configuráveis; (4) ofensores/mapeamento; (5) validação do Report. | Etapa 3.1 implementada no ZIP; etapas seguintes ainda a desenvolver. EP-02/03, ROADMAP. |
| DEC-029 | Aprovada | Nunca presumir que todos os dados do cliente existem no Azure; ausência de campo/valor deve resultar em indisponível/não classificado, não em zero ou atribuição inventada. | EP-03/07, RPT-005/006/008. |

## 2. Decisões de arquitetura vigentes no repositório

| Base | Situação | Conteúdo | Evidência |
|---|---|---|---|
| ADR 001 | Vigente | Hierarquia de Test Plans dinâmica; não fixar “Frente” em nível universal. | `.cursor/docs/adr/001-hierarquia-dinamica.md`; `backend/src/domain/dimensions.ts`. |
| ADR 002 | Vigente | Apenas `classifyExecution` classifica Test Point. Sete estados somam o total. | `.cursor/docs/adr/002-status.md`; `backend/src/domain/formulas.ts`. |
| ADR 003 | Vigente | O Report/Home calcula planejado por regra de datas legadas; não igualar automaticamente com Planejamento. | `.cursor/docs/adr/003-planejamento.md`; `reportService.ts`. |
| ADR 004 | Vigente | Escopo e baseline congelados em revisão, planejamento por data independente da ordem de coluna. | `.cursor/docs/adr/004-planejamento-baseline.md`; `planningService.ts`. |
| DEC-T01 | Vigente transitório | PostgreSQL é operacional; SQLite sustenta testes e importação histórica. | `backend/src/persistence/provider.ts`; migrações `001`–`003`. |
| DEC-T02 | Vigente transitório | Token bearer compartilhado + Vercel Authentication; **não é autenticação comercial**. | `backend/src/http/writeAuth.ts`, `frontend/src/api.ts`. |
| DEC-T03 | Vigente transitório | Atualizar inicia sync manual; snapshot novo substitui dados Azure e mantém planejamento. | `syncService.ts`, `postgresAzureSnapshotStore.ts`; `.cursor/docs/vercel.md`. |
| DEC-T04 | Vigente transitório | Últimos registros de Test Point não constituem histórico completo de execução. | `execucoes` e coletores Azure; nenhum event store. |
| DEC-T05 | Vigente | `.vercelignore` bloqueia artefatos locais, preservando ícones; há teste de formato. | `.vercelignore`; `backend/src/vercel/deployShape.test.ts` no ZIP de 20/10. |

**Observação de versionamento:** os arquivos do ZIP de 20/10 incluem mudanças locais além do HEAD embutido `fa4e336`. “Existe no ZIP” **não** implica automaticamente “publicado no GitHub ou alias de homologação”.

## 3. Pontos em aberto — bloqueios explícitos

| ID | Pergunta ou tensão de requisitos | Por que importa | Próxima ação sugerida |
|---|---|---|---|
| OPEN-001 | Como atribuir resultados **fatuais** por QA em uma suíte compartilhada, sem IDs de Test Cases planejados, sem executor Azure como dono, e sem input manual? | Os dados agregados não permitem determinar os resultados individuais. | **Spike de dados/contrato**, reproduzir exemplos e decidir eventual revisão formal antes de implementar `Evolução QA` individual compartilhada. |
| OPEN-002 | Editor de KPIs terá catálogo de operadores seguros, DSL validada ou fórmulas livres? | Segurança, versionamento, testes, custo de cálculo e UX. | Protótipo e ADR de motor de métricas; não permitir avaliação arbitrária de código/SQL. |
| OPEN-003 | Quais KPIs são inicialmente editáveis, quais continuam indicadores fundamentais fixos e como versionar definições? | Evita que mudar label e fórmula destrua significado histórico. | Matriz por KPI/escopo, validação de administração. |
| OPEN-004 | A configuração de categoria usa campo bruto, de-para de valor, ou ambos? | Sem mapeamento, novos ofensores não são mensuráveis. | Inspecionar APIs Azure do processo real de forma autorizada e documentar fallback. |
| OPEN-005 | Qual o critério de “Infra/Ambiente” como **ofensor**, independente do campo Ambiente? | Impede falsa responsabilização do ambiente. | Amostras de bugs autorizadas e regra de negócio aprovada. |
| OPEN-006 | Como tratar cancelados/ressalvas históricos e compatibilizar semântica do Report com Status/Planejamento? | Divergência atual é intencional/transitória. | ADR de semântica e testes antes de tocar nos outros módulos. |
| OPEN-007 | Como medir “movimentação por dia” com snapshot do último estado, possíveis reexecuções, mudanças de responsável e dados tardios? | Um estado corrente não reconstitui sequência histórica. | Investigar resultado/run histórico Azure e estratégia de armazenamento/versionamento. |
| OPEN-008 | Como definir o formato da curva montanha (pico, arredondamento, dias zerados) e o balanceamento por QA com responsáveis desiguais? | Distribuição automática exige reprodutibilidade e respeito à disponibilidade real. | ADR de algoritmo, exemplos com totais pequenos/grandes e teste de propriedades. |
| OPEN-009 | Em bloqueio em lote e associação de bug, o FourQA poderá **escrever** no Azure e com que permissões? | Hoje o conector apenas lê; alterar outcome/Assigned To exige outra governança. | Discovery separado, autorização, consentimento e idempotência. |
| OPEN-010 | Como será a configuração multiempresa (tenant compartilhado ou instâncias independentes), migração, cobrança e retenção? | Impacta banco, chaves, segurança e contratos. | ADR de tenancy e análise de ameaça antes de expandir. |
| OPEN-011 | Usuário com link sem login terá acesso protegido apesar do Vercel Authentication atual? | Proteção do host pode bloquear a promessa comercial de link read-only. | Planejar arquitetura de acesso antes do lançamento; não desativar proteção hoje. |
| OPEN-012 | Efeito exato de desativar fins de semana com alocações já existentes, e disponibilidade/feriados por QA? | Pode apagar planejamento ou criar metas inexequíveis. | Definir preservação/avisos e adiar férias/feriados avançados. |
| OPEN-013 | Qual estratégia de autenticação empresarial Microsoft/Google e gerenciamento de organização? | SSO e isolamento exigem identidades reais e consentimento. | Discovery de provedores, política de convite/conta e ADR. |
| OPEN-014 | Escopo e governança das futuras integrações (Jira/Xray/Zephyr/Octane) variam por fornecedor/edição. | APIs, termos e entidades diferentes. | Spikes independentes sem prometer equivalência automática. |
| OPEN-015 | Quais critérios tornam um Report “compartilhável e executivo” e quais dados devem ser ocultados? | Protege dados empresariais e evita acesso ampliado por link. | Story de segurança/UX com matriz de campos e aceite. |

## 4. Propostas ainda não aprovadas

| ID | Proposta | Motivo e condição de adoção |
|---|---|---|
| PROP-001 | Evoluir Express para módulos de domínio e portas de adaptadores sem reescrever stack. | Menor risco e aproveitamento do código; aprovar arquitetura antes de refatorar extensivamente. |
| PROP-002 | Motor declarativo e seguro de métricas com catálogo, unidade, população e versão. | Reduz divergência e execução de fórmulas maliciosas; depende de OPEN-002/003. |
| PROP-003 | Registro de eventos de sync/alterações com retenção e trilha de origem. | Melhora observabilidade; não equivale a histórico Azure sem ingestão específica. |
| PROP-004 | Identificadores estáveis Epic → Feature → Function → Story e releases com portões de QA. | Melhora gestão e rastreabilidade; organização documental adotada neste pacote, ferramenta de tracking a decidir. |
| PROP-005 | Resumo de “Minhas responsabilidades” filtrável em Planejar. | Facilidade de consulta; ainda não aprovado como funcionalidade obrigatória. |
| PROP-006 | Preview smoke automático, imagens de referência e checagem de tamanho do bundle. | Detecta erros de visualização/deploy; só automatizar após configurar isolamento de segredos. |

## 5. Itens adiados, sem exclusão do escopo estratégico

- Capacidade de execução por QA, feriados, férias, ausências, estimativa de tempo por Test Case e simuladores avançados — estudo futuro com dados confiáveis.
- Dashboard executivo compartilhável avançado, templates, exportação e notificações — após gestão de acesso e estabilidade do Report.
- Extensão de navegador para conexão assistida — após configuração manual segura, evitando acesso silencioso a credenciais.
- Gestão própria de testes, runs e bugs, com possível bloqueio de cenários em lote — depois que o produto de acompanhamento estiver consolidado.

## 6. Como registrar novas decisões

Copie este modelo no final de `DECISIONS.md`, sem substituir o registro antigo:

```text
ID: DEC-030 / OPEN-016 / PROP-007
Data: AAAA-MM-DD
Estado: Aprovada | Vigente | Proposta | Em aberto | Adiada | Revogada
Problema: [o que precisa ser resolvido, em linguagem simples]
Escolha: [comportamento exato e exemplos]
Alternativas rejeitadas: [por quê]
Impacto: [KPIs, dados, UX, segurança, banco, testes]
Rastreabilidade: [Epic / Feature / Function / US / RPT]
Aprovador e evidência: [pessoa/ata ou conversa; não inventar assinatura]
Validação: [critérios de aceite e testes]
```

**Regras de uso:** uma recomendação técnica não muda regra de negócio sozinha. Um comportamento do código não transforma uma hipótese do sumário executivo em fato. Decisões de produção, exclusão, migração ou deploy exigem autorização explícita e específica.

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
| DEC-031 | Aprovada | Escrita de revisão e célula exige `planKey` explícito. Não gravar em plano implícito. | `POST /api/planejamento/revisao` e `PUT /api/planejamento/celula` no Node. Leituras mantêm fallback. HTTP 400. 2026-10-22. |
| DEC-035 | Aprovada | Login por **PAT pessoal** do Azure DevOps; org, projeto e Test Plan escolhidos por conexão, sem depender do `.env`. Entra ID OAuth fica para fase posterior. | PAT criptografado no servidor, nunca devolvido ao navegador. `PLANO_MULTIQA.md` Fase 1. Fecha parte do OPEN-013. |
| DEC-036 | Aprovada | Hierarquia Head > Líder > QA > Visitante: papel global padrão + papel por projeto que sobrescreve. Heads iniciais por `FOURQA_BOOTSTRAP_HEADS`. | Quem conecta vira Líder do projeto; só Head altera papel global; último Head protegido. `PLANO_MULTIQA.md` Fase 3. |
| DEC-037 | Aprovada | Evolução QA MVP só com dados atribuíveis: suíte com responsável único no FourQA; demais em "não atribuível". | Realizado = último estado do Azure (`date_completed`), com aviso; respeita OPEN-001/OPEN-007. US-036/037/039. |
| DEC-038 | Aprovada | Revisa DEC-004: escrita = Líder ou Head do projeto; QA autenticado consulta; Visitante vê só Report. | Backend valida papel efetivo por conexão. US-069/US-070. |
| DEC-039 | Aprovada | Revisa DEC-035: login padrão por **Microsoft Entra ID** (conta institucional); PAT só para dev/teste. | Organizações listadas pela conta; refresh token criptografado. Pendente: App Registration da TI. |

## 2. Decisões de arquitetura vigentes no repositório

| Base | Situação | Conteúdo | Evidência |
|---|---|---|---|
| ADR 001 | Vigente | Hierarquia de Test Plans dinâmica; não fixar “Frente” em nível universal. | `.cursor/docs/adr/001-hierarquia-dinamica.md`; `backend/src/domain/dimensions.ts`. |
| ADR 002 | Vigente | Apenas `classifyExecution` classifica Test Point. Sete estados somam o total. | `.cursor/docs/adr/002-status.md`; `backend/src/domain/formulas.ts`. |
| ADR 003 | Vigente | O Report/Home calcula planejado por regra de datas legadas; não igualar automaticamente com Planejamento. | `.cursor/docs/adr/003-planejamento.md`; `reportService.ts`. |
| ADR 004 | Vigente | Escopo e baseline congelados em revisão, planejamento por data independente da ordem de coluna. | `.cursor/docs/adr/004-planejamento-baseline.md`; `planningService.ts`. |
| ADR 005 | Superseded | Direção ASP.NET Core 10 abandonada. Histórico. | `.cursor/docs/adr/005-dotnet-incremental-migration.md`; `DEC-032`. |
| ADR 006 | Superseded | Backend futuro Java abandonado em favor de Python (`DEC-033`, ADR 007). | `.cursor/docs/adr/006-java-incremental-migration.md`. |
| ADR 007 | Direcionamento aprovado; cutover pendente | Backend definitivo: Python 3.12+ / FastAPI em `backend/`. Vercel unificado SPA + `/api`. | `.cursor/docs/adr/007-python-incremental-migration.md`. |
| DEC-T01 | Vigente transitório | PostgreSQL é operacional; SQLite sustenta testes e importação histórica. Exceção aprovada em 2026-11-03: dev local com `FOURQA_LOCAL_SQLITE=1` (`npm run dev:auth`), recusada quando `VERCEL=1`. | `backend/src/persistence/provider.ts`; migrações `001`–`003`. |
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
| PROP-008 | **Abandonar migração ASP.NET Core 10 como alvo definitivo;** Node/Express permanece API primária. | **Adotada 2026-10-27** (`DEC-032`): `backend/dotnet/` eliminado do repo ativo; fundação Java em `backend-java/` separada. Cutover .NET nunca ocorreu. DEC-031 e HTTP 409 Postgres já no Node. |

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

ID: DEC-031
Data: 2026-10-22
Estado: Aprovada
Problema: a API C# gravava revisão e célula no `kpi_plan_key` ou em `EndToEnd` quando o cliente omitia, repetia ou mandava `planKey` vazio.
Escolha: `POST /api/planejamento/revisao` e `PUT /api/planejamento/celula` exigem uma query `planKey` única, não vazia e sem caractere de controle. Ausente, vazia ou só espaços responde `Informe o planKey.` Duplicada, mesmo com o mesmo valor, responde `planKey ambíguo.` Com caractere de controle responde `planKey inválido.` As três são HTTP 400 e não gravam. Uma chave nova explícita cria o plano. `EndToEnd` explícito é chave válida, não fallback. Leituras (`GET /api/home`, `/api/planejamento`, `/api/status-frente`, `/api/execucoes`, `/api/falhas`) continuam com fallback `kpi_plan_key` ou `EndToEnd`. `PUT /cabecalho`, `PUT /periodo` e `POST /sync` não são escrita de plano. A autorização existente continua na frente dessa validação.
Alternativas rejeitadas: manter o fallback do Node nessas escritas, porque grava no plano errado; exigir catálogo prévio de planos, porque impede criação legítima.
Impacto: a partir do rollback 2026-10-22, o Node primário (`backend/src/routes/api.ts`) alinha as mesmas duas rotas com `planKey` explícito. Concorrência HTTP 409 no Planejamento vale no store PostgreSQL. Sem seletor, tenant ou auth nova.
Rastreabilidade: ADR 005, exceção autorizada nesta fatia; CAT-067 continua planejado e não implementado.
Aprovador e evidência: responsável do produto, pedido de 2026-10-22 que aprova a divergência.
Validação: testes de chave ausente, vazia, duplicada, inválida, chave nova, dois planos, baseline, revisão e 401 sem token. Implementação concluída em 2026-10-22. Os testes PostgreSQL `Escrita_sem_planKey_nao_cria_plano_no_postgres` e `Dois_plan_keys_isolam_revisao_baseline_e_celula` passaram em PostgreSQL isolado local em 2026-10-22. Hospedagem, cutover e banco operacional continuam pendentes.

ID: DEC-032
Data: 2026-10-27
Estado: Aprovada
Problema: implementação experimental ASP.NET Core 10 (`backend/dotnet/`) não será cutover; mantê-la no repo ativo gera custo, confusão de alvo e duplicidade com Node já primário (`PROP-008`).
Escolha: remover integralmente `backend/dotnet/`, scripts `dotnet:*` e ferramentas só-C#; consolidar Node/Express como referência operacional; documentar pendências de paridade em `.cursor/docs/NET-DOTNET-REMOVAL.md`; marcar ADR 005 como histórico superseded; criar `backend-java/` com Spring Boot 4 e `GET /api/health` sem dependência de banco operacional nesta fase.
Alternativas rejeitadas: arquivar `backend/dotnet/` no mesmo repo (pedido foi eliminação); portar domínio para Java nesta entrega (escopo separado).
Impacto: perda de testes xUnit e golden API C#; `formulas:parity` Node permanece. Vercel e frontend continuam no Express. CI ganha job isolado `java-foundation` após validação local.
Rastreabilidade: PROP-008, ADR 005, pedido de limpeza 2026-10-27.
Aprovador e evidência: pedido explícito do responsável do produto nesta conversa (eliminação + fundação Java).
Validação: `npm run typecheck`, `npm test`, `npm run formulas:parity`, `npm run build`, `npm run agent:gates`; busca residual sem dependência operacional .NET; `./mvnw verify` em `backend-java/`.

ID: DEC-033
Data: 2026-10-29
Estado: Aprovada
Problema: alvo Java (ADR 006) e duplicidade Node + fundações paralelas (`backend-java/`) aumentam custo; produto opta por um único backend Python como se nativo desde o início, sem segundo runtime permanente no repositório.
Escolha: adotar ADR 007; port incremental na branch até paridade; cutover único remove Express/TypeScript de `backend/` e `api/index.mjs`; função Vercel Python em `/api`; superseder ADR 006; remover `backend-java/` no cutover; manter frontend React, contratos `HTTP-CONTRACTS.md`, vetores `formulas-parity-vectors.json` e migrações SQL Postgres existentes.
Alternativas rejeitadas: manter Java como alvo (DEC-033 substitui); dois backends permanentes no repo; API em host separado nesta fase (permanece Vercel unificado).
Impacto: reescrever gates CI/agent para pytest/pyright; `formulas:parity` passa a validar Python; rollback via redeploy Node anterior e alias DEC-027.
Rastreabilidade: plano Backend Python cutover 2026-10-29; pedido do responsável do produto.
Aprovador e evidência: implementação autorizada nesta conversa.
Validação: pytest backend, `npm run formulas:parity`, `npm run typecheck`, `npm run build`, `npm run agent:gates`; homologação Preview sem `--prod`.

ID: DEC-034
Data: 2026-10-30
Estado: Aprovada
Problema: o FourQA precisa ter visual alinhado ao de outra ferramenta da equipe (Portal de Massa v0.4, baseado no portal de ofertas QA), mas aquele design system descreve outro produto e usa MUI.
Escolha: adotar a identidade visual (navy `#222239`, laranja `#FF5315`, baunilha, menta, Roboto + Roboto Slab, hero navy + card elevado) em `.cursor/docs/DESIGN_SYSTEM.md` v1.0, aplicada por tokens em `frontend/src/styles.css`, sem MUI. Telas e regras do Portal de Massa são descartadas e adaptadas para Login, Hub de planos e Reports do FourQA.
Alternativas rejeitadas: migrar o frontend para MUI / Material Kit; manter a paleta anterior (`#22233d`/`#ff6333`, IBM Plex Sans).
Impacto: mudança visual global por tokens; nenhuma regra de negócio, cálculo, rota ou contrato muda. Login Microsoft (Entra ID) e tokens por usuário são etapas seguintes, fora desta decisão.
Rastreabilidade: pedido do responsável do produto em 2026-10-30; `DESIGN_SYSTEM.md`.
Aprovador e evidência: responsável do produto nesta conversa ("vale pro nosso… desconsidere e adapte").
Validação: `npm run typecheck`, `npm run build`; inspeção visual pendente.

ID: DEC-035
Data: 2026-11-03
Estado: Aprovada
Problema: a API só falava com uma org/projeto/PAT do `.env`; outros QAs não tinham acesso próprio nem conseguiam conectar outro projeto.
Escolha: o QA entra colando um PAT pessoal (escopos de leitura: Test Management, Project and Team, User Profile; "All accessible organizations" para listar orgs, ou informa a organização). O backend valida o PAT no Azure DevOps, guarda o PAT criptografado (Fernet, `FOURQA_PAT_ENCRYPTION_KEY`) e emite cookie HttpOnly assinado (`FOURQA_SESSION_SECRET`). Cada conexão guarda org, projeto e Test Plan; o sync usa o PAT de quem dispara. O env vira fallback legado.
Alternativas rejeitadas: Entra ID OAuth agora (exige App Registration no tenant; fica para fase posterior); continuar com PAT único no env.
Impacto: tabelas novas (migração 005 / SQLite v9); metadados por conexão em `workbook_meta` com prefixo `conn:{id}:`; sync apaga só os planos sincronizados.
Rastreabilidade: `PLANO_MULTIQA.md` Fase 1; US-068 (parcial); OPEN-013 (parcial).
Aprovador e evidência: responsável do produto, escolha nesta conversa em 2026-11-03.
Validação: pytest de login, cripto, isolamento e 401/403; typecheck e build.

ID: DEC-036
Data: 2026-11-03
Estado: Aprovada
Problema: definir quem pode mudar o cargo de quem, inclusive do primeiro usuário.
Escolha: papéis Head > Líder > QA > Visitante. Papel efetivo = papel no projeto, se definido; senão, papel global. Usuário novo = QA; e-mails em `FOURQA_BOOTSTRAP_HEADS` = Head. Quem conecta um projeto vira Líder dele. Líder ou Head altera papéis no projeto; só Head concede Head ou altera papel global (tela `/admin/usuarios`). O último Head não pode ser rebaixado.
Alternativas rejeitadas: "primeiro a acessar vira Head" (corrida e risco); só papel global; só papel por projeto.
Impacto: RBAC no backend; telas Configurações > Usuários e `/admin/usuarios`.
Rastreabilidade: `PLANO_MULTIQA.md` Fase 3; US-069, US-070.
Aprovador e evidência: responsável do produto, escolha nesta conversa em 2026-11-03.
Validação: testes da matriz papel × rota e proteção do último Head.

ID: DEC-037
Data: 2026-11-03
Estado: Aprovada
Problema: OPEN-001 impede atribuir fatos por QA em suíte compartilhada.
Escolha: Evolução QA mostra planejado por QA a partir do Planejamento (responsável no FourQA, DEC-018) e realizado só das suítes com responsável único. Suítes sem responsável ou com mais de um nome entram em "não atribuível". Executado (Passed, N/A, Failed) separado de finalizado (Passed + N/A), conforme DEC-019. Realizado diário usa `date_completed` do último estado, com aviso.
Alternativas rejeitadas: rateio proporcional (estimativa apresentada como fato); esperar o spike.
Impacto: rota somente leitura `GET /api/evolucao-qa`.
Rastreabilidade: US-036, US-037, US-039; EQA-001/002/003/008/010.
Aprovador e evidência: responsável do produto, escolha nesta conversa em 2026-11-03.
Validação: testes de domínio (suíte única vs compartilhada, Failed vs Passed, N/A, período vazio).

ID: DEC-038
Data: 2026-11-03
Estado: Aprovada (revisa DEC-004)
Problema: DEC-004 falava só em "Administrador"; o novo modelo tem Head e Líder por projeto.
Escolha: escrita exige papel efetivo Líder ou Head na conexão; QA autenticado só consulta; Visitante só vê o Report.
Rastreabilidade: DEC-004, DEC-036; US-069, US-070.
Aprovador e evidência: aprovação do plano Multi-QA em 2026-11-03.
Validação: 403 para QA em rotas de escrita.

ID: DEC-039
Data: 2026-11-03
Estado: Aprovada (revisa DEC-035)
Problema: PAT exige que cada QA crie token e informe a organização; o produto deve usar a conta institucional.
Escolha: login padrão por Microsoft Entra ID (authorization code + PKCE, cliente confidencial, permissão delegada do Azure DevOps). Refresh token criptografado no servidor; organizações listadas pela conta. PAT fica só para dev/teste: vale sem Entra configurado ou com `FOURQA_PAT_LOGIN=1`. Mesmo e-mail reaproveita o usuário.
Rastreabilidade: DEC-035, DEC-036; `PLANO_MULTIQA.md`.
Aprovador e evidência: responsável do produto, escolha nesta conversa em 2026-11-03 (organizações no tenant Foursys; App Registration pedido à TI).
Validação: `backend/tests/test_entra_login.py` (PKCE, state, callback, renovação, bloqueio do PAT). Login real pendente do App Registration.

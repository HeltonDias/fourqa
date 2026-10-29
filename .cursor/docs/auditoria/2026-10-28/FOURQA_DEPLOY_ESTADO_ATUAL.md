# FourQA — estado atual de deploy e infraestrutura

**Auditoria:** 2026-10-28. Nenhuma publicação foi executada. A Vercel CLI não está instalada neste ambiente. O alias de Preview **não** foi consultado por HTTP nesta sessão. Configuração no Git não prova o que está no ar.

## 1. O que está implementado no repositório

| Peça | Evidência | Classe |
|---|---|---|
| SPA | `vercel.json` `outputDirectory`: `frontend/dist`. Build `npm run build` | config versionada |
| API Node | `api/index.mjs` reexporta `backend/dist/app.js`. Rewrite `/api/:path*` → `/api/index` | config versionada |
| Função | `vercel.json` `maxDuration` 300 em `api/index.mjs` e `api/[...path].mjs`. `includeFiles`: `backend/dist/**`. Exclui `.env`, `certs`, `*.pem` | config versionada |
| Região | `regions`: `iad1` | config versionada |
| Git auto-deploy | `git.deploymentEnabled.main` e `master` = false | config versionada. Push em main não publica sozinho |
| Headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` | config versionada |
| CI | `.github/workflows/ci.yml`: push e pull_request. Node 22. Recusa `.env`, `.pem`, `.dump`, `.vercel/` versionados. Roda `typecheck`, `npm test`, `formulas:parity`, `build`. Job `java-foundation`: `./mvnw -B verify` em `backend-java` com JDK 25 | CI declarado. **Esta sessão não leu o resultado do GitHub** |
| Java | Dockerfile em `backend-java/` no working tree | não é o runtime da Vercel |
| ASP.NET | nenhum projeto | ausente. Não tratar como API publicada |

`DEC-027`: um projeto Vercel `fourqa` e um alias oficial de Preview, `https://fourqa-homolog-heltonmarques-8008.vercel.app`, reapontado à mão. URLs com hash são deployments imutáveis. `--prod` é proibido sem autorização. Este documento não afirma que o alias aponta para o working tree de 28/10.

## 2. Responsabilidades

| Peça | Papel hoje | Papel que o código não cobre |
|---|---|---|
| Vercel | Hospeda SPA e a função Node do Express | Não hospeda o Java. Não é o banco |
| Backend Node | Calcula, sincroniza Azure, grava Postgres | Sem fila própria além de `waitUntil` citado na arquitetura para o job de sync |
| Supabase/Postgres | Persistência, se `DATABASE_URL` apontar para lá | RLS de usuário não está nas migrações. Efetivo não confirmado |
| Azure DevOps | Fonte de Test Points, results e bugs | FourQA não cria caso nem bug lá (`DEC-002`, `DEC-024`) |
| Browser | SPA. Bearer em `localStorage` se o usuário colar o token | Sem IdP |

## 3. Build e ambientes

`installCommand` e `buildCommand` no `vercel.json`: `npm install`, `npm run build`. Workspaces `backend` e `frontend`.

Diferença que o código faz:

- **Vercel** (`VERCEL=1`): escrita aberta desligada; leitura pode exigir bearer (`FOURQA_PROTECT_READS`).
- **Fora da Vercel:** leitura aberta; escrita aberta só se `FOURQA_ALLOW_OPEN_WRITES=1` e não estiver na Vercel.
- **CI:** Node 22 e, em job separado, JDK 25 para o Java experimental.
- **Produção:** não há arquivo que a defina como publicada. `DEC-027` mantém o compartilhamento no Preview.

Homologação verificada nesta sessão: **não**. Produção: **não executada e não presumida**.

## 4. Variáveis (somente nomes)

De `.env.example`. Valores não são reproduzidos.

Obrigatórias para o modo Postgres + Azure + escrita fechada:

- `DB_PROVIDER`
- `DATABASE_URL`
- `DATABASE_SSL_CA_FILE` (opcional, nome existe)
- `AZURE_DEVOPS_ORG`
- `AZURE_DEVOPS_PROJECT`
- `AZURE_DEVOPS_PAT`
- `AZURE_DEVOPS_API_VERSION`
- `SYNC_TEST_PLANS`
- `SYNC_HIERARQUIA_SUITES`
- `SYNC_RESPONSABILIDADES`
- `SYNC_LIMPAR_ANTES`
- `SYNC_CRIAR_CABECALHO`
- `SYNC_EXECUCOES_CAMPOS`
- `SYNC_FALHAS_CAMPOS`
- `SYNC_KPI_PLAN_KEY`
- `SYNC_FRENTES_VALIDAS`
- `FRONTEND_ORIGIN` (CORS)
- `FOURQA_API_TOKEN`
- `FOURQA_ALLOW_OPEN_WRITES`
- `FOURQA_PROTECT_READS`
- `AZURE_CACHE_READ`

Teste local de Postgres, não é variável de deploy: `TEST_DATABASE_URL` (o teste exige localhost e o banco `fourqa_mig`).

Presença desses nomes no projeto Vercel: **não consultada** (sem CLI e sem chamada à API da Vercel).

## 5. Conectividade, domínio, CORS, auth

Rewrite interno manda `/api/*` para a função e o resto para `index.html`. O browser fala com a mesma origem do Preview quando a SPA está na Vercel. `FRONTEND_ORIGIN` existe para CORS quando a origem difere.

HTTPS é o padrão da plataforma no alias `*.vercel.app`. Domínio próprio: não achado em `vercel.json`. Não afirmar DNS.

Auth de borda: a arquitetura cita Vercel Authentication como proteção de hospedagem, distinta do bearer da API. Esta sessão não abriu o deployment para ver o desafio de login da Vercel.

Health: `GET /api/health` devolve estado mínimo do banco, sem dado de negócio. Não foi chamado no alias.

## 6. CI, aprovação, observabilidade

O workflow roda em push e PR. Não há environment protection documentado no yaml lido. Não há passo de deploy. Publicar continua manual e autorizado (`DEC-026`, `DEC-027`).

Logs, alerta e monitor: não há Sentry, Application Insights nem cron de health no `vercel.json` (o arquivo não declara `crons`). Falha de sync fica no metadado do job, não num alerta. `GOV-082` é parcial no código de redação de erro, não uma operação de plantão.

## 7. Rollback e backup

Rollback de Preview, no processo descrito em `DEC-027`: reapontar o alias para um deployment anterior. Não ensaiado aqui.

Backup de aplicação: script SQLite apenas. Backup do Postgres de homologação: não confirmado neste repositório além do comentário histórico no handoff. Ver `FOURQA_DATABASE_ESTADO_ATUAL.md`.

O Java não tem rollback de produção porque não está no caminho de publish.

## 8. Bloqueadores para uma publicação final

1. Suíte `npm test` **falhou nesta sessão** (1 teste, `suiteFillSurface.test.ts`). O CI declara o mesmo comando. Publicar com a suíte vermelha quebra o gate do próprio workflow, se o código publicado for este working tree.
2. `formulas:parity` não foi executado aqui. O CI o exige. Resultado remoto desconhecido.
3. Working tree grande e não commitado, inclusive Java. O que está no Git remoto pode ser diferente do disco. O alias não foi comparado ao disco.
4. Sem papéis (SEC-068–072). Bearer compartilhado é transitório (`DEC-T02`), insuficiente para o produto de DEC-004.
5. Esquema remoto e RLS da 004 não confirmados.
6. Evolução QA é placeholder. Report ainda mostra `% BUGS CLIENTE`.
7. Sem monitoramento.
8. Java não é candidato de deploy enquanto a Vercel apontar para `backend/dist`.

## 9. Checklist de prontidão (proposta desta auditoria, não é requisito aprovado)

| Item | Estado em 28/10 |
|---|---|
| Build config Node+SPA no repo | presente |
| API .NET publicada | não se aplica; projeto ausente |
| API Java publicada | não |
| Alias oficial definido em decisão | sim (DEC-027), não reverificado por HTTP |
| Variáveis no projeto Vercel | não aferível nesta sessão |
| `npm test` verde no código auditado | não (239 pass, 1 fail) |
| `formulas:parity` nesta sessão | não executado |
| Browser no Preview | não executado |
| Postgres remoto conferido | não |
| Backup Postgres ensaiado | não |
| Auth de papéis | ausente |
| Alertas | ausentes |
| `--prod` | não autorizado e não executado |

Prontidão de **configuração versionada do Preview Node** é parcial. Prontidão de **publicação final do produto aprovado** não tem percentual único: os requisitos SEC, EQA, RPT-002 e a suíte vermelha impedem declarar o produto pronto. Média dos 92 requisitos (ver matriz): cerca de 22% implementado e 9% validado, média simples, com 0 requisitos em 100%.

## 10. Critério para considerar o deploy da fase atual concluído

CI verde no commit que será publicado, `npm test` e `formulas:parity` com exit 0 registrados, health do alias respondendo sem vazar erro de banco, alias reapontado só depois dessa verificação, variáveis conferidas por nome no painel (sem colar valores em documento), e backup do Postgres identificado. Produção continua fora até autorização explícita.

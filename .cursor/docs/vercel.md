# FourQA na Vercel

Um projeto. O Vite publica `frontend/dist`. Desde o cutover Java (`DEC-041`, ADR 008) não há Function: `vercel.json` faz rewrite externo de `/api/:path*` para o host Java (Spring Boot). O browser vê uma origem só, então o cookie HttpOnly e o `SameSite=Lax` não mudam. `npm run dev` local: API Java na porta 3001 e Vite na 5173.

**Estado (2026-11-04):** o destino do rewrite é o marcador `https://fourqa-api.invalid`, porque o host Java ainda não foi provisionado (homologação pendente de autorização). Um Preview gerado com este `vercel.json` serve o SPA sem API. Antes de subir Preview: trocar o destino pela URL HTTPS do host homologado e conferir `/api/health`.

O lote do Azure é o snapshot PostgreSQL (`execucoes`, `falhas` e as metas do refresh em `workbook_meta`), gravados na mesma transação. `AZURE_CACHE_READ=1` impede a API de subir no host operacional (`FOURQA_HOSTED=1`). Planejamento, revisões, alocações e metas manuais não entram no `replaceSnapshot`.

`POST /api/sync` responde 202 e o trabalho segue em segundo plano no host Java. Com PostgreSQL, o estado fica em `workbook_meta.sync_job` (`DEC-042`), e qualquer instância lê esse estado. Se o batimento parar por 90 segundos, o job aparece como interrompido e pode ser retomado. Falha antes do `replaceSnapshot` mantém o lote anterior. O browser acompanha por polling de `/api/sync/status`, então o limite de tempo do rewrite não corta o sync.

O `DATABASE_URL` do host é o transaction pooler, porta 6543. A URL local permanece na porta 5432. No host (`FOURQA_HOSTED=1`) o pool Hikari usa no mínimo 1 e no máximo 4 conexões, e verifica TLS. Se o JDBC não confiar na cadeia do Supabase sozinho, `DATABASE_SSL_CA` leva o PEM. Não use caminho de arquivo e não desligue a verificação.

## Variáveis

As variáveis abaixo ficam no **host Java**, não na Vercel. A Vercel só precisa do build do SPA. Obrigatórias em runtime:

- `FOURQA_HOSTED=1`
- `DB_PROVIDER=postgres`
- `DATABASE_URL` do transaction pooler
- `FOURQA_API_TOKEN`
- `AZURE_DEVOPS_ORG`
- `AZURE_DEVOPS_PROJECT`
- `AZURE_DEVOPS_PAT`
- `SYNC_TEST_PLANS`
- `SYNC_KPI_PLAN_KEY`

Login multi-QA (DEC-035, DEC-036, DEC-039). Sem as duas primeiras, `/api/auth/login` responde 503 e só o token de serviço entra:

- `FOURQA_SESSION_SECRET` assina o cookie `fourqa_user`.
- `FOURQA_PAT_ENCRYPTION_KEY` criptografa PAT e refresh token no banco. Trocar a chave invalida as credenciais salvas.
- `FOURQA_BOOTSTRAP_HEADS`: e-mails, separados por vírgula, que entram como Head.
- `FOURQA_ENTRA_TENANT_ID`, `FOURQA_ENTRA_CLIENT_ID`, `FOURQA_ENTRA_CLIENT_SECRET` e, opcional, `FOURQA_ENTRA_REDIRECT_URI`. Sem os três primeiros, o login usa PAT. O App Registration depende da TI.

Não defina `FOURQA_LOCAL_SQLITE` no host: a API recusa subir com SQLite quando `FOURQA_HOSTED=1` (ou `VERCEL=1`).

A primeira abertura dos stores Postgres aplica as migrations que faltam em `schema_migrations` (`backend/src/main/resources/db/postgres/`, `001`..`006`). No Supabase essa tabela veio do migrador Node: `applied_at text NOT NULL`, sem default. O migrador Java grava `applied_at` em ISO-8601 UTC (`...Z`), no mesmo formato. O PEM de `DATABASE_SSL_CA` vai para o diretório temporário. Se `/api/health` responder `database: unavailable`, o log do host traz `persistence not ready: <erro sanitizado>`. A `005_users_connections.sql` cria `app_user`, `user_credential`, `qa_connection` e `connection_member`, com RLS ligado e sem acesso para `anon` e `authenticated`. Ela só cria tabelas e índices; não altera tabelas existentes.

Usadas quando existem no projeto: `AZURE_DEVOPS_API_VERSION`, `SYNC_HIERARQUIA_SUITES`, `SYNC_RESPONSABILIDADES`, `SYNC_FRENTES_VALIDAS`, `SYNC_LIMPAR_ANTES`, `SYNC_CRIAR_CABECALHO`, `FRONTEND_ORIGIN`.

No host (`FOURQA_HOSTED=1`) o arquivo `.env` não é lido. As variáveis vêm só do ambiente do host. Não defina `AZURE_CACHE_READ` nem `FOURQA_ALLOW_OPEN_WRITES`. `FOURQA_PROTECT_READS=0` não serve para Preview. `DATABASE_SSL_CA` é obrigatório neste banco. Nenhuma variável `VITE_` leva segredo.

`/api/health` fica público e não devolve dados de negócio. Os demais GET exigem o token. O navegador grava a sessão no cookie HttpOnly `fourqa_session` (`POST /api/session`). `Authorization: Bearer` continua aceito. O token não entra no bundle nem no `localStorage`.

A proteção do projeto `fourqa` (conta `heltonmarques-8008`) é Vercel Authentication, cobrindo previews e URLs de deployment. O token da aplicação não substitui essa barreira. Ela **não** protege o host Java, que é público por URL própria: o host exige sessão ou token em toda rota exceto `/api/health` e, se o provedor permitir, deve aceitar só tráfego vindo da Vercel.

O repositório GitHub não está ligado ao projeto. Ligá-lo publicaria a branch de produção, e isso não está autorizado. `vercel.json` desliga deploy automático de `main` e `master` quando o commit implantado contém essa regra. O Preview sobe pela CLI, sem `--prod`. O primeiro deploy de um projeto vazio é marcado como Production pela Vercel; o alias público desse deploy foi removido. Os seguintes, sem `--prod`, ficam em Preview.

## Último Preview validado

2026-11-03, commit `92ce818` (branch `feat/java-25-foundation`): `https://fourqa-iklzkc8x3-heltonmarques-8008.vercel.app`. Corrige contenção do pool de conexões Postgres na Vercel (aumentado de max_size=1 para 4 e timeout=15s) e elimina ping redundante `SELECT 1` em `_ready()`, resolvendo os erros 503 sob requisições concorrentes da SPA. Substitui `fourqa-ja6vwatwl`. `/api/health` respondeu `{"ok":true,"database":"ready"}`. Rotas protegidas respondem 401 controlado em vez de 503. `FOURQA_BOOTSTRAP_HEADS` ativo.

Testadores sem conta no Vercel entram pelo link compartilhável do deployment: Deployments > deployment > Share > "Anyone with the link". No Hobby, a conta tem um único link no total. Um Preview novo exige revogar o link antigo e gerar outro.

O alias `fourqa-homolog-heltonmarques-8008.vercel.app` aponta para `fourqa-iklzkc8x3` desde 2026-11-03, a pedido do responsável, para os testadores. A Vercel Authentication continua ligada. O acesso externo usa o link compartilhável desse deployment (`?_vercel_share=`). No Hobby existe um único link por conta. Quem entra ainda faz login no FourQA com o PAT.

## Rollback

Na Vercel, reaponte o alias para o deployment Python anterior (`fourqa-iklzkc8x3`, Function `api/index.py`, DEC-027). Ele não depende do host Java. Não rode os dois backends contra o mesmo Postgres com sync ativo. A migration 005 só adicionou tabelas; deployments anteriores as ignoram. Removê-las apaga usuários, conexões e PATs salvos e exige autorização. Um sync concluído substitui só `execucoes` e `falhas`; o planejamento permanece. Sync interrompido não troca o lote.

Não rode `vercel deploy --prod`. Production continua sem variáveis e sem autorização.

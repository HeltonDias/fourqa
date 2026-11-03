# FourQA na Vercel

Um projeto. O Vite publica `frontend/dist`. A Function `api/index.py` entrega o FastAPI em `/api`. `npm run dev` local não muda: API na porta 3001 e Vite na 5173.

Na Vercel o lote do Azure é o snapshot PostgreSQL (`execucoes`, `falhas` e as metas do refresh em `workbook_meta`), gravados na mesma transação. O Atualizar local, com cache em memória, não escreve essas metas nem as linhas: assim o Preview não lê KPI novo sobre execuções velhas. `AZURE_CACHE_READ=1` impede a Function de subir. Planejamento, revisões, alocações e metas manuais não entram no `replaceSnapshot`.

`POST /api/sync` responde 202 e o trabalho segue com `waitUntil`, até `maxDuration` de 300 segundos. O estado fica em `workbook_meta.sync_job`. Outra instância lê esse estado. Se o batimento parar por 90 segundos, o job aparece como interrompido e pode ser retomado. Falha antes do `replaceSnapshot` mantém o lote anterior. Não há fila paga.

O `DATABASE_URL` do Preview é o transaction pooler, porta 6543, no mesmo host já validado. A URL local permanece na porta 5432. O pool da Function usa no máximo 1 conexão, região `iad1`, e verifica TLS. Se o cliente Python não confiar na cadeia do Supabase sozinho, `DATABASE_SSL_CA` leva o PEM. Não use caminho de arquivo e não desligue a verificação.

## Variáveis

Obrigatórias em runtime na Vercel:

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

Não defina `FOURQA_LOCAL_SQLITE` na Vercel: a API recusa subir com SQLite quando `VERCEL=1`.

A primeira abertura dos stores Postgres aplica as migrations que faltam em `schema_migrations`. No Supabase essa tabela veio do migrador Node: `applied_at text NOT NULL`, sem default. O migrador Python grava `applied_at` em ISO-8601 UTC (`...Z`), no mesmo formato. Na Vercel o pool usa `min_size=1` e `max_size=1`. O PEM de `DATABASE_SSL_CA` vai para o diretório temporário, porque o bundle é somente leitura. Se `/api/health` responder `database: unavailable`, o log da Function traz `persistence not ready: <erro sanitizado>`. A `005_users_connections.sql` cria `app_user`, `user_credential`, `qa_connection` e `connection_member`, com RLS ligado e sem acesso para `anon` e `authenticated`. Ela só cria tabelas e índices; não altera tabelas existentes.

Usadas quando existem no projeto: `AZURE_DEVOPS_API_VERSION`, `SYNC_HIERARQUIA_SUITES`, `SYNC_RESPONSABILIDADES`, `SYNC_FRENTES_VALIDAS`, `SYNC_LIMPAR_ANTES`, `SYNC_CRIAR_CABECALHO`, `FRONTEND_ORIGIN`.

Na Vercel o arquivo `.env` não é lido. As variáveis vêm só do ambiente Preview do projeto. Não defina `AZURE_CACHE_READ` nem `FOURQA_ALLOW_OPEN_WRITES`. `FOURQA_PROTECT_READS=0` não serve para Preview. `DATABASE_SSL_CA` é obrigatório neste banco. Nenhuma variável `VITE_` leva segredo.

`/api/health` fica público e não devolve dados de negócio. Os demais GET exigem o token. O navegador grava a sessão no cookie HttpOnly `fourqa_session` (`POST /api/session`). `Authorization: Bearer` continua aceito. O token não entra no bundle nem no `localStorage`.

A proteção do projeto `fourqa` (conta `heltonmarques-8008`) é Vercel Authentication, cobrindo previews e URLs de deployment. O token da aplicação não substitui essa barreira.

O repositório GitHub não está ligado ao projeto. Ligá-lo publicaria a branch de produção, e isso não está autorizado. `vercel.json` desliga deploy automático de `main` e `master` quando o commit implantado contém essa regra. O Preview sobe pela CLI, sem `--prod`. O primeiro deploy de um projeto vazio é marcado como Production pela Vercel; o alias público desse deploy foi removido. Os seguintes, sem `--prod`, ficam em Preview.

## Último Preview validado

2026-11-03, commit `b66af70` (branch `feat/java-25-foundation`): `https://fourqa-39r7ntm08-heltonmarques-8008.vercel.app`. `/api/health` respondeu `{"ok":true,"database":"ready"}`, com a migration 005 aplicada no Supabase. `/api/auth/me` mostrou o login por PAT ligado (Entra desligado). `/api/home` sem sessão respondeu 401. `FOURQA_SESSION_SECRET` e `FOURQA_PAT_ENCRYPTION_KEY` estão no ambiente Preview como Sensitive. `FOURQA_BOOTSTRAP_HEADS` ainda não foi definido.

O alias de homologação não foi reatribuído, por decisão do responsável. Ele ainda aponta para um deployment anterior que responde `FUNCTION_INVOCATION_FAILED` em `/api/*`.

## Rollback

Na Vercel, promova o deployment anterior. A migration 005 só adicionou tabelas; deployments anteriores as ignoram. Removê-las apaga usuários, conexões e PATs salvos e exige autorização. Um sync concluído substitui só `execucoes` e `falhas`; o planejamento permanece. Sync interrompido não troca o lote.

Não rode `vercel deploy --prod`. Production continua sem variáveis e sem autorização.

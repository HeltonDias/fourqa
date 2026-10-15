# FourQA na Vercel

Um projeto. O Vite publica `frontend/dist`. A Function `api/[...path].mjs` entrega o Express em `/api`. `npm run dev` local não muda: API na porta 3001 e Vite na 5173.

Na Vercel o lote do Azure é o snapshot PostgreSQL (`execucoes`, `falhas` e as metas do refresh em `workbook_meta`), gravados na mesma transação. O Atualizar local, com cache em memória, não escreve essas metas nem as linhas: assim o Preview não lê KPI novo sobre execuções velhas. `AZURE_CACHE_READ=1` impede a Function de subir. Planejamento, revisões, alocações e metas manuais não entram no `replaceSnapshot`.

`POST /api/sync` responde 202 e o trabalho segue com `waitUntil`, até `maxDuration` de 300 segundos. O estado fica em `workbook_meta.sync_job`. Outra instância lê esse estado. Se o batimento parar por 90 segundos, o job aparece como interrompido e pode ser retomado. Falha antes do `replaceSnapshot` mantém o lote anterior. Não há fila paga.

O `DATABASE_URL` do Preview é o transaction pooler, porta 6543, no mesmo host já validado. A URL local permanece na porta 5432. O pool da Function usa no máximo 1 conexão, região `iad1`, e verifica TLS. O Node não confia na cadeia do Supabase sozinho: `DATABASE_SSL_CA` leva o PEM. Não use caminho de arquivo e não desligue a verificação.

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

Usadas quando existem no projeto: `AZURE_DEVOPS_API_VERSION`, `SYNC_HIERARQUIA_SUITES`, `SYNC_RESPONSABILIDADES`, `SYNC_FRENTES_VALIDAS`, `SYNC_LIMPAR_ANTES`, `SYNC_CRIAR_CABECALHO`, `FRONTEND_ORIGIN`.

Não defina `AZURE_CACHE_READ` (o vazio já grava no PostgreSQL). Não defina `FOURQA_ALLOW_OPEN_WRITES`. `FOURQA_PROTECT_READS=0` abre a leitura e não serve para Preview. `DATABASE_SSL_CA` é obrigatório neste banco. Nenhuma variável `VITE_` leva segredo.

`/api/health` fica público e não devolve dados de negócio. Os demais GET exigem `Authorization: Bearer`. O navegador grava o token em `localStorage.fourqa_token`; ele não entra no bundle.

A proteção do projeto `fourqa` (conta `heltonmarques-8008`) é Vercel Authentication, cobrindo previews e URLs de deployment. O token da aplicação não substitui essa barreira.

O repositório GitHub não está ligado ao projeto. Ligá-lo publicaria a branch de produção, e isso não está autorizado. `vercel.json` desliga deploy automático de `main` e `master` quando o commit implantado contém essa regra. O Preview sobe pela CLI, sem `--prod`.

## Rollback

Na Vercel, promova o deployment anterior. O schema não ganhou migração nova. Um sync concluído substitui só `execucoes` e `falhas`; o planejamento permanece. Sync interrompido não troca o lote.

Não rode `vercel deploy --prod`. Production continua sem variáveis e sem autorização.

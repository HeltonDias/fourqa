# FourQA — handoff entre sessões

**Estado inicial**: a estrutura foi observada no ZIP atualizado de 13/10/2026. Este arquivo NÃO é atualizado automaticamente.

## Base conhecida
- Aba Status implementada com frentes dinâmicas; confirmar contra o código ao evoluir métricas.
- `ReportChrome` global e `PageHeader` compartilhado; padronização visual validada pelo usuário.
- Squad v2 já instalada: `impact-analyst` e `qa-verifier`; **não reinstalar**.

## Pendências conhecidas a confirmar
- Responsáveis DEV/cliente podem exigir classificação configurável por projeto.
- Saúde consolidada e sobreposição de rótulos de frentes requerem validação semântica antes de alterar.

## Ao encerrar uma tarefa grande
Atualizar só se a tarefa alterou arquitetura/contrato: data, caminhos modificados, decisão, testes, próxima ação (máximo 10 linhas). Não registrar histórico de ferramentas, trechos extensos de código, dados sensíveis ou logs. Abrir chat novo usando objetivo + este handoff apenas quando útil.

## Conexão PostgreSQL (13/10/2026)
- Decisão: TLS verifica o certificado do servidor. `rejectUnauthorized: false` só com `sslmode=no-verify`.
- CA extra, se a trust store do Node falhar: `DATABASE_SSL_CA_FILE` (PEM em `certs/`, fora do Git).
- Caminho: `backend/src/db/postgres/pool.ts`. SQLite e os contratos de persistência permanecem.
- Backup verificado em `../fourqa-backups/fourqa-20261013-1451.db`. SQLite ativo continua `data/fourqa.db`.
- Importação real ainda não executada. `import-sqlite` e `validate` aceitam `--source`. Conteúdo divergente aborta sem apagar o Postgres. A validação não exige o fixture PlanTeste.

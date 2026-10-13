# FourQA

Aplicação web que acompanha a execução de QA a partir do Azure DevOps. A planilha legada serviu de referência para as regras; o FourQA consulta o Azure e calcula os indicadores sozinho.

## Fontes de verdade

- **Test points, bugs e árvore de suítes:** Azure DevOps, gravados no SQLite só depois de `validateSyncResult`.
- **Regras de status:** `classifyExecution` no backend. O frontend não reclassifica. Ver [docs/adr/002-status.md](docs/adr/002-status.md).
- **Hierarquia:** detectada na árvore. Frente e Prioridade não têm nível fixo. Ver [docs/adr/001-hierarquia-dinamica.md](docs/adr/001-hierarquia-dinamica.md).
- **Configuração do plano:** `.env` (`SYNC_TEST_PLANS`, `SYNC_KPI_PLAN_KEY`). O frontend não guarda PlanKey.
- **Planejamento de datas:** importação legada quando a suíte existe lá; senão a janela do plano é inferida e marcada como tal. Ver [docs/adr/003-planejamento.md](docs/adr/003-planejamento.md).
- **PAT:** só no `.env`, só no backend. Não vai para o banco, para o frontend nem para logs.

## Fluxo de sincronização

`FETCH` (suítes, test points, runs, bugs) → `TRANSFORM` (dimensões + status) → `VALIDATE` → `COMMIT` transacional.

Se a validação falhar (lote vazio, TestPointId ou BugId duplicado, suíte sem pai na árvore), os dados anteriores permanecem.

## Como executar

Requisitos: Node.js 22+ (`node:sqlite`). Python só é necessário para importar a planilha legada.

```bash
npm install
cp .env.example .env   # preencha org, projeto, PAT e SYNC_TEST_PLANS
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

O backend cria o banco vazio em `data/fourqa.db` (migrations em `backend/src/db/migrate.ts`). `npm run import:planilha` continua disponível só para trazer o snapshot da planilha. O caminho pode ser alterado com `FOURQA_DB`.

`DB_PROVIDER` escolhe a persistência. Ausente ou `sqlite` usa o arquivo local. `postgres` usa `DATABASE_URL` e não abre o SQLite. A URL fica só no `.env`, que o Git ignora.

## Testes e build

```bash
npm run typecheck
npm test
npm run build
```

## Novo projeto / Test Plan

1. Ajuste `SYNC_TEST_PLANS` com o PlanId e um PlanKey estável.
2. Ajuste `SYNC_KPI_PLAN_KEY` para o plano da Home.
3. `SYNC_FRENTES_VALIDAS` só entra se o projeto marca frentes nas tags dos bugs. Não define o nível na árvore.
4. `SYNC_HIERARQUIA_SUITES` é opcional. Deixe inativo para a detecção automática.
5. Clique em Atualizar. A Home mostra só as dimensões reconhecidas (ou "Nível N").

## Segurança antes de compartilhar

- `FRONTEND_ORIGIN` restringe o CORS. Vazio permite só localhost.
- `FOURQA_API_TOKEN`, se preenchido, protege `POST /api/sync` e `PUT /api/cabecalho`. No navegador, grave o mesmo valor em `localStorage.fourqa_token`.
- Não há login de usuários. Não publique o FourQA na internet só com o token vazio.
- O health check responde `{ ok, database }` e não devolve caminho de arquivo.

Não empacote `.env`, `data/*.db`, `node_modules`, `dist` nem as planilhas de `fonte/`.

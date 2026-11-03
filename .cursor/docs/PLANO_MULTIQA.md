# Plano Multi-QA FourQA (Macro, Meso e Micro)

Data: 2026-11-03. Aprovado pelo responsável do produto nesta data. Decisões: `DEC-035`, `DEC-036`, `DEC-037`, `DEC-038` em `DECISIONS.md`.

Estado de cada passo fica na tabela do fim. Código e testes vencem este documento.

## Contexto (estado antes do plano)

- Conexão Azure DevOps vinha só do env (`AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`). Um projeto por deployment, um PAT para todos.
- Login era demonstração visual (`localStorage`). O backend conhecia só o token compartilhado `FOURQA_API_TOKEN`.
- Tabelas sem org/projeto; `workbook_meta` global (período, cabeçalho, parâmetros de sync, job de sync). O sync apagava `execucoes`/`falhas` de todos os planos.
- Evolução QA era placeholder. Planejar renderizava a grade inteira a cada hover, foco ou célula salva.

## Fase 1 — Login de outros QAs e conexão sem `.env`

Meso: identidade por PAT; descoberta de orgs/projetos/planos; entidade conexão; desacoplar env; frontend real.

Micro:

1. Migração aditiva: SQLite v9 e Postgres `005_users_connections.sql`. Tabelas `app_user`, `user_credential`, `qa_connection`, `connection_member`. RLS habilitada no Postgres (a API usa o dono do schema).
2. `backend/src/fourqa/auth/`: `crypto.py` (Fernet, `FOURQA_PAT_ENCRYPTION_KEY`), `session.py` (cookie `fourqa_user` HttpOnly assinado com `FOURQA_SESSION_SECRET`), `ado_identity.py` (perfil, contas, projetos e Test Plans do PAT).
3. Rotas `POST /api/auth/login {pat, organization?}`, `GET /api/auth/me`, `POST /api/auth/logout`. O PAT nunca volta ao frontend. Logout apaga o PAT guardado.
4. Descoberta: `GET /api/azure/orgs`, `GET /api/azure/orgs/{org}/projects`, `GET /api/azure/orgs/{org}/projects/{project}/test-plans`.
5. Conexões: `GET /api/connections`, `POST /api/connections` (cria ou entra), `GET /api/connections/{id}`. O frontend envia `X-FourQA-Connection`; o backend também resolve pelo `planKey`.
6. `plan_key` de conexão nova: `{org}/{project}/{planId}`. Se org/projeto/plano coincidirem com o plano legado do env, a conexão adota a `plan_key` legada e os metadados globais (preserva dados atuais).
7. Escopo por conexão: período, cabeçalho, parâmetros de sync, estado/job de sync, última sincronização e `kpi_plan_key` passam a usar chaves `conn:{id}:...` em `workbook_meta`. O sync apaga só as linhas dos planos sincronizados. Estado de sync em memória por escopo.
8. Autorização: leitura de dados de uma conexão exige membro (ou Head). Escrita exige papel efetivo Líder ou Head. `FOURQA_API_TOKEN` continua como token de serviço.
9. Frontend: Login por PAT, sessão via `/api/auth/me`, Hub lista conexões, Conectar em cascata (org, projeto, plano), cabeçalho de conexão em toda chamada, usuário e cargo reais na barra.
10. Testes: pytest (login, cripto, isolamento, 401/403), `npm run typecheck`, `npm run build`, `npm run agent:gates`.
11. Preview, env vars na Vercel e alias: só com autorização.

## Fase 2 — Evolução QA (MVP atribuível)

Histórias: US-036, US-037, US-039. Requisitos: EQA-001, EQA-002, EQA-003, EQA-008, EQA-010.

1. `domain/evolucao_qa.py`: planejado por QA (allocations das suítes com `responsavel` único), realizado das suítes atribuíveis, executado (inclui Failed) separado de finalizado (Passed + N/A, `DEC-019`), status por `status_evolucao`, bucket "não atribuível" (sem responsável ou responsável múltiplo).
2. `GET /api/evolucao-qa?planKey&from&to`, somente leitura.
3. Página com seletor de QA, KPIs, série diária e tabela. Aviso fixo sobre `OPEN-001`/`OPEN-007`: realizado = último estado do Azure por `date_completed`.
4. Fora do MVP: US-038, US-040, US-041, US-042.

## Fase 3 — Hierarquia

Modelo (`DEC-036`):

- Papéis: Head > Líder > QA > Visitante.
- Papel efetivo no projeto = papel do membro, quando definido; senão, papel global. Head global vê e edita todos os projetos.
- Usuário novo = QA. E-mail em `FOURQA_BOOTSTRAP_HEADS` = Head.
- Quem cria a conexão vira Líder dela. Quem entra herda o papel global.
- Papel no projeto: Líder ou Head altera; só Head concede Head; Líder não altera Head.
- Papel global: só Head, na tela `/admin/usuarios`. O sistema recusa rebaixar o último Head.
- Escrita (Planejar, Configurações, Atualizar) exige Líder ou mais. QA consulta. Visitante vê só o Report.

Micro: `auth/rbac.py`; `GET/PUT/DELETE /api/connections/{id}/members[/{userId}]`; `GET/PUT /api/admin/users[/{id}]`; Configurações > Usuários; página `/admin/usuarios`; UI esconde escrita conforme papel; testes da matriz.

## Fase 4 — Planejar mais leve

1. Medir: `performance.mark` ao abrir mês e salvar célula (console em dev).
2. Cortar re-renders: linha e célula com `React.memo`, callbacks estáveis, tooltip e foco sem re-render da grade.
3. Memoizar larguras de coluna (canvas único), totais por dia, valores de filtro, `pageRows`.
4. Virtualizar linhas com `@tanstack/react-virtual` quando a página passar de 50 linhas.
5. Salvar célula com resposta `?return=delta` (item alterado), patch local imutável e rollback.
6. Opcional após medição: `zustand`, filtro `from/to` no `GET /api/planejamento`.

## Login institucional (DEC-039)

Estado: **pausado** em 2026-11-03, aguardando chamado da TI (App Registration). Sem as variáveis `FOURQA_ENTRA_*`, o código fica inativo e o login segue por PAT.

Implementado local: `auth/entra.py`, `auth/credentials.py`, rotas `GET /api/auth/entra/start` e `GET /api/auth/entra/callback`, botão "Entrar com Microsoft". PAT só para dev (`npm run dev:auth` define `FOURQA_PAT_LOGIN=1`).

Pedido à TI (App Registration no tenant Foursys):

1. Microsoft Entra ID → App registrations → New registration. Nome: `FourQA`. Contas: somente deste diretório (single tenant).
2. Redirect URI (Web): `http://localhost:5173/api/auth/entra/callback` e `https://fourqa-homolog-heltonmarques-8008.vercel.app/api/auth/entra/callback`.
3. API permissions → Add → Azure DevOps → Delegated → `user_impersonation`. Mais `openid`, `profile`, `email`, `offline_access` (Microsoft Graph, delegadas). Conceder admin consent se a política do tenant exigir.
4. Certificates & secrets → New client secret (validade definida pela TI). Entregar valor por canal seguro.
5. Devolver: Directory (tenant) ID, Application (client) ID, client secret.

Antes de ativar (revisão qa-verifier de 2026-11-03, veredito FAIL):

- **Bloqueante:** não vincular conta por e-mail do perfil vssps (pode ser alterável: risco de tomar conta de um Head). Usar `tid` + `oid` do `id_token` em coluna própria; vínculo legado por e-mail uma única vez, só com claim do tenant esperado; tenant sempre GUID.
- Importante: renovação não pode recriar credencial apagada no logout (UPDATE condicional); `invalid_grant` apaga a credencial; falha de rede no refresh responde 503, não 401; `FOURQA_ENTRA_REDIRECT_URI` obrigatória fora de dev.
- Menor: mensagens fixas no `?erro=` do callback; cookie de fluxo com `typ` e tipos validados (evitar 500); JSON inválido do token endpoint tratado; testes para `/azure/orgs` com Bearer, `invalid_grant`, sync com Entra e tentativa de takeover por e-mail.

Configuração: `FOURQA_ENTRA_TENANT_ID`, `FOURQA_ENTRA_CLIENT_ID`, `FOURQA_ENTRA_CLIENT_SECRET` no `.env` local (dev) e na Vercel (Preview). Na Vercel, `FOURQA_ENTRA_REDIRECT_URI` com a URL do alias.

## Autorizações pendentes

- Commit e branch nova; aplicar migração 005 no Postgres remoto (aplica sozinha no primeiro acesso da API com `DB_PROVIDER=postgres`).
- Env vars na Vercel (`FOURQA_SESSION_SECRET`, `FOURQA_PAT_ENCRYPTION_KEY`, `FOURQA_BOOTSTRAP_HEADS`), Preview, alias e Deployment Protection para QAs externos (`OPEN-011`).

## Estado

| Passo | Estado | Evidência |
|---|---|---|
| Documentação | Concluído | este arquivo; `DECISIONS.md` DEC-035 a DEC-038 |
| Fase 1 | Implementado local (sem commit/deploy) | `backend/tests/test_auth_connections.py`; pytest 55 passed; `agent:gates` OK |
| Fase 2 | Implementado local | `domain/evolucao_qa.py`, `GET /api/evolucao-qa`, `backend/tests/test_evolucao_qa.py` |
| Fase 3 | Implementado local | `auth/roles.py`, `/api/connections/{id}/members`, `/api/admin/users`, telas Usuários e Papéis globais |
| Fase 4 | Parcial | memo de linha, tooltip/edição por linha, memoizações, cache de feriados e larguras, janela de linhas própria (>40 linhas), compartilhamento estrutural ao salvar. Pendente: medição no navegador, `?return=delta`, `@tanstack/react-virtual` (exige autorização de dependência) |

Regras aplicadas após revisão independente (qa-verifier):

- Usuário logado sem conexão selecionada recebe 400 nas rotas de relatório, leitura e escrita. Só `/api/auth`, `/api/connections`, `/api/azure`, `/api/admin`, `/api/session` e `/api/health` dispensam conexão.
- Só o plano KPI do env usa o escopo global legado. Outros planos do env reaproveitam a `plan_key` legada, mas com metadados próprios.
- Snapshot com `plan_keys` vazio não apaga nada. Sem a chave `plan_keys`, mantém o comportamento legado (substitui tudo).
- Sync usa só o PAT de quem dispara (`DEC-035`); sem fallback para o PAT do criador.
- Conexão ativa fica em `sessionStorage` (por aba).
- Head do bootstrap só é promovido se não houver nenhum Head (rebaixamento persiste).
- PAT expirado nas rotas de descoberta devolve 401. `OPTIONS` não passa pelo middleware de identidade.
- Migração 005: `CHECK` nos papéis e índice único em `lower(plan_key)`.

# ADR 008 — Migração incremental do backend Python/FastAPI para Java 25 + Spring Boot 4 (Maven)

**Status:** Vigente (`DEC-041`, 2026-11-04). Cutover local feito em 2026-11-04 (sem commit): Python removido, API em `backend/`. Homologação do host Java pendente de autorização; até lá o rollback é o último deployment Python (DEC-027).
**Data:** 2026-11-04
**Supera:** ADR 007 como alvo definitivo. ADR 006 permanece histórico; seus critérios de conclusão são reaproveitados aqui.
**Não altera:** ADR 001, 002, 003 e 004.

## Contexto

A API operacional é Python 3.12+/FastAPI em `backend/src/fourqa/` (cerca de 9.200 linhas: `domain`, `services`, `azure`, `auth`, `db`, `persistence`, `http`, `api`), publicada como função Python da Vercel (`api/index.py`). O responsável do produto decidiu migrar para Java por manutenção de longo prazo, tipagem estática, ecossistema corporativo e Spring Security.

## Tecnologias

| Peça | Papel |
|---|---|
| Java 25 LTS | Runtime da API. Enforcer `[25,26)`. |
| Spring Boot 4.0.5 (Web MVC) | HTTP. Sem Spring Security: filtro próprio `web/IdentityFilter` (ver Desvios). |
| Maven Wrapper | Build reproduzível (`./mvnw verify`). |
| JDBC puro + HikariCP (`persistence/Database`, `Conn`) | SQL explícito sobre o schema atual. Sem JPA e sem autoconfiguração de `DataSource`. |
| PostgreSQL (Supabase) | Persistência operacional; migrações `001`..`006` copiadas para `src/main/resources/db/` (mesmo conteúdo). |
| sqlite-jdbc | Testes e dev local (`FOURQA_LOCAL_SQLITE=1`, DEC-T01). |
| `java.net.http.HttpClient` | Azure DevOps REST (somente leitura) e Entra ID. |
| Fernet próprio (`auth/Crypto`) | Compatível com o Python nos dois sentidos (vetor em `AuthUnitTest`). |
| JUnit 5, MockMvc, Mockito | Testes. |

## Desvios do plano (registrados na implementação)

- **Sem Spring Security / OAuth2 Client.** A identidade do Python (cookie HMAC, PKCE Entra manual, RBAC, `require_write_auth`) foi portada 1:1 em `IdentityFilter` + `RequestIdentity` + `WriteAuth`. Motivo: paridade exata de status, mensagens e ordem de validação (422 de corpo antes/depois de dependência, como FastAPI). Spring Security pode entrar depois do cutover sem mudar contrato.
- **`HttpClient` do JDK em vez de `RestClient`**, e **JDBC/Hikari em vez de `JdbcClient`**: menos autoconfiguração, comportamento de timeout e transação explícito, mesmo modelo do Python (`psycopg` + pool).
- **Sem Testcontainers**: Docker indisponível no ambiente. Postgres coberto por testes de contrato de SQL/placeholders e pelo SQLite; exercício real de Postgres fica na homologação.
- **Token de sessão compatível**: o formato HMAC ficou byte a byte igual ao Python (vetor em `AuthUnitTest`), então o cutover não exige novo login se `FOURQA_SESSION_SECRET` for o mesmo.

## Evidência de paridade (2026-11-04)

- `./mvnw verify`: 88 testes JUnit, 0 falhas (inclui `DeployShapeTest`, porte de `test_deploy_shape.py`).
- Golden HTTP: 34 cenários capturados do Python (script de captura removido no cutover; fixtures sem dados reais em `src/test/resources/golden/`) e reproduzidos no Java com 0 divergências (`GoldenParityTest`).
- `formulas:parity` contra Python e Java sobre `formulas-parity-vectors.json`.
- JAR (`target/fourqa-api-0.2.0-SNAPSHOT.jar`) sobe local com SQLite; `/api/health` = `{"ok":true,"database":"ready"}`.
- Matriz módulo a módulo: `JAVA-PARITY.md`.

## Estratégia

1. Branch isolada; o Python é a referência até a paridade. Sem dual-write; sem dois agendadores de sync no mesmo Postgres.
2. Contratos congelados: `HTTP-CONTRACTS.md`, `http-contracts.openapi.yaml`, `backend/shared/formulas-parity-vectors.json`, DEC-031 (HTTP 400 em `planKey`), HTTP 409 no Postgres.
3. Ordem do port: fundação e health; domínio puro (gate `formulas:parity` também contra Java); persistência; Azure + sync; rotas HTTP; identidade; golden Python x Java com fixtures sanitizadas.
4. Schema inalterado; runner de migração próprio lê os mesmos `.sql`. Flyway só com baseline aprovado.
5. Cookie de sessão não precisava ser compatível; na prática ficou (mesmo HMAC). Cifra Fernet compatível, comprovada.
6. Rollback: voltar o rewrite `/api` da Vercel para o deployment Python anterior; alias manual (`DEC-027`).
7. Nenhum `--prod` sem autorização.

## Infraestrutura alvo (opção A da ADR 006)

SPA continua na Vercel. `vercel.json` faz rewrite externo de `/api/:path*` para o host Java (Azure App Service ou Container Apps). O browser vê uma origem só: cookie HttpOnly e `SameSite` inalterados, sem CORS. O host Java exige token/sessão e, se possível, restringe tráfego à origem do proxy. Sync longo (até 300 s) é assíncrono (job + polling). Preferir plano sem scale-to-zero por causa do cold start da JVM. Provisionamento exige autorização de custo, infra e segredos.

## Critérios de conclusão

- Paridade funcional aprovada contra o Python (golden rota a rota).
- Contratos HTTP preservados, inclusive códigos e mensagens de erro.
- Testes de unidade e integração aprovados, incluindo negativos (planKey inválido, 409, publicação obsoleta, 403).
- Autenticação e autorização validadas; Fernet compatível comprovado com vetor gerado pelo Python.
- Banco e Azure DevOps exercitados em homologação isolada; deploy e rollback ensaiados.
- Documentação operacional atualizada no cutover; aceite explícito do responsável.

Cumpridos localmente: paridade golden, contratos, testes, Fernet. Pendentes: homologação isolada (Postgres, Azure, Entra reais; deploy e rollback ensaiados) e aceite do responsável.

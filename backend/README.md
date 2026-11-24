# FourQA — API (Java 25 + Spring Boot 4)

API do FourQA (ADR 008, `DEC-041`). Pacotes em `src/main/java/com/fourqa/api/`: `domain`, `services`, `persistence`, `azure`, `auth`, `web`, `config`, `util`. Migrações PostgreSQL em `src/main/resources/db/postgres/` (`001`..`006`). Vetores de fórmula em `shared/formulas-parity-vectors.json`.

## Requisitos

- **JDK 25** (Eclipse Temurin recomendado; o enforcer aceita `[25,26)`)
- `JAVA_HOME` apontando para esse JDK. `scripts/mvnw.mjs` tenta descobrir pelo `java` do PATH quando a variável está vazia.
- Maven Wrapper (`mvnw` / `mvnw.cmd`; `distributionUrl` em `.mvn/wrapper/maven-wrapper.properties`)

## Desenvolvimento

Da raiz do repositório:

```bash
npm run dev       # API :3001 + Vite :5173
npm run dev:api   # só a API (spring-boot:run)
npm run dev:auth  # API + Vite com login por PAT em SQLite local
```

`GET http://localhost:3001/api/health` → `{"ok":true,"database":"ready"}`. Porta: variável `PORT` (padrão `3001`). Variáveis em `.env.example`.

## Build e testes

```bash
npm test                 # ./mvnw verify + teste do frontend
npm run formulas:parity  # FormulasParityTest
cd backend && ./mvnw -B verify
```

JAR: `target/fourqa-api-*.jar` (`java -jar`). No host operacional defina `FOURQA_HOSTED=1` e `DB_PROVIDER=postgres` (`DEC-042`).

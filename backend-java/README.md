# FourQA — fundação Java (experimental)

Não é a API em produção. Deploy e Vercel continuam no Node/Express (`../backend/`).

## Requisitos

- **JDK 25** (Eclipse Temurin recomendado; o enforcer aceita `[25,26)`)
- `JAVA_HOME` apontando para esse JDK. O Wrapper falha se a variável estiver vazia, mesmo com `java` no PATH.
- Maven Wrapper 3.9.16 (`mvnw` / `mvnw.cmd`; `distributionUrl` em `.mvn/wrapper/maven-wrapper.properties`)

Verificar versão:

```bash
java -version   # deve reportar 25.x
./mvnw -v
```

## Desenvolvimento

```bash
cd backend-java
./mvnw spring-boot:run
# Windows: mvnw.cmd spring-boot:run
```

`GET http://localhost:8080/api/health` → `{"ok":true,"service":"fourqa-java"}`

Porta: variável `PORT` (padrão `8080`).

## Build e testes

```bash
./mvnw verify
```

## Escopo atual

- Bootstrap Spring Boot 4.0.5
- Health sem banco operacional
- Sem Report, Planejamento, Sync ou port de domínio

Próximos passos: ADR dedicado, contratos HTTP alinhados ao Node, PostgreSQL quando autorizado.

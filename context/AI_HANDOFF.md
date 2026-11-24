# AI handoff (resumo datado)

**2026-11-04 — Cutover local para Java 25 + Spring Boot 4 (sem commit); Python, Express e .NET fora do working tree.**

- **API:** Java 25 + Spring Boot 4 + Maven em `backend/` (`pom.xml`, `com.fourqa.api.*`; `DEC-041`, `DEC-042`, ADR 008). Paridade com o Python removido: golden HTTP 34/34 e 88 testes JUnit (`.cursor/docs/JAVA-PARITY.md`). Frontend React/Vite (workspace npm `frontend`). Contratos: `.cursor/docs/HTTP-CONTRACTS.md`.
- **Hospedagem:** SPA na Vercel; `vercel.json` faz rewrite de `/api/:path*` para o host Java. O destino ainda é o marcador `https://fourqa-api.invalid`: host Java **não provisionado** (homologação pendente de autorização). Não gerar Preview com esse marcador esperando API.
- **Rollback:** alias para o deployment Python anterior `fourqa-iklzkc8x3` (`DEC-027`).
- **Histórico (não usar como stack atual):** Python/FastAPI (`api/index.py`, ADR 007); Express/TypeScript (`api/index.mjs`); `backend/dotnet/` (`DEC-032`).
- **Homologação:** alias oficial manual `https://fourqa-homolog-heltonmarques-8008.vercel.app` (`DEC-027`). Não usar `--prod` sem autorização.
- **Não fazer sem autorização:** deploy, banco operacional, registro de aplicativo Microsoft, merge destrutivo, cutover de alias, provisionar host Java.
- **Gates:** `npm run typecheck`, `npm test` (`./mvnw verify` + frontend; JDK 25), `npm run formulas:parity`, `npm run build`.

Verificar `git status` e código antes de confiar neste arquivo. Testes desta sessão entram no ledger quando executados aqui, não por cópia do handoff anterior.

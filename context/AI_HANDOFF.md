# AI handoff (resumo datado)

**2026-10-27 — Node operacional; .NET removido do working tree; fundação Java; ADR 006.**

- **API operacional:** Node/Express (`backend/`), Vercel `api/index.mjs`. Frontend React/Vite. Contratos HTTP de negócio não foram portados.
- **Backend futuro:** Java 25 + Spring Boot 4.0.5 em `backend-java/` (só health local). ADR 006 é direcionamento. Migração funcional não iniciada. Hospedagem, Entra ID e cutover pendentes. Spec: `JAVA-IDENTITY.md`, `HTTP-CONTRACTS.md`.
- **Removido no working tree:** `backend/dotnet/`. ADR 005 superseded. `DEC-032` / `PROP-008`.
- **Homologação:** alias oficial manual `https://fourqa-homolog-heltonmarques-8008.vercel.app` (`DEC-027`). `vercel.json` desliga deploy Git em `main` e `master`. Não usar `--prod`.
- **Não fazer sem autorização:** deploy, banco operacional, registro de aplicativo Microsoft, merge, cutover.
- **Documentação futura:** Epic FourQA; Features Report, Planejamento, Status, Execuções, Falhas, Evolução QA, Configurações; User Stories e Scenarios só depois da migração funcional.

Verificar `git status` e código antes de confiar neste arquivo. Testes desta sessão entram no ledger quando executados aqui, não por cópia do handoff anterior.

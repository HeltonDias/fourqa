# AI handoff (resumo datado)

**2026-11-04 — API operacional Python/FastAPI; Express, .NET e Java fora do working tree.**

- **API operacional:** Python 3.12+ / FastAPI (`backend/src/fourqa/`, `backend/pyproject.toml`), Vercel `api/index.py`. Frontend React/Vite (workspace npm `frontend`). Contratos: `.cursor/docs/HTTP-CONTRACTS.md`.
- **Histórico (não usar como stack atual):** Express/TypeScript (`api/index.mjs`) removido no cutover `DEC-033` / ADR 007; `backend/dotnet/` removido (`DEC-032` / ADR 005); `backend-java/` removido (`DEC-033` / ADR 006 superseded). Docs `JAVA-*` e `NET-DOTNET-REMOVAL.md` são referência histórica.
- **Homologação:** alias oficial manual `https://fourqa-homolog-heltonmarques-8008.vercel.app` (`DEC-027`). Não usar `--prod` sem autorização.
- **Não fazer sem autorização:** deploy, banco operacional, registro de aplicativo Microsoft, merge destrutivo, cutover de alias.
- **Gates:** `npm run typecheck`, `npm test` (pytest backend + frontend), `npm run formulas:parity`, `npm run build`.

Verificar `git status` e código antes de confiar neste arquivo. Testes desta sessão entram no ledger quando executados aqui, não por cópia do handoff anterior.

# FourQA — backend ASP.NET Core 10 (migração incremental)

O backend Node em `backend/` permanece o runtime de produção até paridade por fatia.

- **ADR:** `.cursor/docs/adr/005-dotnet-incremental-migration.md`
- **Fatia 1:** `FourQA.Domain` — paridade com `backend/src/domain/formulas.ts`
- **Paridade:** `backend/shared/formulas-parity-vectors.json` — `npm run formulas:parity` (Node) + `FormulasParityVectorsTests` (dotnet)

```bash
npm run formulas:parity
npm run dotnet:build
npm run dotnet:test
```

SDK: .NET **10.0.100** estável (`global.json`, `rollForward: patch`). CI job `dotnet` obrigatório para concluir fatia.

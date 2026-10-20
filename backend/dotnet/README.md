# FourQA — backend ASP.NET Core 10 (migração incremental)

O backend Node em `backend/` permanece o runtime de produção até paridade por fatia.

- **ADR:** `.cursor/docs/adr/005-dotnet-incremental-migration.md`
- **Fatia 1:** `FourQA.Domain` — paridade com `backend/src/domain/formulas.ts`

```bash
dotnet test backend/dotnet/FourQA.sln
```

SDK: .NET 10 (`global.json`). Local sem SDK: confiar no job `dotnet` da CI.

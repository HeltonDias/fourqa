# FourQA — índice de invariantes de domínio

Fonte canônica: **código atual + testes + ADR correspondente**, não este resumo.

- **Status de execução**: `docs/adr/002-status.md`; preserve classificador compartilhado (`classifyExecution`), sem regras concorrentes no frontend.
- **Hierarquia/frentes dinâmicas**: `docs/adr/001-hierarquia-dinamica.md`; nunca fixar frentes do Excel (GEMCO etc.) como taxonomia global. Respeite a origem/confiança da dimensão.
- **Planejamento e divergências Home × Planejamento**: `docs/adr/003-planejamento.md`; não equalizar fórmulas sem entender seu propósito.
- **Baseline, revisão e cronograma**: `docs/adr/004-planejamento-baseline.md`.
- **Status por frente**: página `StatusPage.tsx`, catálogo `components/status/statusModel.ts` e agregação em `reportService.ts`. Não redefinir indicador de saúde consolidada por maioria sem verificar o contrato de negócio; cuidado com dupla contagem quando rótulos de frente se sobrepõem.
- **Persistência**: mudanças de armazenamento precisam preservar contratos e testar compatibilidade SQLite/PostgreSQL.

Leia **somente** o ADR afetado. Se houver dúvida entre resumo e código, examine implementação/testes e sinalize inconsistência.

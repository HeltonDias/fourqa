# ADR 006 — Migração incremental do backend Node.js para Java 25 + Spring Boot

**Status:** Direcionamento aprovado em 2026-10-27, a pedido do responsável do produto. A migração funcional **não começou**. Hospedagem, Microsoft Entra ID, cutover e banco operacional **não estão aprovados** e não devem ser tratados como decididos.
**Data:** 2026-10-27
**Supera:** o alvo ASP.NET Core 10 do ADR 005. O ADR 005 permanece como histórico (`DEC-032`, `PROP-008`).
**Não altera:** ADR 001, 002, 003 e 004. Node/Express em `backend/` continua a API operacional na Vercel (`api/index.mjs`).

## Contexto

O FourQA em execução é um SPA React 19 / Vite e uma API Express 5 em TypeScript. PostgreSQL (Supabase) guarda snapshot e planejamento. O Azure DevOps é a fonte de resultados, só leitura. O frontend não é substituído.

Houve uma fatia experimental ASP.NET Core 10 em `backend/dotnet/` (ADR 005). O cutover nunca ocorreu. `DEC-032` remove esse código do repositório ativo porque ele competia com o Node já primário, sem paridade de API nem homologação. A fundação `backend-java/` existe apenas como bootstrap: Spring Boot 4.0.5, JDK 25, Maven Wrapper 3.9.16 e `GET /api/health` local. Esse health **não** é o contrato Node (`ok` + `database`).

Java foi escolhido como backend futuro por manutenção de longo prazo, ecossistema corporativo (incluindo Spring Security na etapa de identidade) e separação clara do runtime Node que hoje também serve o frontend na Vercel. O custo é uma segunda implementação até o corte, risco de divergência de contrato e a proibição de dois escritores no mesmo plano.

## Tecnologias

| Peça | Papel |
|---|---|
| Java 25 LTS | Runtime futuro da API. Enforcer `[25,26)`. |
| Spring Boot 4.0.5 | Fundação atual. Sem domínio portado. |
| Spring Security | Só na etapa de identidade. Não está no `pom.xml` desta fase. |
| Maven Wrapper 3.9.16 | Build reproduzível. `distributionUrl` única. |
| PostgreSQL / Supabase | Persistência. Esquema atual permanece. |
| Azure DevOps REST | Fonte de Test Points, resultados e bugs. |
| React + TypeScript + Vite | Frontend preservado. |

## Estratégia de migração

Migração incremental. O Node é a referência de comportamento até a paridade aprovada de cada fatia.

1. Comparar contratos HTTP (`HTTP-CONTRACTS.md`), não redefinir métricas.
2. Usar fixtures sanitizadas. Não usar banco operacional nem planilha de cliente como oráculo.
3. Testes de equivalência das regras já cobertas no Node (`formulas:parity`, testes de PlanKey, sync e escrita).
4. Processos isolados. Java não atende tráfego de produção enquanto o Express estiver no ar.
5. Um único escritor por plano em qualquer transição. Não há dual-write. Dois runtimes gravando o mesmo PostgreSQL são proibidos até o corte, em que só um permanece.
6. Rollback: o alias oficial continua no Express. Desligar o processo Java e manter o deployment Node anterior. Não há migração de esquema só por trocar de linguagem, então o rollback de dados não depende de down-migration de framework.
7. Nenhum cutover antes de homologação e aceite explícito.

A fundação atual não grava banco e não chama o Azure DevOps.

## Infraestrutura

Nenhuma opção abaixo está escolhida nem provisionada.

| | A. SPA na Vercel, API Java à parte | B. SPA compilado servido pelo Spring Boot | C. Mesma plataforma, serviços separados |
|---|---|---|---|
| Segurança | Origens distintas. Cookie de sessão exige plano de CORS e `SameSite`. | Uma origem. Cookie e CSRF mais simples. | Depende do domínio compartilhado. |
| Custo | Dois produtos (Vercel + host Java). | Um host de processo longo. | Um provedor, dois serviços. |
| Simplicidade | Frontend permanece como está. | Empacota o `frontend/dist` no Java. | Mais peças de rede. |
| Observabilidade | Dois lugares de log. | Um processo. | Dois serviços, um provedor. |
| Latência | Hop extra se o browser chama outro host. | Mesma origem. | Hop interno. |
| Manutenção | Deploy de front e API separados. | Um artefato. | Dois artefatos, um pipeline. |
| Rollback | Volta o alias/API para o Express sem mexer no SPA. | Troca o processo inteiro de volta ao par Vercel. | Volta só o serviço de API. |

A Vercel hoje desliga deploy Git em `main` e `master` (`vercel.json`). O alias oficial é manual (`DEC-027`). Isso não escolhe a opção A, B ou C.

## Persistência

Manter PostgreSQL e as migrações em `backend/src/db/postgres/migrations/`. Não remodelar o esquema para acompanhar a linguagem. Não executar migração no Supabase operacional nesta linha. SQLite continua suporte de teste e legado no Node até a fatia Java correspondente existir.

## Sincronização

O Node valida o lote antes de gravar, publica `execucoes` e `falhas` na mesma transação e só publica com `jobId` dono e vivo (`syncJob.ts`). Falha no meio não substitui o snapshot. Isso não é um lock de “um escritor por plano”: o claim de sync é global e o 409 de planejamento é otimista no Postgres. SQLite de desenvolvimento pode divergir.

Gaps herdados da remoção C# (`.cursor/docs/NET-DOTNET-REMOVAL.md`): não existe mais um segundo implementador; o golden HTTP C# foi perdido; não se deve presumir fencing ou worker in-process do experimento .NET no Node. Na migração Java, sync duplicado, timeout, worker obsoleto e publicação parcial continuam riscos. Dois agendadores (Express e Java) no mesmo banco são dual-write e ficam proibidos.

## Critérios de conclusão

A migração só está completa quando todos os itens abaixo tiverem evidência, não apenas build verde:

- Paridade funcional aprovada contra o Node.
- Contratos HTTP preservados, inclusive códigos de erro confirmados.
- Testes de unidade e integração aprovados.
- Testes negativos e de concorrência relevantes (PlanKey inválido, 409, publicação obsoleta).
- Autenticação e autorização validadas (especificação em `JAVA-IDENTITY.md`; ainda não implementadas).
- Banco e Azure DevOps exercitados em homologação isolada.
- Deploy e rollback ensaiados.
- Documentação atualizada.
- Aceite explícito do responsável.

Até lá o backend operacional é o Node.

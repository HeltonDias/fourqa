# Partitura operacional — referência visual

Carregar só se a comunicação ou a auditoria do Maestro precisar do glossário. Não cria etapa, agente, ferramenta nem checkpoint.

## Glossário

| Termo | Significado técnico |
|---|---|
| Maestro | Cursor Agent principal |
| Orquestra | Neural Squad já existente |
| Naipe | Categoria visual de competência |
| Instrumento | Alias visual de um agente, ferramenta ou capacidade que já existe |
| Partitura | Especificação operacional da tarefa |
| Repertório | Regras, contratos e procedimentos aprovados |
| Ensaio / afinação | Teste, revisão e correção |
| Concerto | Entrega verificada |

Identificadores de invocação: `impact-analyst`, `qa-verifier`, `regras`. Context Engine e Graphify são fontes ou ferramentas, não agentes.

## Mapa visual

Não há líder de naipe executável.

- Regência: Cursor Agent principal.
- Cordas — implementação: frontend e backend, feitos pelo agente principal.
- Madeiras — contexto: Context Engine (`02-context-engine.mdc`) e Graphify opcional no movimento 07.
- Metais — impacto: `impact-analyst`.
- Percussão — verificação: `qa-verifier`.

Naipe não é prioridade nem dependência. Seleção por relevância, risco, custo e permissão.

## Movimentos

Rótulos do ciclo já definido em `SKILL.md`. Movimento 01 é a Partitura de Abertura, não uma linha de status.

1. Abertura — interpretar.
2. Leitura da partitura — contextualizar.
3. Arranjo — planejar.
4. Distribuição dos naipes — delegar, só se necessário.
5. Execução — implementar.
6. Ensaio e afinação — verificar e corrigir.
7. Concerto e repertório — entregar e, se couber, atualizar conhecimento verificável.

Frases opcionais, só se o estado real ficar claro: «Partitura definida», «Em execução», «Afinação concluída», «Concerto entregue». Proibidas em commit, código, schema, log de teste e saída de teste.

## Comportamento esperado

Isto não é suíte automatizada. Não introduzir defeito em código operacional para exercitar estes casos. Invocação não observada fica pendente.

| Caso | Esperado |
|---|---|
| A Tarefa simples | Agente principal, sem especialista e sem `graphify update`. |
| B Alteração transversal | `impact-analyst` uma vez, se o mapa de impacto ainda não existir. |
| C Regra de negócio crítica | Contrato pertinente recuperado; `qa-verifier` com evidência própria. |
| D Informação insuficiente | Investigar código real; não inventar arquitetura. |
| E Operação destrutiva | Não executar; pedir autorização. |
| F Teste reprovado | Rótulo Teste reprovado, correção, nova verificação. Sem repetir a mesma tentativa sem limite. |
| G Contexto histórico divergente | Código, teste e decisão atual vencem auditoria antiga. |
| H Descoberta nativa | Rules, skill e agents pelos caminhos Cursor. Tema musical não muda a invocação. |
| I Graphify | Sem atualização em tarefa simples ou mudança não estrutural. Disponibilidade: skill `maestro-orchestration`, canais CLI, skill e MCP separados. Busca vazia não declara ausência. Com mudança estrutural e CLI disponível: `graphify update <path>`. Grafo não é validação funcional. |
| J Naipes | Nenhum agente, chamada ou diretório extra por causa do tema. |
| K Comunicação | Partitura de 50–120 palavras antes da investigação, também no modo conciso. Depois, só mudança de movimento, sem narrar comando. Alertas `Erro:`, `Bloqueio:`, `Risco:` e `Decisão necessária:` permanecem. Entrega final completa. |

## Pendências que esta referência não fecha

ADR 005 superseded (`DEC-032`, 2026-10-27): `backend/dotnet/` removido; API operacional Node/Vercel; fundação `backend-java/` separada. Sem migração de banco operacional nesta linha.

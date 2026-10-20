# FourQA — fluxo de trabalho do Cursor (v1)

## Propósito
Desenvolver o FourQA como produto, por **Epic → Feature → Function → User Story → tarefa → teste → aceite**, sem inflar o contexto nem tomar decisões de produto sem autorização. Arquivos de agentes são assistentes opcionais; regras de projeto ficam em `.cursor/rules/`.

## Um ciclo de desenvolvimento
1. **Escolher escopo:** apontar `US-...` do `BACKLOG.md`, critério específico em `REQUIREMENTS.md`, contexto do `ROADMAP.md` e aprovação do usuário. Se uma história estiver bloqueada por `OPEN-...`, **não** adivinhar a decisão.
2. **Localizar:** buscar símbolos e arquivos relevantes; checar `git status --short`; só consultar `DECISIONS.md`/ADR aplicáveis e `ARCHITECTURE.md` se houver impacto arquitetural. Código e testes verificam estado atual, documentação rege alvo.
3. **Plano proporcional:** ajuste pequeno pode ser direto se autorizado; mudança de fórmula, migração, autenticação, atribuição ou integração exige plano, riscos, casos de borda e autorização antes de implementar.
4. **Implementar sem exceder escopo.** Preservar trabalhos não commitados e interfaces públicas; não atualizar outros módulos apenas para harmonizar fórmulas.
5. **Testar:** casos direcionados primeiro; typecheck, build, regressões e conferência visual **com dados** quando aplicável. Dizer o que foi testado e o que não foi.
6. **Validar/aceitar:** entregar diff e evidências; somente o usuário dá aceite funcional. Atualização de requisito/decisão quando houver mudança aprovada.
7. **Publicar:** commit/push/deploy só após autorização separada. Preview criado pela Vercel não é novo projeto/ambiente, mas tem URL individual imutável. Após validação, apontar o **alias único** `fourqa-homolog-heltonmarques-8008.vercel.app` à nova versão autorizada. Nunca `--prod` sem autorização.

## Quando chamar agentes
- **`impact-analyst`**: alteração transversal envolvendo regra de negócio, persistência, Azure/API ou risco sério de regressão. Leitura e análise; não edita.
- **`qa-verifier`**: avaliação independente após implementação não trivial. Leitura/testes locais; não edita nem faz deploy.
- **`regras`**: legado preservado como revisor **opcional**, somente quando o usuário pedir auditoria do processo; não é orquestrador.
- **Mudança local simples:** agente principal executa e testa; não delegar apenas para cumprir ritual.

## Modelo de solicitação eficiente
`Implementar US-XXX / RPT-YYY. Escopo: [página/componente]. Leia só as seções correspondentes de .cursor/docs/BACKLOG.md, REQUIREMENTS.md e DECISIONS.md/ADR se aplicáveis. Verifique código e git status. Não altere outros módulos. Execute testes relevantes e relate evidência/limites. Sem commit/push/deploy/banco. Aguarde aceite.`

## Contratos de segurança
- Não expor arquivos `.env`, credenciais, dados de clientes, banco local ou backups em contexto/logs.
- Não inventar dados/permissões nem executar SQL/fórmula arbitrária por causa de KPI configurável.
- Relatos de especialistas são orientações, não provas. Conflito de fontes = classificar e pedir decisão.
- Evitar editar `context/AI_HANDOFF.md` a cada interação pequena; manter atualização datada e objetiva ao fechar marcos autorizados.

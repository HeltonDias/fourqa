---
name: regras
model: inherit
is_background: true
---

Cursor, a partir de agora quero acelerar nosso desenvolvimento do FourQA.

Adote um fluxo contínuo de execução com as seguintes regras:

1. Leia o contexto existente e crie ou mantenha `context/AI_HANDOFF.md` com: objetivo atual, etapa concluída, testes executados, bloqueios reais, arquivos alterados e próxima ação.
2. Trabalhe autonomamente dentro do escopo autorizado: investigue, implemente, teste, corrija e reteste sem pedir confirmação a cada passo.
3. Utilize `@impact-analyst` e `@qa-verifier` quando houver benefício concreto, evitando análises redundantes.
4. Execute verificações automáticas sem consumir tokens de IA para tarefas que scripts podem resolver.
5. Preserve as regras de negócio e as alterações já existentes.
6. Não interrompa o fluxo por erros corrigíveis localmente.
7. Pare obrigatoriamente antes de operações destrutivas, alterações hospedadas de banco/permissões, publicação, mudanças de custo ou decisões que exigem credenciais e autorização.
8. Ao final, entregue um resumo de no máximo 15 linhas: RESULTADO, ALTERAÇÕES, TESTES, BLOQUEIOS, PRÓXIMO PASSO.
9. Nunca declare testes como PASS sem executá-los.
10. Não inclua segredos, tokens, strings de conexão ou dados sensíveis no handoff.
11. Não faça commit ou push automaticamente sem autorização.

O objetivo é reduzir interações desnecessárias sem perder segurança, rastreabilidade ou qualidade.
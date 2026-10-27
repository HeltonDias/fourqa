# Identidade e segurança — especificação para a migração Java

**Estado:** proposta de arquitetura. Não há login Microsoft, registro de aplicativo, sessão nem Spring Security no repositório. Autenticação válida no futuro **não** concede acesso a todos os planos.

Documentação funcional por Epic, Feature, User Story e Scenario fica para depois da migração funcional. Esta página não inventaria histórias.

## Situação atual (código)

Escrita (`requireWriteAuth` em `backend/src/routes/api.ts`): bearer compartilhado comparado em `backend/src/http/writeAuth.ts`. Sem token configurado, a escrita responde 503, salvo `FOURQA_ALLOW_OPEN_WRITES=1` fora da Vercel. Token ausente ou diferente: 401 `"Não autorizado."`. Não há 403 no código atual.

Leitura GET, exceto `/api/health`, pode exigir o mesmo bearer quando a proteção de leitura está ligada. Sem token no servidor: 503. O browser guarda o token em `localStorage` (`ARCHITECTURE.md`). Isso não é identidade de usuário.

O health Java (`{"ok":true,"service":"fourqa-java"}`) não protege o Express na Vercel. Enquanto os dois existirem, cada um autentica as próprias rotas. Login no Java não fecha o Node.

## Direção proposta

Microsoft Entra ID, OpenID Connect e OAuth 2.0.

- Contas organizacionais. Single-tenant no início, se a organização aprovar.
- Authorization Code Flow no backend Java (cliente confidencial). O React só mostra o botão e recebe a sessão.
- O FourQA não armazena senha Microsoft.
- MFA e políticas ficam no Entra ID. Não depender de licença P1/P2 para o fluxo básico.
- Sem Microsoft Graph e sem permissão ampla até haver necessidade comprovada.
- Login Microsoft não autoriza, por si, o Azure DevOps. O PAT ou o conector de sync continua sendo credencial à parte, fora do Git.

### BFF e sessão

Preferência: BFF. O Spring Security completa o código OIDC no servidor. O browser não guarda access token nem refresh token no `localStorage`.

Cookie de sessão:

- `HttpOnly`
- `Secure` em HTTPS
- `SameSite` conforme a topologia do ADR 006 (estrito se a origem for a mesma; `None` + `Secure` só se front e API ficarem em sites diferentes, e mesmo assim com CSRF)
- expiração limitada
- regenerar a sessão no login (fixação)
- CSRF nas operações que usam o cookie
- logout local, que apaga o cookie, e logout OIDC no provedor quando o registro do aplicativo tiver logout URI

CORS não substitui isso. Cookie entre domínios distintos não deve ser assumido. A opção de uma origem só (ADR 006, alternativa B) é a mais simples para o cookie. Não implementar autenticação só no frontend.

### Registro do aplicativo (procedimento, sem executar)

Exige quem possa registrar aplicativo no tenant. Não há acesso administrativo presumido. Não registrar nada nesta fase.

1. Escolher o tenant (single-tenant).
2. Criar aplicativo Web, cliente confidencial.
3. Anotar Application (client) ID e Directory (tenant) ID em cofre, não no Git.
4. Redirect URI e logout URI por ambiente (desenvolvimento, homologação, produção). URIs locais não entram no aplicativo de produção.
5. Client secret ou certificado só no cofre do ambiente. Rotacionar. Nunca no repositório.
6. Consentimento restrito ao tenant. Sem usuários convidados até decisão explícita.
7. Restringir quem pode entrar (atribuição do aplicativo ou grupo), se a política da organização permitir sem licença P1/P2. Se a restrição exigir licença superior, parar e pedir aprovação.
8. Segredos diferentes por ambiente.

## Autorização proposta

Identidade estável: `tid` (tenant) + `oid` (objeto do usuário). E-mail é atributo, não chave.

Perfis iniciais, sujeitos a aprovação:

| Perfil | Proposta |
|---|---|
| Administrador | Configuração, usuários autorizados e planos autorizados. |
| QA | Consulta e operações de QA permitidas no plano em que estiver autorizado. |
| Leitor | Somente leitura dos relatórios autorizados. |

O servidor autoriza cada pedido. Esconder botão no React não autoriza.

| Operação | Proposta |
|---|---|
| Módulos e leitura de relatório | Perfil com acesso ao módulo e ao PlanKey. |
| Escrita de cabeçalho, período, revisão, célula | QA ou Administrador no PlanKey. |
| Sync | Papel explícito, separado da leitura. |
| Administração de usuários e planos | Administrador. |

Autenticação não implica lista de planos. Provisionar vínculo usuário–PlanKey. Revogar o vínculo sem apagar histórico. Auditar quem alterou planejamento e quem disparou sync, quando a identidade existir. Até lá o bearer compartilhado não distingue pessoas.

## Node durante a migração

Não abrir endpoints. Não remover o bearer do Express porque o Java passou a ter login. A substituição é gradual e por corte de rota, com o Express ainda protegido até sair do ar. Exposição atual prioritária, sem mudança de produção nesta tarefa: o token compartilhado no `localStorage` não é identidade e vale para quem o possuir.

## Riscos

| Risco | Gravidade | Notas |
|---|---|---|
| Achar que o login Java protege a Vercel | Alta | São processos diferentes. |
| Token no `localStorage` | Alta | Estado atual. XSS leva o bearer. |
| Cookie entre origens sem CSRF | Alta | Depende da opção de hospedagem, ainda em aberto. |
| Secret de aplicativo no Git | Alta | Proibido. |
| Custo de host Java ou licença Entra | Média | Sem aprovação, sem provisionar. |
| Admin do tenant indisponível | Média | O registro fica bloqueado. |
| PlanKey ignorado depois do login | Alta | Autorizar no servidor por plano. |

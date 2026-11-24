# Identidade e segurança — migração Java (ADR 008)

**Estado (2026-11-04, após cutover local):** a identidade é a do Java em `backend/`, porte 1:1 do Python removido (`auth/`, `api/identity_routes.py`). Reproduz o mesmo comportamento (`auth.*`, `web.IdentityFilter`, `web.IdentityController`) e passa nos testes portados (`AuthConnectionsTest`, `EntraLoginTest`, `AuthUnitTest`) e no golden. Spring Security **não** foi adotado (ver ADR 008, Desvios). Autenticação válida **não** concede acesso a todos os planos.

## Situação atual (código Java; igual ao Python removido)

- **Sessão:** cookie `fourqa_session` (HttpOnly, `SameSite=Lax`, `Secure` em HTTPS), token HMAC com `FOURQA_SESSION_SECRET`, validade 12 h. Formato idêntico nos dois runtimes (vetor em `AuthUnitTest`), então o cutover não exige novo login se o segredo for o mesmo.
- **Entra ID:** Authorization Code + PKCE no backend (`/api/auth/entra/start`, `/callback`), cookie transitório `fourqa_oauth` (10 min, path `/api/auth/entra`). Refresh token cifrado.
- **PAT dev:** login por PAT só com `FOURQA_PAT_LOGIN` fora do runtime hospedado.
- **Cifra:** Fernet com chave derivada de `FOURQA_PAT_ENCRYPTION_KEY`; compatível Python ↔ Java nos dois sentidos.
- **RBAC:** Head > Líder > QA > Visitante (DEC-036, DEC-038). Head global vale em toda conexão; demais papéis vêm do vínculo de membro da conexão. Escrita exige Líder ou superior. `FOURQA_BOOTSTRAP_HEADS` promove e-mails listados.
- **Conexões e convites:** conexão = projeto Azure DevOps + Test Plan; convites por e-mail (DEC-040). Escopo da requisição via header `x-fourqa-connection`.
- **Bearer compartilhado (DEC-T02):** `FOURQA_API_TOKEN` continua aceito em `require_write_auth`; sem token configurado, escrita 503 salvo `FOURQA_ALLOW_OPEN_WRITES=1` fora da Vercel.

Pendente na homologação: Entra real (registro do aplicativo, redirect URI do host Java), Postgres real e cookies atrás do rewrite da Vercel.

O texto abaixo é a proposta original (ADR 006) e fica como referência de requisitos de segurança.

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

## Python durante a migração

Não abrir endpoints. O Java não protege a função Python da Vercel: são processos diferentes. Sem dual-write: só um backend atende `/api` por vez (troca pelo rewrite no cutover).

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

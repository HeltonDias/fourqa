# Design System · FourQA v1.0

**Data:** 30/10/2026
**Status:** vigente (DEC-034)
**Origem:** adaptação do *Design System · Portal de Massa v0.4* (28/10/2026), que segue o visual do portal de ofertas QA. Só a identidade visual foi herdada; telas, fluxos e regras do Portal de Massa (Prateleira, Reserva, Upload, Livre/Reservada) **não se aplicam** ao FourQA.

**Fonte viva dos tokens:** `frontend/src/styles.css` (bloco `:root` e `html[data-theme="dark"]`).
**Stack:** CSS próprio + React. **Sem MUI / Material Kit** — o visual é reproduzido por tokens e classes existentes.

---

## 1. Direção

- Marca Foursys: navy `#222239`, laranja `#FF5315`, baunilha `#FFE2A9`, menta `#89BAB1`.
- Telas de entrada (Login, Hub de planos): **hero navy com degradê** + **card branco elevado** sobreposto.
- Telas de trabalho (Report, Planejamento, Status, Execuções, Falhas, Evolução QA, Configurações): estrutura atual `AppLayout` → `ReportChrome` → `PageHeader` → conteúdo, com cards brancos elevados sobre fundo `--page-bg`. Hero, quando usado, é enxuto.
- Tipografia: **Roboto** (corpo/UI) + **Roboto Slab** (títulos de página).
- Tema claro e escuro continuam suportados (`data-theme`).

## 2. Cor

### Paleta de marca

| Token | Valor | Uso |
|---|---|---|
| `--navy` | `#222239` | Texto forte, hero, chrome escuro, botão dark |
| `--navy-mid` | `#2E2E4F` | Degradê do hero, topbar no tema escuro |
| `--orange` | `#FF5315` | Primary, CTA, foco, item ativo |
| `--orange-focus` | `#E8470C` | Hover/pressed do primary |
| `--orange-ink` | `#C2400D` | Laranja como **texto** sobre branco (contraste ≥ 4,5:1) |
| `--vanilla` | `#FFE2A9` | Sobretítulo no hero |
| `--mint` | `#89BAB1` | Info / acento secundário |
| `--mint-deep` | `#4F8A80` | Info com texto/ícone |

### Papéis semânticos (o que os componentes consomem)

| Token | Claro | Uso |
|---|---|---|
| `--ink` / `--text` | `--navy` | Texto principal. Em tabelas densas o corpo usa navy, não cinza, por legibilidade |
| `--muted` | `#5B5D75` | Texto secundário, descrições, legendas |
| `--page-bg` | `#F6F5F2` | Fundo geral |
| `--card-bg` / `--surface` | `#FFFFFF` | Cards e superfícies de trabalho |
| `--surface-2` | `#F2F1ED` | Faixas, cabeçalhos de tabela, zebra |
| `--border` | `#E6E4DF` | Bordas e divisores |
| `--accent` / `--primary` / `--tertiary` | `--orange` | Ação principal |
| `--tertiary-soft` | `#FFF0EA` | Fundo de item ativo / destaque suave |

### Status (Test Point / execução)

Status **sempre com palavra** na pílula; cor é reforço.

| Token | Valor | Status FourQA |
|---|---|---|
| `--ok` | `#4CAF50` | Passed |
| `--danger` | `#F44335` | Failed |
| `--warn` | `#FB8C00` | Blocked / atenção |
| `--mint-deep` | `#4F8A80` | NotApplicable / info |
| `--neutral` | `#8A8CA3` | NotRun / sem dado |

Texto de pílula: sobre fundo suave (cor a ~12–16%) usar a cor cheia ou navy. **Não** usar texto branco sobre `--ok` ou `--warn` (contraste insuficiente).

### Hero

```css
background: var(--hero-bg);
/* = radial laranja 88% 18% + radial menta 8% 92% + linear 135deg navy → navy-mid */
```

Sobretítulo: `--vanilla`. Título e corpo: branco.

## 3. Tipografia

| Papel | Token | Família |
|---|---|---|
| UI / corpo / tabelas | `--font-sans` | Roboto, Segoe UI, system-ui |
| Títulos de página (h1) e destaques do hero | `--font-display` | Roboto Slab |
| Rótulo / botão | `--font-sans` | Roboto 500–700; uppercase só em sobretítulos de seção |

Pesos carregados: Roboto 400/500/700, Roboto Slab 500/700 (`frontend/index.html`).

## 4. Forma, sombra e espaço

| Token | Valor | Uso |
|---|---|---|
| `--radius` | `12px` | Cards, inputs, botões |
| `--radius-xl` | `16px` | Card do hero (login/hub), modais |
| `--shadow-card` | sombra lg | Cards de trabalho |
| `--shadow-xxl` | sombra xxl | Card sobreposto ao hero |
| Alvo mínimo | ~40px | Botões e controles clicáveis |

## 5. Componentes (padrão FourQA)

| Peça | Comportamento |
|---|---|
| Login | Hero navy em tela cheia + card central `--radius-xl`/`--shadow-xxl`. Bloco "Modo de teste" (token) acima; divisória "ou"; botão **Entrar com Microsoft** no padrão da Microsoft (fundo branco/escuro + logo de 4 quadrados, nunca laranja) |
| Hub de planos | Hero navy + grade de cards, um por Test Plan (DEC-003) |
| Topbar / sidebar | Clara no tema claro; item ativo com `--tertiary-soft` e texto navy |
| Botão primary | Fundo `--orange`, hover `--orange-focus` |
| Botão dark / outlined | Navy / contorno navy |
| Card | Branco, `--radius`, `--shadow-card`; nada de cartão "morto" sem elevação |
| Seção | Sobretítulo `--orange-ink` uppercase + título + descrição |
| Voltar | Texto + seta, canto superior esquerdo do card |

## 6. Acessibilidade

- Laranja `#FF5315` **não** é texto corrido sobre branco; para texto use `--orange-ink`.
- Texto branco sobre `#FF5315` tem contraste ~3,2:1 (AA só para texto grande). Pendente: decidir rótulo de botão primary (navy sobre laranja ≈ 4,8:1, ou branco em negrito ≥ 18,66px).
- Status com palavra, não só cor. Foco visível (`outline` laranja 2px). Alvo mínimo ~40px.

## 7. O que não entra

- MUI / Material Kit como dependência.
- Telas e regras do Portal de Massa.
- Casca LibreChat; Inter/Nunito/IBM Plex como família principal.
- Índigo/roxo genérico de UI de IA.

## 8. Histórico

| Versão | Nota |
|---|---|
| Portal de Massa v0.4 | Referência visual de origem (equipe) |
| **FourQA v1.0** | Adaptação: tokens Foursys em `styles.css`, Roboto/Roboto Slab, sem MUI, status de teste mapeados |

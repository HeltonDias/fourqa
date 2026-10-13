# FourQA — convenções visuais atuais

Referência aprovada: cabeçalho adotado na aba Status e compartilhado nas demais páginas (snapshot enviado em outubro/2026).

- **Estrutura**: `AppLayout` (navegação e composição) → `ReportChrome` (identidade/período/atualização do projeto) → `PageHeader` (título, descrição e ações da página) → conteúdo.
- **Regra de reutilização**: não criar cabeçalhos de projeto exclusivos por página nem duplicar JSX/CSS global.
- **Ações locais**: manter filtros, edição de período e controles particulares das telas; `PlanningPageHeader` e `ReportPageHeader` são wrappers existentes.
- **CSS**: aproveitar `frontend/src/styles.css` e estilos/componentes presentes; evitar novo design system ou CSS espalhado sem necessidade.
- **Estados**: loading, vazio, erro, dados indisponíveis; status comunica por texto/ícone além de cor.
- **Responsividade**: verificar título longo, botões, datas e grades sem overflow; testar pelo menos viewport amplo e estreito quando a alteração for visual.
- **Critério**: estrutura visual consistente, mas sem refatorar cálculos, rotas ou regras de negócio por conveniência de layout.

Quando a decisão exigir valores exatos de estilo, consultar CSS e componentes reais — este arquivo não substitui inspeção focalizada.

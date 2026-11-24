import type { CentralConfiguracoes, SectionId } from "./types";
import { norm } from "./ops.ts";

export const SECTIONS: { id: SectionId; titulo: string; resumo: string; subtitulo: string }[] = [
  {
    id: "azure",
    titulo: "Integração Azure DevOps",
    resumo: "Organização, projeto e credencial",
    subtitulo: "Define de onde o FourQA busca planos, execuções e defeitos.",
  },
  {
    id: "planos",
    titulo: "Planos de testes",
    resumo: "Planos monitorados e PlanKey",
    subtitulo: "Escolhe quais planos entram na coleta e como cada fase fica separada.",
  },
  {
    id: "hierarquia",
    titulo: "Hierarquia das suítes",
    resumo: "Frentes, ondas e processos",
    subtitulo: "Traduz os níveis da árvore do Azure nos agrupamentos dos relatórios.",
  },
  {
    id: "categorias",
    titulo: "Categorias e responsabilidades",
    resumo: "Atividade e área responsável",
    subtitulo: "Relaciona o tipo da falha à área que responde por ela.",
  },
  {
    id: "execucoes",
    titulo: "Campos de execuções",
    resumo: "Colunas dos cenários",
    subtitulo: "Escolhe quais informações de cada cenário aparecem nos relatórios e nas exportações.",
  },
  {
    id: "falhas",
    titulo: "Campos de falhas",
    resumo: "Colunas dos defeitos",
    subtitulo: "Escolhe quais informações de cada defeito aparecem nos relatórios e nas exportações.",
  },
  {
    id: "exportacao",
    titulo: "Parâmetros de exportação",
    resumo: "Destino, cabeçalho e indicadores",
    subtitulo: "Define nomes de destino, cabeçalho e o plano usado nos indicadores.",
  },
  {
    id: "diagnostico",
    titulo: "Diagnóstico",
    resumo: "Coleta e consistência",
    subtitulo: "Mostra o resultado da última coleta e o que ainda falta nesta central.",
  },
];

export function sectionHaystack(section: SectionId, config: CentralConfiguracoes): string {
  switch (section) {
    case "azure":
      return [config.azure.organization, config.azure.project, config.azure.apiVersion, "pat credencial organizacao projeto api"].join(" ");
    case "planos":
      return config.planos.flatMap((plano) => [plano.planKey, plano.planName, plano.planId, plano.suiteNameFilter]).join(" ");
    case "hierarquia":
      return config.hierarquia.flatMap((nivel) => [nivel.coluna, nivel.nivelOrigem, nivel.planKey, nivel.fonte]).join(" ");
    case "categorias":
      return config.categorias.flatMap((item) => [item.categoria, item.responsabilidade]).join(" ");
    case "execucoes":
      return config.execucoes.flatMap((campo) => [campo.campo, campo.ajuda, campo.padrao, campo.valor]).join(" ");
    case "falhas":
      return config.falhas.flatMap((campo) => [campo.campo, campo.ajuda, campo.padrao, campo.valor]).join(" ");
    case "exportacao":
      return [
        config.exportacao.tabelaExecucoes,
        config.exportacao.tabelaFalhas,
        config.exportacao.kpiPlanKey,
        config.exportacao.frentesValidas.join(" "),
        "limpar cabecalho frente",
      ].join(" ");
    case "diagnostico":
      return "coleta sincronizacao registros inconsistencia ambiente";
  }
}

export function sectionMatches(section: SectionId, config: CentralConfiguracoes, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const meta = SECTIONS.find((item) => item.id === section);
  return norm([meta?.titulo, meta?.subtitulo, meta?.resumo, sectionHaystack(section, config)].join(" ")).includes(q);
}

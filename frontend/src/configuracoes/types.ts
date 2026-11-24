export type SectionId =
  | "azure"
  | "planos"
  | "hierarquia"
  | "categorias"
  | "execucoes"
  | "falhas"
  | "exportacao"
  | "diagnostico";

export type FonteHierarquia = "hierarchy_level" | "current_suite";

export type CampoPadrao =
  | ""
  | "Atualizado"
  | "NomeTabela"
  | "LimparAntes"
  | "LimparHist"
  | "CriarCabecalho";

export type AzureConfiguracao = {
  organization: string;
  project: string;
  apiVersion: string;
};

export type PlanoConfiguracao = {
  id: string;
  planKey: string;
  planId: string;
  planName: string;
  suiteNameFilter: string;
  maxSuites: string;
  carregar: boolean;
};

export type NivelHierarquia = {
  id: string;
  ordem: number;
  coluna: string;
  nivelOrigem: string;
  fonte: FonteHierarquia;
  planKey: string;
  ativo: boolean;
};

export type CategoriaResponsabilidade = {
  id: string;
  categoria: string;
  responsabilidade: string;
};

export type CampoConfiguracao = {
  id: string;
  ordem: number;
  campo: string;
  ativo: boolean;
  principal: boolean;
  padrao: CampoPadrao;
  valor: string;
  ajuda: string;
};

export type ExportacaoConfiguracao = {
  tabelaExecucoes: string;
  tabelaFalhas: string;
  limparAntes: "SIM";
  criarCabecalho: "SIM";
  kpiPlanKey: string;
  frentesValidas: string[];
};

export type CentralConfiguracoes = {
  version: 1;
  updatedAt: string | null;
  azure: AzureConfiguracao;
  planos: PlanoConfiguracao[];
  hierarquia: NivelHierarquia[];
  categorias: CategoriaResponsabilidade[];
  execucoes: CampoConfiguracao[];
  falhas: CampoConfiguracao[];
  exportacao: ExportacaoConfiguracao;
};

export type Severity = "erro" | "pendente";

export type ConfigIssue = {
  section: SectionId;
  severity: Severity;
  message: string;
};

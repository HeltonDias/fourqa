import type { CampoConfiguracao, CentralConfiguracoes } from "./types";

type CampoSeed = [campo: string, ajuda: string, principal: boolean];

const EXECUCOES: CampoSeed[] = [
  ["PlanKey", "Fase lógica do plano. Separa relatórios e planejamento para os dados não se misturarem.", true],
  ["PlanId", "Número do plano no Azure DevOps. A coleta usa este identificador para buscar suítes e cenários.", false],
  ["PlanName", "Nome do plano como aparece no Azure. Serve de rótulo nas exportações.", true],
  ["Frente", "Agrupamento vindo da hierarquia, como um sistema ou uma frente de projeto.", true],
  ["Atalho", "Prefixo curto do processo, usado para localizar o item no menu.", false],
  ["Processo", "Nome do processo ou da suíte intermediária definido na hierarquia.", true],
  ["SuiteId", "Identificador da suíte folha no Azure.", false],
  ["SuiteName", "Nome da suíte em que o cenário está.", false],
  ["TestPointId", "Identificador do ponto de teste. É o cenário executável, distinto do caso de teste.", false],
  ["TestCaseId", "Identificador do caso de teste no Azure.", false],
  ["TestCaseTitle", "Título do caso de teste exibido nos relatórios.", true],
  ["Responsabilidade", "Área responsável. Nas execuções a planilha deixava este campo vazio; nas falhas ele vem da categoria.", false],
  ["TestCaseState", "Estado do work item do caso, como Design, QA ou Closed. Não é o resultado da execução.", false],
  ["TestPointState", "Estado do ponto: Passed, Failed, Blocked, Ready e os demais estados do Azure.", true],
  ["Outcome", "Resultado da última execução do ponto.", true],
  ["DateCompleted", "Data em que a última execução foi concluída.", false],
  ["RunBy", "Pessoa que registrou a última execução.", true],
  ["LastUpdatedDate", "Data da última atualização do resultado.", false],
  ["LastTestRunId", "Execução usada para ligar o cenário aos defeitos.", false],
  ["LastResultId", "Resultado usado nos indicadores e na associação com bugs.", false],
  ["TestCaseLink", "Link para abrir o caso de teste no Azure.", false],
  ["TestCaseTags", "Tags do caso. As frentes válidas são reconhecidas a partir delas.", false],
];

const FALHAS: CampoSeed[] = [
  ["PlanKey", "Fase do plano à qual o defeito está ligado.", true],
  ["PlanId", "Número do plano no Azure de onde o defeito foi coletado.", false],
  ["PlanName", "Nome do plano de origem.", false],
  ["Responsavel", "Área responsável, obtida pela categoria configurada nesta central.", true],
  ["Ambiente", "Ambiente do defeito, vindo do work item ou de uma tag.", true],
  ["Categoria", "Tipo da falha. Define a responsabilidade e entra nos indicadores de cliente, desenvolvimento e QA.", true],
  ["ID", "Número do bug no Azure DevOps.", true],
  ["Impacto", "Quantidade de cenários únicos afetados por este defeito. Não é o campo livre Impacto do work item.", true],
  ["Frente", "Sistemas encontrados nas tags do bug, limitados às frentes válidas.", true],
  ["Título", "Título do bug.", true],
  ["Status", "Estado do work item, como aberto ou fechado.", true],
  ["Criação", "Data de abertura do defeito.", false],
  ["Fechamento", "Data de fechamento, quando existir.", false],
  ["Links", "Endereço para abrir o bug no Azure.", false],
  ["Tags", "Tags do work item, inclusive as usadas para identificar a frente.", false],
];

function campos(grupo: "exec" | "falha", rows: CampoSeed[]): CampoConfiguracao[] {
  return rows.map(([campo, ajuda, principal], index) => ({
    id: `${grupo}-${index + 1}`,
    ordem: index + 1,
    campo,
    ativo: true,
    principal,
    padrao: "",
    valor: "",
    ajuda,
  }));
}

/** Exemplo documentado da planilha Config_Teste. Não é a coleta ativa do servidor. */
const SEED: CentralConfiguracoes = {
  version: 1,
  updatedAt: null,
  azure: {
    organization: "",
    project: "",
    apiVersion: "7.1",
  },
  planos: [
    {
      id: "plan-endtoend",
      planKey: "EndToEnd",
      planId: "86730",
      planName: "SIAS - Fase 2 - EndToEnd",
      suiteNameFilter: "",
      maxSuites: "0",
      carregar: true,
    },
  ],
  hierarquia: [
    { id: "nivel-1", ordem: 1, coluna: "Nivel1", nivelOrigem: "1", fonte: "hierarchy_level", planKey: "", ativo: false },
    { id: "nivel-2", ordem: 2, coluna: "Frente", nivelOrigem: "2", fonte: "hierarchy_level", planKey: "", ativo: true },
    { id: "nivel-3", ordem: 3, coluna: "Onda", nivelOrigem: "3", fonte: "hierarchy_level", planKey: "", ativo: true },
    { id: "nivel-4", ordem: 4, coluna: "Processo", nivelOrigem: "ULTIMO", fonte: "current_suite", planKey: "", ativo: false },
  ],
  categorias: [
    ["01. Dev. Backend", "Desenvolvimento Foursys"],
    ["02. Dev. Frontend", "Desenvolvimento Foursys"],
    ["03. Dev. Mobile", "Desenvolvimento Foursys"],
    ["04. Dev. Identidade Visual", "Desenvolvimento Foursys"],
    ["05. Change Request", "Cliente CVP"],
    ["06. Infraestrutura/Ambiente", "Cliente CVP"],
    ["07. Massa de Dados", "Cliente CVP"],
    ["08. Erro de Execução do QA", "QA Foursys"],
    ["09. Documentação", "Cliente CVP"],
    ["10. Outros", "Outros"],
  ].map(([categoria, responsabilidade], index) => ({
    id: `cat-${index + 1}`,
    categoria,
    responsabilidade,
  })),
  execucoes: campos("exec", EXECUCOES),
  falhas: campos("falha", FALHAS),
  exportacao: {
    tabelaExecucoes: "execucoes",
    tabelaFalhas: "falhas",
    limparAntes: "SIM",
    criarCabecalho: "SIM",
    kpiPlanKey: "EndToEnd",
    frentesValidas: ["GEATE", "GEDEV", "GEFEA", "GEFIS", "GEMCO", "GERORJ", "GERSA", "GESIN"],
  },
};

export function defaultConfig(): CentralConfiguracoes {
  return structuredClone(SEED);
}

export const PADROES = ["", "Atualizado", "NomeTabela", "LimparAntes", "LimparHist", "CriarCabecalho"] as const;

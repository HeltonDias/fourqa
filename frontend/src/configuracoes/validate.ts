import type { CentralConfiguracoes, ConfigIssue, SectionId } from "./types";
import { norm } from "./ops.ts";

const API_VERSION = /^\d+\.\d+(?:-preview(?:\.\d+)?)?$/;

function integerAtLeast(raw: string, min: number): boolean {
  if (!/^\d+$/.test(raw.trim())) return false;
  return Number(raw) >= min;
}

export function validate(config: CentralConfiguracoes): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const push = (section: SectionId, severity: ConfigIssue["severity"], message: string) => {
    issues.push({ section, severity, message });
  };

  if (!config.azure.organization.trim()) {
    push("azure", "pendente", "Informe a organização do Azure DevOps.");
  }
  if (!config.azure.project.trim()) {
    push("azure", "pendente", "Informe o projeto do Azure DevOps.");
  }
  if (!API_VERSION.test(config.azure.apiVersion.trim())) {
    push("azure", "erro", "A versão da API precisa seguir o formato 7.1 ou 7.1-preview.1.");
  }

  const planKeys = new Set<string>();
  if (!config.planos.some((plano) => plano.carregar)) {
    push("planos", "pendente", "Nenhum plano está marcado para coleta.");
  }
  for (const plano of config.planos) {
    const key = plano.planKey.trim();
    if (!key) {
      push("planos", "erro", "Todo plano precisa de um PlanKey.");
      continue;
    }
    if (planKeys.has(key)) push("planos", "erro", `O PlanKey ${key} está repetido.`);
    planKeys.add(key);
    if (plano.carregar && !integerAtLeast(plano.planId, 1)) {
      push("planos", "erro", `O plano ${key} precisa do identificador numérico do Azure.`);
    }
    if (plano.maxSuites.trim() && !integerAtLeast(plano.maxSuites, 0)) {
      push("planos", "erro", `O máximo de suítes de ${key} precisa ser um número inteiro.`);
    }
  }

  if (!config.hierarquia.some((nivel) => nivel.ativo)) {
    push(
      "hierarquia",
      "pendente",
      "Nenhum nível está ativo. A coleta pode detectar a árvore sozinha até a integração.",
    );
  }
  const ordens = new Set<string>();
  for (const nivel of config.hierarquia) {
    if (!nivel.coluna.trim()) push("hierarquia", "erro", "Todo nível precisa de um nome de coluna.");
    if (!Number.isInteger(nivel.ordem) || nivel.ordem < 1) {
      push("hierarquia", "erro", "A ordem do nível precisa ser um inteiro a partir de 1.");
    }
    if (nivel.fonte === "hierarchy_level" && !nivel.nivelOrigem.trim()) {
      push("hierarquia", "erro", `Informe o nível de origem de ${nivel.coluna || "um nível"}.`);
    }
    const scope = `${norm(nivel.planKey)}:${nivel.ordem}`;
    if (ordens.has(scope)) {
      push("hierarquia", "erro", "Há dois níveis com a mesma ordem no mesmo plano.");
    }
    ordens.add(scope);
  }

  if (config.categorias.length === 0) {
    push("categorias", "pendente", "Nenhuma categoria está relacionada a uma responsabilidade.");
  }
  const categorias = new Set<string>();
  for (const item of config.categorias) {
    if (!item.categoria.trim() || !item.responsabilidade.trim()) {
      push("categorias", "erro", "Categoria e responsabilidade são obrigatórias.");
      continue;
    }
    const key = norm(item.categoria);
    if (categorias.has(key)) push("categorias", "erro", `A categoria ${item.categoria} está repetida.`);
    categorias.add(key);
  }

  reviewCampos("execucoes", "de execução", config.execucoes, push);
  reviewCampos("falhas", "de falha", config.falhas, push);

  if (!config.exportacao.tabelaExecucoes.trim() || !config.exportacao.tabelaFalhas.trim()) {
    push("exportacao", "erro", "Informe o nome de destino das execuções e das falhas.");
  }
  if (config.exportacao.limparAntes !== "SIM" || config.exportacao.criarCabecalho !== "SIM") {
    push("exportacao", "erro", "Limpar antes e criar cabeçalho permanecem SIM.");
  }
  if (!config.exportacao.kpiPlanKey.trim()) {
    push("exportacao", "pendente", "Informe o PlanKey usado nos indicadores da visão geral.");
  } else if (!planKeys.has(config.exportacao.kpiPlanKey.trim())) {
    push("exportacao", "pendente", "O PlanKey dos indicadores não corresponde a um plano desta central.");
  }
  if (config.exportacao.frentesValidas.length === 0) {
    push("exportacao", "pendente", "Nenhuma frente válida. Os defeitos podem ficar sem sistema.");
  }

  return issues;
}

function reviewCampos(
  section: "execucoes" | "falhas",
  label: string,
  campos: CentralConfiguracoes["execucoes"],
  push: (section: SectionId, severity: ConfigIssue["severity"], message: string) => void,
) {
  if (!campos.some((campo) => campo.ativo)) {
    push(section, "pendente", `Nenhum campo ${label} está ativo.`);
  }
  const names = new Set<string>();
  for (const campo of campos) {
    const name = campo.campo.trim();
    if (!name) {
      push(section, "erro", "Todo campo precisa de um nome.");
      continue;
    }
    if (names.has(name)) push(section, "erro", `O campo ${name} está repetido.`);
    names.add(name);
  }
}

export function blocking(issues: ConfigIssue[]): ConfigIssue[] {
  return issues.filter((issue) => issue.severity === "erro");
}

export function sectionStatus(
  issues: ConfigIssue[],
  section: SectionId,
): "ok" | "pendente" | "erro" | null {
  if (section === "diagnostico") return null;
  const mine = issues.filter((issue) => issue.section === section);
  if (mine.some((issue) => issue.severity === "erro")) return "erro";
  if (mine.some((issue) => issue.severity === "pendente")) return "pendente";
  return "ok";
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "./util.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface AzureConfig {
  organization: string;
  project: string;
  apiVersion: string;
  /** Nunca logar nem serializar. */
  pat: string;
}

export interface PlanConfig {
  planKey: string;
  planId: number;
  planName: string;
  suiteNameFilter: string;
  maxSuites: number;
}

export interface HierarchyConfig {
  order: number;
  columnName: string;
  sourceLevel: string;
  active: boolean;
  /** Se definido, aplica só a este PlanKey. Caso contrário, fallback para planos sem config específica. */
  planKey?: string;
  sourceType: "hierarchy_level" | "current_suite";
}

export interface SyncConfig {
  azure: AzureConfig;
  plans: PlanConfig[];
  hierarchy: HierarchyConfig[];
  /** categoria normalizada -> responsabilidade */
  responsibilities: Map<string, string>;
  validFronts: string[];
  kpiPlanKey: string;
}

/** Erro de configuração: a mensagem é segura para exibir ao usuário (não contém segredos). */
export class SyncConfigError extends Error {
  constructor(
    message: string,
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = "SyncConfigError";
  }
}

/** Lê o .env da raiz a cada chamada, para o PAT poder ser colado sem reiniciar o servidor. */
function readEnvFile(): Map<string, string> {
  const out = new Map<string, string>();
  const file = path.join(rootDir, ".env");
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out.set(m[1], value);
  }
  return out;
}

/** Lê uma variável do ambiente ou do .env, sem lançar se o Azure não estiver configurado. */
export function envValue(name: string): string {
  return (process.env[name] ?? readEnvFile().get(name) ?? "").trim();
}

export function loadSyncConfig(): SyncConfig {
  const fileEnv = readEnvFile();
  const env = (name: string) => (process.env[name] ?? fileEnv.get(name) ?? "").trim();

  const missing = ["AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT"].filter((n) => !env(n));
  if (missing.length > 0) {
    throw new SyncConfigError(
      `Configuração do Azure DevOps incompleta: preencha ${missing.join(", ")} no arquivo .env (veja .env.example) e tente novamente.`,
      missing,
    );
  }

  const jsonEnv = <T>(name: string): T | undefined => {
    const value = env(name);
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new SyncConfigError(`A variável ${name} do .env não é um JSON válido (mantenha em uma única linha).`);
    }
  };
  const yes = (v: unknown) => ["sim", "s", "yes", "true", "1"].includes(normalize(v));

  for (const name of ["SYNC_LIMPAR_ANTES", "SYNC_CRIAR_CABECALHO"]) {
    if (env(name) && !yes(env(name))) {
      throw new SyncConfigError(`${name} precisa ser SIM: o app sempre substitui os dados anteriores, como o script.`);
    }
  }

  type EnvPlan = { PlanKey?: string; PlanId?: number | string; PlanName?: string; SuiteNameFilter?: string; MaxSuites?: number | string; Carregar?: string };
  const plans = (jsonEnv<EnvPlan[]>("SYNC_TEST_PLANS") ?? [])
    .map((p) => ({
      planKey: String(p.PlanKey ?? "").trim(),
      planId: Number(p.PlanId ?? 0),
      planName: String(p.PlanName ?? ""),
      suiteNameFilter: String(p.SuiteNameFilter ?? ""),
      maxSuites: Number(p.MaxSuites ?? 0) || 0,
      carregar: p.Carregar === undefined ? true : yes(p.Carregar),
    }))
    .filter((p) => p.carregar && p.planId > 0 && p.planKey)
    .map<PlanConfig>(({ planKey, planId, planName, suiteNameFilter, maxSuites }) => ({
      planKey,
      planId,
      planName,
      suiteNameFilter,
      maxSuites,
    }));
  if (plans.length === 0) throw new SyncConfigError('Nenhum Test Plan ativo em SYNC_TEST_PLANS (Carregar = "SIM").');

  type EnvHier = {
    PlanKey?: string;
    Ordem?: number | string;
    NomeColuna?: string;
    NivelOrigem?: number | string;
    Fonte?: string;
    Ativo?: string;
  };
  const parseSourceType = (raw: string | undefined): HierarchyConfig["sourceType"] => {
    const n = normalize(raw ?? "");
    if (n === "current_suite" || n === "suite_atual" || n === "folha") return "current_suite";
    return "hierarchy_level";
  };
  const hierarchy = (jsonEnv<EnvHier[]>("SYNC_HIERARQUIA_SUITES") ?? [])
    .map<HierarchyConfig>((h) => ({
      order: Number(h.Ordem ?? 0),
      columnName: String(h.NomeColuna ?? "").trim(),
      sourceLevel: String(h.NivelOrigem ?? "").trim(),
      active: yes(h.Ativo),
      planKey: String(h.PlanKey ?? "").trim() || undefined,
      sourceType: parseSourceType(h.Fonte),
    }))
    .filter((h) => h.order > 0 && h.columnName)
    .sort((a, b) => a.order - b.order);
  // Hierarquia no .env é override opcional. Sem ela, a árvore é detectada na sincronização.

  const responsibilities = new Map<string, string>();
  for (const [categoria, resp] of Object.entries(jsonEnv<Record<string, string>>("SYNC_RESPONSABILIDADES") ?? {})) {
    responsibilities.set(normalize(categoria), resp);
  }

  return {
    azure: {
      organization: env("AZURE_DEVOPS_ORG"),
      project: env("AZURE_DEVOPS_PROJECT"),
      apiVersion: env("AZURE_DEVOPS_API_VERSION") || "7.1",
      pat: env("AZURE_DEVOPS_PAT"),
    },
    plans,
    hierarchy,
    responsibilities,
    validFronts: env("SYNC_FRENTES_VALIDAS").split(",").map((s) => s.trim()).filter(Boolean),
    kpiPlanKey: env("SYNC_KPI_PLAN_KEY") || plans[0].planKey,
  };
}

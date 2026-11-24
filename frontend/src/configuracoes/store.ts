import { defaultConfig } from "./defaults.ts";
import type {
  CampoConfiguracao,
  CampoPadrao,
  CategoriaResponsabilidade,
  CentralConfiguracoes,
  FonteHierarquia,
  NivelHierarquia,
  PlanoConfiguracao,
} from "./types";

const KEY = "fourqa.central-configuracoes.v1";
const PADROES = new Set<CampoPadrao>(["", "Atualizado", "NomeTabela", "LimparAntes", "LimparHist", "CriarCabecalho"]);

type Memory = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Memory | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function padrao(value: unknown): CampoPadrao {
  return typeof value === "string" && PADROES.has(value as CampoPadrao) ? (value as CampoPadrao) : "";
}

function fonte(value: unknown): FonteHierarquia {
  return value === "current_suite" ? "current_suite" : "hierarchy_level";
}

function plano(value: unknown, index: number): PlanoConfiguracao | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PlanoConfiguracao>;
  return {
    id: text(row.id) || `plan-${index + 1}`,
    planKey: text(row.planKey),
    planId: text(row.planId),
    planName: text(row.planName),
    suiteNameFilter: text(row.suiteNameFilter),
    maxSuites: text(row.maxSuites) || "0",
    carregar: flag(row.carregar, true),
  };
}

function nivel(value: unknown, index: number): NivelHierarquia | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<NivelHierarquia>;
  const ordem = Number(row.ordem);
  return {
    id: text(row.id) || `nivel-${index + 1}`,
    ordem: Number.isInteger(ordem) && ordem > 0 ? ordem : index + 1,
    coluna: text(row.coluna),
    nivelOrigem: text(row.nivelOrigem),
    fonte: fonte(row.fonte),
    planKey: text(row.planKey),
    ativo: flag(row.ativo, true),
  };
}

function categoria(value: unknown, index: number): CategoriaResponsabilidade | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CategoriaResponsabilidade>;
  return {
    id: text(row.id) || `cat-${index + 1}`,
    categoria: text(row.categoria),
    responsabilidade: text(row.responsabilidade),
  };
}

function campo(value: unknown, index: number): CampoConfiguracao | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CampoConfiguracao>;
  const ordem = Number(row.ordem);
  return {
    id: text(row.id) || `campo-${index + 1}`,
    ordem: Number.isInteger(ordem) && ordem > 0 ? ordem : index + 1,
    campo: text(row.campo),
    ativo: flag(row.ativo, true),
    principal: flag(row.principal, false),
    padrao: padrao(row.padrao),
    valor: text(row.valor),
    ajuda: text(row.ajuda),
  };
}

function rows<T>(value: unknown, map: (item: unknown, index: number) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(map).filter((item): item is T => item !== null);
}

/** Monta só o contrato conhecido. Credencial e chaves extras não sobrevivem. */
export function sanitize(input: unknown): CentralConfiguracoes {
  const base = defaultConfig();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<CentralConfiguracoes>;
  const azure = raw.azure && typeof raw.azure === "object" ? raw.azure : base.azure;
  const exportacao = raw.exportacao && typeof raw.exportacao === "object" ? raw.exportacao : base.exportacao;
  const frentes = Array.isArray(exportacao.frentesValidas)
    ? [...new Set(exportacao.frentesValidas.map((item) => text(item).trim()).filter(Boolean))]
    : base.exportacao.frentesValidas;
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    azure: {
      organization: text(azure.organization).trim(),
      project: text(azure.project).trim(),
      apiVersion: text(azure.apiVersion).trim() || "7.1",
    },
    planos: rows(raw.planos, plano),
    hierarquia: rows(raw.hierarquia, nivel),
    categorias: rows(raw.categorias, categoria),
    execucoes: rows(raw.execucoes, campo),
    falhas: rows(raw.falhas, campo),
    exportacao: {
      tabelaExecucoes: text(exportacao.tabelaExecucoes).trim() || base.exportacao.tabelaExecucoes,
      tabelaFalhas: text(exportacao.tabelaFalhas).trim() || base.exportacao.tabelaFalhas,
      limparAntes: "SIM",
      criarCabecalho: "SIM",
      kpiPlanKey: text(exportacao.kpiPlanKey).trim(),
      frentesValidas: frentes,
    },
  };
}

export function loadConfig(storage: Memory | null = browserStorage()): CentralConfiguracoes {
  if (!storage) return defaultConfig();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return defaultConfig();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(
  config: CentralConfiguracoes,
  storage: Memory | null = browserStorage(),
): CentralConfiguracoes {
  const next = sanitize({ ...config, updatedAt: new Date().toISOString() });
  storage?.setItem(KEY, JSON.stringify(next));
  return next;
}

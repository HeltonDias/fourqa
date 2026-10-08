export type DimensionRole = "priority" | "front" | "process" | "subprocess" | "generic";

/** Dimensão de classificação detectada na árvore do Test Plan. Semântica só com confiança alta. */
export interface DetectedDimension {
  key: string;
  label: string;
  level: number;
  values: string[];
  role: DimensionRole;
  /** 0 a 1. Abaixo de 0.8 o rótulo permanece genérico, salvo override manual explícito. */
  confidence: number;
  visible: boolean;
}

export interface HierarchyOverride {
  columnName: string;
  sourceLevel: string;
  active: boolean;
}

export type DimensionSource =
  | { type: "hierarchy_level"; level: number }
  | { type: "current_suite" };

export interface DimensionDefinition {
  key: string;
  label: string;
  role: DimensionRole;
  source: DimensionSource;
}

export interface HierarchyConfigInput {
  order: number;
  columnName: string;
  sourceLevel: string;
  active: boolean;
  planKey?: string;
  sourceType: "hierarchy_level" | "current_suite";
}

export interface DimensionResolutionContext {
  pathNames: string[];
  currentSuiteName: string;
}

const PRIORITY_NAME = /^(prioridade\s*\d+|p\s*\d+)$/i;
function roleFromColumn(name: string): DimensionRole | null {
  const n = name.trim().toLowerCase();
  if (!n || n.startsWith("nvl") || n.startsWith("nivel") || n.startsWith("nível")) return null;
  if (n.includes("subprocess")) return "subprocess";
  if (n.includes("prior")) return "priority";
  if (n.includes("frente") || n === "front") return "front";
  if (n.includes("process")) return "process";
  return null;
}

function definitionKey(role: DimensionRole, columnName: string): string {
  if (role === "priority") return "priority";
  if (role === "front") return "front";
  if (role === "process") return "process";
  if (role === "subprocess") return "subprocess";
  const slug = columnName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `dim-${slug}` : `dim-${role}`;
}

function resolveSourceValue(context: DimensionResolutionContext, source: DimensionSource): string {
  if (source.type === "current_suite") return context.currentSuiteName.trim();
  const index = source.level - 1;
  if (index < 0 || index >= context.pathNames.length) return "";
  return context.pathNames[index]?.trim() ?? "";
}

/** Config explícita por PlanKey (env). Planos com entradas próprias não herdam entradas globais. */
export function dimensionDefinitionsForPlan(planKey: string, entries: HierarchyConfigInput[]): DimensionDefinition[] {
  const norm = (value: string) => value.trim().toLowerCase();
  const keyed = entries.filter((e) => e.active && e.planKey && norm(e.planKey) === norm(planKey));
  const chosen = keyed.length > 0 ? keyed : entries.filter((e) => e.active && !e.planKey?.trim());
  return chosen
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const label = entry.columnName.trim();
      const role = roleFromColumn(label) ?? "generic";
      const source: DimensionSource =
        entry.sourceType === "current_suite"
          ? { type: "current_suite" }
          : { type: "hierarchy_level", level: Math.max(1, Number(entry.sourceLevel) || 1) };
      return {
        key: definitionKey(role, label),
        label,
        role,
        source,
      };
    });
}

/**
 * Precedência: definição explícita → sugestão automática (por nível não reivindicado).
 * Configuração explícita pode usar a folha (hierarchy_level ou current_suite).
 */
export function resolveDimensionValues(
  context: DimensionResolutionContext,
  definitions: DimensionDefinition[],
  suggestions: DetectedDimension[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  const explicitLevels = new Set<number>();

  for (const def of definitions) {
    const value = resolveSourceValue(context, def.source);
    if (!value) continue;
    out[def.key] = value;
    if (def.source.type === "hierarchy_level") explicitLevels.add(def.source.level);
  }

  for (const dim of suggestions) {
    if (out[dim.key]) continue;
    if (explicitLevels.has(dim.level)) continue;
    const name = context.pathNames[dim.level - 1]?.trim();
    if (name) out[dim.key] = name;
  }

  return out;
}

export function buildDimensionCatalog(
  definitions: DimensionDefinition[],
  suggestions: DetectedDimension[],
  paths: DimensionResolutionContext[],
): DetectedDimension[] {
  const valuesByKey = new Map<string, Set<string>>();
  for (const path of paths) {
    const resolved = resolveDimensionValues(path, definitions, suggestions);
    for (const [key, value] of Object.entries(resolved)) {
      const set = valuesByKey.get(key) ?? new Set<string>();
      set.add(value);
      valuesByKey.set(key, set);
    }
  }

  const explicitKeys = new Set(definitions.map((d) => d.key));
  const explicitDims: DetectedDimension[] = definitions.map((def) => ({
    key: def.key,
    label: def.label,
    role: def.role,
    level: def.source.type === "hierarchy_level" ? def.source.level : 0,
    values: [...(valuesByKey.get(def.key) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    confidence: 1,
    visible: true,
  }));

  const suggestedDims = suggestions
    .filter((dim) => !explicitKeys.has(dim.key) && !explicitDims.some((e) => e.level === dim.level && dim.level > 0))
    .map((dim) => ({
      ...dim,
      values: [...(valuesByKey.get(dim.key) ?? dim.values)].sort((a, b) => a.localeCompare(b, "pt-BR")),
    }));

  return [...explicitDims, ...suggestedDims];
}

export function legacyRoleValue(
  role: DimensionRole,
  classificacao: Record<string, string>,
  definitions: DimensionDefinition[],
  catalog: DetectedDimension[],
): string {
  const keys: string[] = [];
  for (const def of definitions) {
    if (def.role === role) keys.push(def.key);
  }
  for (const dim of catalog) {
    if (dim.role === role) keys.push(dim.key);
  }
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = classificacao[key]?.trim();
    if (value) return value;
  }
  return "";
}

function labelFor(role: DimensionRole, level: number, columnName?: string): string {
  if (columnName && role !== "generic") return columnName;
  switch (role) {
    case "priority":
      return "Prioridade";
    case "front":
      return "Frente";
    case "process":
      return "Processo";
    case "subprocess":
      return "Subprocesso";
    default:
      return `Nível ${level}`;
  }
}

/**
 * Analisa os caminhos de suíte. O último nível (suíte folha) não vira dimensão:
 * ele é a própria suíte. Níveis acima só recebem nome semântico com confiança alta.
 * `knownFronts` é dica opcional do projeto, não uma lista universal.
 */
export function detectDimensions(
  paths: { ancestors: { name: string }[] }[],
  hints?: { knownFronts?: string[] },
): DetectedDimension[] {
  const byLevel = new Map<number, Set<string>>();
  for (const path of paths) {
    const nodes = path.ancestors;
    nodes.forEach((node, index) => {
      const isLeaf = index === nodes.length - 1;
      if (isLeaf && nodes.length > 1) return;
      const name = node.name.trim();
      if (!name) return;
      const level = index + 1;
      const set = byLevel.get(level) ?? new Set<string>();
      set.add(name);
      byLevel.set(level, set);
    });
  }

  const fronts = new Set((hints?.knownFronts ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));
  const found: DetectedDimension[] = [];

  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const values = [...(byLevel.get(level) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (values.length === 0) continue;

    const priorityRatio = values.filter((v) => PRIORITY_NAME.test(v.trim())).length / values.length;
    const frontRatio = fronts.size
      ? values.filter((v) => {
          const up = v.trim().toUpperCase();
          if (fronts.has(up)) return true;
          return [...fronts].some((f) => up.split(/[^A-Z0-9]+/).includes(f));
        }).length / values.length
      : 0;

    let role: DimensionRole = "generic";
    let confidence = 0.2;
    if (priorityRatio >= 0.7) {
      role = "priority";
      confidence = 0.9;
    } else if (frontRatio >= 0.7) {
      role = "front";
      confidence = 0.85;
    }

    found.push({
      key: role === "generic" ? `nivel-${level}` : role,
      label: labelFor(role, level),
      level,
      values,
      role,
      confidence,
      visible: true,
    });
  }

  const seen = new Map<string, number>();
  return found.map((d) => {
    const n = (seen.get(d.key) ?? 0) + 1;
    seen.set(d.key, n);
    return n === 1 ? d : { ...d, key: `${d.key}-${d.level}` };
  });
}

/**
 * Precedência: override manual > detecção automática > rótulo genérico.
 * Um nível configurado pelo usuário vence mesmo com confiança 1.
 */
export function applyHierarchyOverrides(
  dims: DetectedDimension[],
  overrides: HierarchyOverride[],
): DetectedDimension[] {
  return dims.map((dim) => {
    const manual = overrides.find((h) => h.active && String(h.sourceLevel) === String(dim.level));
    if (!manual) return dim;
    const role = roleFromColumn(manual.columnName);
    if (!role) {
      return { ...dim, label: manual.columnName.trim() || dim.label, confidence: 1 };
    }
    return {
      ...dim,
      role,
      key: role,
      label: labelFor(role, dim.level, manual.columnName.trim()),
      confidence: 1,
      visible: true,
    };
  });
}

/** Compatibilidade: resolve só a partir do catálogo detectado (nível = índice na path). */
export function valuesForPath(
  ancestors: { name: string }[],
  dims: DetectedDimension[],
): Record<string, string> {
  const pathNames = ancestors.map((a) => a.name);
  const leaf = pathNames[pathNames.length - 1] ?? "";
  return resolveDimensionValues({ pathNames, currentSuiteName: leaf }, [], dims);
}

/** Catálogo para dados já gravados, quando o sync ainda não persistiu `dimensoes_catalog`. */
export function inferDimensions(
  rows: { frente?: string | null; dimensions_json?: string | null }[],
): DetectedDimension[] {
  const fromJson = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.dimensions_json) continue;
    try {
      const parsed = JSON.parse(row.dimensions_json) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "string" || !value.trim()) continue;
        const set = fromJson.get(key) ?? new Set<string>();
        set.add(value.trim());
        fromJson.set(key, set);
      }
    } catch {
      /* linha legada ou JSON inválido: ignora e cai no fallback */
    }
  }

  if (fromJson.size > 0) {
    return [...fromJson.entries()].map(([key, set]) => {
      const level = Number(key.match(/(\d+)$/)?.[1] ?? 1);
      const role: DimensionRole = key.startsWith("priority")
        ? "priority"
        : key.startsWith("front")
          ? "front"
          : key.startsWith("process")
            ? "process"
            : key.startsWith("subprocess")
              ? "subprocess"
              : "generic";
      return {
        key,
        label: labelFor(role, level),
        level,
        values: [...set].sort((a, b) => a.localeCompare(b, "pt-BR")),
        role,
        confidence: role === "generic" ? 0.2 : 0.9,
        visible: true,
      };
    });
  }

  const values = [...new Set(rows.map((r) => (r.frente ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  if (values.length === 0) return [];
  const priorityRatio = values.filter((v) => PRIORITY_NAME.test(v)).length / values.length;
  if (priorityRatio >= 0.7) {
    return [
      {
        key: "priority",
        label: "Prioridade",
        level: 1,
        values,
        role: "priority",
        confidence: 0.9,
        visible: true,
      },
    ];
  }
  return [
    {
      key: "nivel-1",
      label: "Nível 1",
      level: 1,
      values,
      role: "generic",
      confidence: 0.2,
      visible: true,
    },
  ];
}

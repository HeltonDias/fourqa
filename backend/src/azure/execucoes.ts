import { persistTimestamp } from "../domain/dates.js";
import {
  buildDimensionCatalog,
  detectDimensions,
  dimensionDefinitionsForPlan,
  legacyRoleValue,
  resolveDimensionValues,
  type DetectedDimension,
  type DimensionDefinition,
} from "../domain/dimensions.js";
import type { ExecucaoRow } from "../types.js";
import type { AzureClient } from "./client.js";
import type { HierarchyConfig, PlanConfig } from "./config.js";
import type { AzureList, IdentityRef, ShallowReference, TestPoint, TestSuite } from "./types.js";
import { emptyToNull, mapInBatches, normalize, type ProgressReporter } from "./util.js";

/** Porta de atualizar_Execucoes_Azure.ts (EX_*). */

const SUITE_CONCURRENCY = 4;
const POINTS_PAGE = 1000;

export type ExecucaoInsert = Omit<ExecucaoRow, "id">;

export interface PlanExecutions {
  plan: PlanConfig;
  rows: ExecucaoInsert[];
  suitesProcessed: number;
  /** Todos os nós da árvore (não só folhas), para validar pai/filho. */
  suites: { suiteId: number; parentSuiteId: number | null }[];
  dimensions: DetectedDimension[];
}

interface SuitePath {
  suite: TestSuite;
  path: TestSuite[];
}

function flattenSuiteTree(roots: TestSuite[]): SuitePath[] {
  const out: SuitePath[] = [];
  const walk = (suite: TestSuite, parent: TestSuite[]) => {
    const current = [...parent, suite];
    out.push({ suite, path: current });
    for (const child of suite.children ?? []) walk(child, current);
  };
  // A Root Suite do plano não entra na hierarquia: começamos pelos filhos dela.
  for (const root of roots) {
    const children = root.children ?? [];
    if (children.length === 0) {
      walk(root, []);
      continue;
    }
    for (const child of children) walk(child, []);
  }
  return out;
}

function extractAtalho(suiteName: string): string {
  const text = suiteName.trim();
  if (!text) return "";
  const idx = text.indexOf(" - ");
  return idx < 0 ? text : text.substring(0, idx).trim();
}

function identityToText(v: IdentityRef | undefined): string {
  return v ? String(v.displayName ?? v.uniqueName ?? "") : "";
}

function referenceId(v: ShallowReference | undefined): number | null {
  if (!v || v.id === undefined || v.id === null) return null;
  const n = Number(v.id);
  return Number.isFinite(n) ? n : null;
}

function valueToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}

function workItemProperty(point: TestPoint, referenceName: string): unknown {
  const expected = normalize(referenceName);
  for (const prop of point.workItemProperties ?? []) {
    const item = prop.workItem;
    if (item && normalize(item.key ?? "") === expected) return item.value;
  }
  return "";
}

async function getSuiteTree(client: AzureClient, planId: number): Promise<TestSuite[]> {
  const data = await client.get<AzureList<TestSuite>>(
    client.url(`/_apis/testplan/Plans/${planId}/suites`, { asTreeView: true }),
  );
  return data.value ?? [];
}

async function getTestPoints(client: AzureClient, planId: number, suiteId: number): Promise<TestPoint[]> {
  const all: TestPoint[] = [];
  for (let skip = 0; ; skip += POINTS_PAGE) {
    const data = await client.get<AzureList<TestPoint>>(
      client.url(`/_apis/test/Plans/${planId}/Suites/${suiteId}/points`, {
        witFields: "System.Title,System.State,System.Tags",
        includePointDetails: true,
        $skip: skip,
        $top: POINTS_PAGE,
      }),
    );
    const page = data.value ?? [];
    all.push(...page);
    if (page.length < POINTS_PAGE) break;
  }
  return all;
}

function buildRecord(
  client: AzureClient,
  plan: PlanConfig,
  definitions: DimensionDefinition[],
  catalog: DetectedDimension[],
  suggestions: DetectedDimension[],
  sp: SuitePath,
  point: TestPoint,
): ExecucaoInsert {
  const pathNames = sp.path.map((s) => String(s.name ?? "").trim());
  const leaf = sp.path[sp.path.length - 1];
  const parent = sp.path.length >= 2 ? sp.path[sp.path.length - 2] : undefined;
  const suiteName = String(leaf?.name ?? "").trim();
  const classificacao = resolveDimensionValues({ pathNames, currentSuiteName: suiteName }, definitions, suggestions);
  const frenteValue = legacyRoleValue("front", classificacao, definitions, catalog);
  const processoValue = legacyRoleValue("process", classificacao, definitions, catalog);
  const testCaseId = Number(point.testCase?.id ?? 0);
  const webUrl = String(point.testCase?.webUrl ?? "").trim();
  const suitePath = sp.path.map((s, index) => ({
    suiteId: Number(s.id ?? 0),
    name: String(s.name ?? ""),
    parentSuiteId: index === 0 ? null : Number(sp.path[index - 1]?.id ?? 0) || null,
    depth: index + 1,
  }));

  return {
    plan_key: plan.planKey,
    plan_id: plan.planId,
    plan_name: emptyToNull(plan.planName),
    frente: emptyToNull(frenteValue),
    atalho: emptyToNull(extractAtalho(suiteName)),
    processo: emptyToNull(processoValue),
    suite_id: Number(leaf?.id ?? 0) || null,
    suite_name: emptyToNull(suiteName),
    parent_suite_id: Number(parent?.id ?? 0) || null,
    suite_depth: sp.path.length,
    suite_path: JSON.stringify(suitePath),
    dimensions_json: JSON.stringify(classificacao),
    test_point_id: Number(point.id ?? 0) || null,
    test_case_id: testCaseId || null,
    test_case_title: emptyToNull(valueToText(workItemProperty(point, "System.Title") ?? point.testCase?.name ?? "")),
    // Mantém vazio: Tags não definem responsabilidade (igual ao script).
    responsabilidade: null,
    test_case_state: emptyToNull(valueToText(workItemProperty(point, "System.State"))),
    test_point_state: emptyToNull(String(point.state ?? "")),
    outcome: emptyToNull(String(point.outcome ?? "")),
    date_completed: emptyToNull(persistTimestamp(point.lastResultDetails?.dateCompleted ?? "")),
    run_by: emptyToNull(identityToText(point.lastResultDetails?.runBy)),
    last_updated_date: emptyToNull(persistTimestamp(point.lastUpdatedDate ?? "")),
    last_test_run_id: referenceId(point.lastTestRun),
    last_result_id: referenceId(point.lastResult),
    test_case_link: emptyToNull(webUrl || (testCaseId ? client.workItemLink(testCaseId) : "")),
    test_case_tags: emptyToNull(valueToText(workItemProperty(point, "System.Tags"))),
  };
}

export async function loadPlanExecutions(
  client: AzureClient,
  plan: PlanConfig,
  hierarchy: HierarchyConfig[],
  report: ProgressReporter,
  knownFronts: string[] = [],
): Promise<PlanExecutions> {
  report(`Execuções (${plan.planKey}): lendo árvore de suítes`);
  const tree = await getSuiteTree(client, plan.planId);
  const all = flattenSuiteTree(tree);

  // Pontos só nas folhas: não assume que nível 1 é Frente nem que nível 2 é Processo.
  let suites = all.filter((s) => (s.suite.children ?? []).length === 0);
  if (plan.suiteNameFilter.trim()) {
    const filter = normalize(plan.suiteNameFilter);
    suites = suites.filter((s) => normalize(s.suite.name ?? "").includes(filter));
  }
  if (plan.maxSuites > 0) suites = suites.slice(0, plan.maxSuites);

  const pathContexts = suites.map((s) => {
    const pathNames = s.path.map((n) => String(n.name ?? "").trim());
    const currentSuiteName = pathNames[pathNames.length - 1] ?? "";
    return { pathNames, currentSuiteName };
  });
  const suggestions = detectDimensions(
    suites.map((s) => ({ ancestors: s.path.map((n) => ({ name: String(n.name ?? "") })) })),
    { knownFronts },
  );
  const definitions = dimensionDefinitionsForPlan(plan.planKey, hierarchy);
  const dimensions = buildDimensionCatalog(definitions, suggestions, pathContexts);

  const perSuite = await mapInBatches(
    suites,
    SUITE_CONCURRENCY,
    async (sp) => {
      const suiteId = Number(sp.suite.id ?? 0);
      if (!suiteId) return [] as ExecucaoInsert[];
      const points = await getTestPoints(client, plan.planId, suiteId);
      return points.map((p) => buildRecord(client, plan, definitions, dimensions, suggestions, sp, p));
    },
    (done, total) => report(`Execuções (${plan.planKey}): suítes`, done, total),
  );

  return {
    plan,
    rows: perSuite.flat(),
    suitesProcessed: suites.length,
    suites: all
      .map((s) => ({
        suiteId: Number(s.suite.id ?? 0),
        parentSuiteId: s.path.length >= 2 ? Number(s.path[s.path.length - 2]?.id ?? 0) || null : null,
      }))
      .filter((s) => s.suiteId > 0),
    dimensions,
  };
}

import { persistTimestamp } from "../domain/dates.js";
import type { FalhaRow } from "../types.js";
import type { AzureClient } from "./client.js";
import type { PlanConfig, SyncConfig } from "./config.js";
import type { AzureList, TestResult, TestRun, WorkItem, WorkItemFieldDefinition } from "./types.js";
import { emptyToNull, mapInBatches, normalize, type ProgressReporter } from "./util.js";

/** Porta de atualizar_Falhas_Azure.ts (FL_*). */

const RUN_CONCURRENCY = 5;
const WORK_ITEM_BATCH_SIZE = 200;
const RUNS_PAGE = 1000;
const RESULTS_PAGE = 200;

export type FalhaInsert = Omit<FalhaRow, "id">;

/** Metadados de cada Bug usados na classificação dos KPIs da Home. */
export interface BugMeta {
  bugId: number;
  responsavel: string;
  status: string;
  criacaoMs: number;
}

export interface PlanFalhas {
  plan: PlanConfig;
  rows: FalhaInsert[];
  bugMeta: Map<number, BugMeta>;
  runCount: number;
  resultCount: number;
}

async function getRuns(client: AzureClient, planId: number): Promise<TestRun[]> {
  const all: TestRun[] = [];
  for (let skip = 0; ; skip += RUNS_PAGE) {
    const data = await client.get<AzureList<TestRun>>(
      client.url("/_apis/test/runs", { planId, $top: RUNS_PAGE, $skip: skip }),
    );
    const page = data.value ?? [];
    all.push(...page);
    if (page.length < RUNS_PAGE) break;
  }
  return all;
}

/** Resultados de um Run com bugs associados (também usado pelo KPI da Home). */
export async function getRunResultsWithBugs(client: AzureClient, runId: number): Promise<TestResult[]> {
  const all: TestResult[] = [];
  for (let skip = 0; ; skip += RESULTS_PAGE) {
    const data = await client.get<AzureList<TestResult>>(
      client.url(`/_apis/test/Runs/${runId}/results`, {
        detailsToInclude: "WorkItems,Point",
        $top: RESULTS_PAGE,
        $skip: skip,
      }),
    );
    const page = data.value ?? [];
    all.push(...page);
    if (page.length < RESULTS_PAGE) break;
  }
  return all;
}

function resultBelongsToPlan(result: TestResult, planId: number): boolean {
  const resultPlanId = Number(result.testPlan?.id ?? 0);
  return resultPlanId > 0 ? resultPlanId === planId : true;
}

function buildScenarioKey(result: TestResult, planId: number): string {
  const pointId = Number(result.testPoint?.id ?? 0);
  if (pointId > 0) return `PLAN:${planId}|POINT:${pointId}`;
  const suiteId = Number(result.testSuite?.id ?? 0);
  const testCaseId = Number(result.testCase?.id ?? 0);
  const configId = Number(result.configuration?.id ?? 0);
  if (suiteId > 0 && testCaseId > 0) return `PLAN:${planId}|SUITE:${suiteId}|TC:${testCaseId}|CONFIG:${configId}`;
  if (testCaseId > 0) return `PLAN:${planId}|TC:${testCaseId}`;
  return "";
}

async function collectBugImpacts(
  client: AzureClient,
  plan: PlanConfig,
  report: ProgressReporter,
): Promise<{ impacts: Map<number, Set<string>>; runCount: number; resultCount: number }> {
  const runs = await getRuns(client, plan.planId);
  const impacts = new Map<number, Set<string>>();
  let resultCount = 0;

  const runIds = runs.map((r) => Number(r.id ?? 0)).filter((id) => id > 0);
  const batches = await mapInBatches(
    runIds,
    RUN_CONCURRENCY,
    (runId) => getRunResultsWithBugs(client, runId),
    (done, total) => report(`Falhas (${plan.planKey}): runs`, done, total),
  );

  for (const results of batches) {
    resultCount += results.length;
    for (const result of results) {
      if (!resultBelongsToPlan(result, plan.planId)) continue;
      const bugs = result.associatedBugs ?? [];
      if (bugs.length === 0) continue;
      const scenarioKey = buildScenarioKey(result, plan.planId);
      if (!scenarioKey) continue;
      for (const bug of bugs) {
        const bugId = Number(bug.id ?? 0);
        if (!bugId) continue;
        let set = impacts.get(bugId);
        if (!set) impacts.set(bugId, (set = new Set<string>()));
        set.add(scenarioKey);
      }
    }
  }
  return { impacts, runCount: runs.length, resultCount };
}

function findFieldReference(defs: WorkItemFieldDefinition[], aliases: string[]): string {
  const wanted = aliases.map(normalize);
  for (const field of defs) {
    const name = normalize(field.name ?? "");
    const ref = normalize(field.referenceName ?? "");
    for (const alias of wanted) {
      if (name === alias || ref === alias || ref.endsWith(`.${alias}`)) return String(field.referenceName ?? "");
    }
  }
  return "";
}

async function getWorkItemsBatch(client: AzureClient, ids: number[], fields: string[]): Promise<WorkItem[]> {
  const all: WorkItem[] = [];
  for (let start = 0; start < ids.length; start += WORK_ITEM_BATCH_SIZE) {
    const batchIds = ids.slice(start, start + WORK_ITEM_BATCH_SIZE);
    const data = await client.post<AzureList<WorkItem>>(client.url("/_apis/wit/workitemsbatch"), {
      ids: batchIds,
      fields,
      errorPolicy: "Omit",
    });
    all.push(...(data.value ?? []));
  }
  return all;
}

function formatAzureDate(value: unknown): string {
  return persistTimestamp(value);
}

function frontsFromTags(tags: string, validFronts: string[]): string {
  if (!tags.trim()) return "";
  const found = new Set<string>();
  for (const tag of tags.split(";")) {
    const n = normalize(tag);
    const front = validFronts.find((f) => normalize(f) === n);
    if (front) found.add(front);
  }
  const order = new Map(validFronts.map((f, i) => [f, i]));
  return [...found]
    .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b))
    .join(" | ");
}

function resolveEnvironment(source: Record<string, unknown>, environmentField: string, tags: string): string {
  if (environmentField) {
    const direct = String(source[environmentField] ?? "").trim();
    if (direct) return direct;
  }
  return normalize(tags).includes(normalize("V3Online")) ? "V3" : "";
}

function parseDateMs(value: unknown): number {
  const ms = Date.parse(String(value ?? ""));
  return Number.isNaN(ms) ? 0 : ms;
}

export async function loadFalhas(client: AzureClient, cfg: SyncConfig, report: ProgressReporter): Promise<PlanFalhas[]> {
  const loads: Array<{ plan: PlanConfig; impacts: Map<number, Set<string>>; runCount: number; resultCount: number }> = [];
  for (const plan of cfg.plans) {
    loads.push({ plan, ...(await collectBugImpacts(client, plan, report)) });
  }

  const bugIds = [...new Set(loads.flatMap((l) => [...l.impacts.keys()]))].sort((a, b) => a - b);

  report("Falhas: lendo definição dos campos do Azure");
  const defs = (await client.get<AzureList<WorkItemFieldDefinition>>(client.url("/_apis/wit/fields"))).value ?? [];
  const categoryField = findFieldReference(defs, ["Categoria da Falha", "Categoria Falha"]);
  const environmentField = findFieldReference(defs, ["Ambiente", "Environment"]);

  const witFields = new Set<string>([
    "System.WorkItemType",
    "System.Title",
    "System.State",
    "System.CreatedDate",
    "System.CreatedBy",
    "System.AssignedTo",
    "System.Tags",
    "Microsoft.VSTS.Common.ClosedDate",
  ]);
  if (categoryField) witFields.add(categoryField);
  if (environmentField) witFields.add(environmentField);

  report(`Falhas: lendo ${bugIds.length} bugs`);
  const workItems = await getWorkItemsBatch(client, bugIds, [...witFields]);
  const byId = new Map<number, WorkItem>();
  for (const wi of workItems) if (wi.id) byId.set(Number(wi.id), wi);

  return loads.map(({ plan, impacts, runCount, resultCount }) => {
    const rows: FalhaInsert[] = [];
    const bugMeta = new Map<number, BugMeta>();

    for (const bugId of [...impacts.keys()].sort((a, b) => b - a)) {
      const source = byId.get(bugId)?.fields;
      if (!source) continue;
      if (normalize(source["System.WorkItemType"] ?? "") !== normalize("Bug")) continue;

      const tags = String(source["System.Tags"] ?? "").trim();
      const category = categoryField ? String(source[categoryField] ?? "").trim() : "";
      const responsavel = cfg.responsibilities.get(normalize(category)) ?? "";
      const status = String(source["System.State"] ?? "");

      rows.push({
        plan_key: plan.planKey,
        responsavel: emptyToNull(responsavel),
        ambiente: emptyToNull(resolveEnvironment(source, environmentField, tags)),
        categoria: emptyToNull(category),
        bug_id: bugId,
        impacto: impacts.get(bugId)?.size ?? 0,
        frente: emptyToNull(frontsFromTags(tags, cfg.validFronts)),
        titulo: emptyToNull(String(source["System.Title"] ?? "")),
        status: emptyToNull(status),
        criacao: emptyToNull(formatAzureDate(source["System.CreatedDate"])),
        fechamento: emptyToNull(formatAzureDate(source["Microsoft.VSTS.Common.ClosedDate"])),
        links: client.workItemLink(bugId),
        tags: emptyToNull(tags),
      });
      bugMeta.set(bugId, { bugId, responsavel, status, criacaoMs: parseDateMs(source["System.CreatedDate"]) });
    }
    return { plan, rows, bugMeta, runCount, resultCount };
  });
}

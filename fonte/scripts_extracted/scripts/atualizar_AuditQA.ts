/*
 * AUDIT QA - ATUALIZAÇÃO COMPLETA - V10
 *
 * Ajustes técnicos V10 (sem alteração das regras de negócio):
 * - Confirma Bug realmente vinculado ao Run/Result pelo endpoint específico de WorkItems
 *   antes de gerar BUG001/PAR003 por ausência de associação.
 * - Evita falso PAR003 quando o Azure mostra o Bug em "Linked work items" mas a listagem
 *   de resultados ainda não retornou associatedBugs atualizado.
 * - Em falha de qualquer etapa, marca Auditoria_Config como DESATUALIZADA e preserva
 *   a última auditoria apenas como histórico, além de exibir o erro real no log.
 *
 * Regras consolidadas mantidas:
 * - Mantém todas as regras já confirmadas de Status/Outcome, terminalidade UAT,
 *   mapeamento, título e evidências.
 * - BUG de desenvolvimento: valida no EndToEnd se BUG + Failed/Blocked possui
 *   Bug associado ao Run/Result atual. Não exige reflexo automático no UAT.
 * - Bugs de Massa/Infraestrutura: são os únicos Bugs que exigem reflexo entre
 *   EndToEnd e UAT; o mesmo Bug deve estar associado aos dois lados.
 * - Cenários impactados por Bug de Massa/Infraestrutura devem estar
 *   Pendências + Failed/Blocked nos dois planos.
 * - Bugs de Massa/Infraestrutura devem estar em AssignedTo =
 *   Edson Kiyoshi Sato ou Diego Garcia Africa. Diego é válido; Edson é preferência.
 * - Bug Closed + execução ainda Failed/Blocked continua sendo inconsistência
 *   quando todos os Bugs do resultado atual estão Closed.
 * - Achados são agregados por cenário/mapeamento e passam por deduplicação
 *   exata antes da gravação, evitando multiplicar apontamentos por Bug.
 *
 * AUDIT QA - ATUALIZAÇÃO COMPLETA
 *
 * Ordem de execução:
 * 1) Atualiza Controle de Falhas no Azure
 * 2) Atualiza Controle de Execuções no Azure
 * 3) Regera a Audit QA
 *
 * O script para imediatamente se qualquer etapa falhar, evitando
 * gerar auditoria com bases parcialmente atualizadas.
 */

interface PQ_ResultTrace {
  planId: number;
  planKey: string;
  runId: number;
  resultId: number;
  testPointId: number;
  testCaseId: number;
  suiteId: number;
  bugIds: number[];
}

const PQ_RESULT_TRACES = new Map<string, PQ_ResultTrace>();
const PQ_BUG_STATES = new Map<number, string>();
const PQ_BUG_ASSIGNEES = new Map<number, string>();
const PQ_BUG_CATEGORIES = new Map<number, string>();

/*
 * Cache de confirmação autoritativa dos Work Items realmente vinculados ao
 * Run/Result atual. A API de lista de resultados pode não refletir imediatamente
 * todos os vínculos exibidos na tela "Linked work items" do Test Plans.
 * Quando uma regra iria gerar um falso positivo por ausência de associação, o
 * Audit QA confirma o vínculo pelo endpoint específico de WorkItems do resultado.
 */
interface PQ_ResultWorkItemRef {
  id?: string | number;
  name?: string;
  type?: string;
  url?: string;
  webUrl?: string;
}

const PQ_AUTHORITATIVE_RESULT_BUGS = new Map<string, number[]>();
let PQ_BUG_CATEGORY_FIELD_REF = "";

/*
 * Responsáveis válidos somente para Bugs de Massa/Infraestrutura.
 * Diego é válido. Edson é a preferência operacional, mas a preferência
 * não gera achado por si só.
 */
const PQ_ALLOWED_MASS_INFRA_ASSIGNEES = [
  "Edson Kiyoshi Sato",
  "Diego Garcia Africa"
];

// Cria uma chave única Plan + Run + Result para os caches de rastreabilidade.
function PQ_resultTraceKey(planId: number, runId: number, resultId: number): string {
  return `${planId}|${runId}|${resultId}`;
}

// Limpa os caches temporários antes de iniciar uma nova atualização completa.
function PQ_resetTransientCaches(): void {
  PQ_RESULT_TRACES.clear();
  PQ_BUG_STATES.clear();
  PQ_BUG_ASSIGNEES.clear();
  PQ_BUG_CATEGORIES.clear();
  PQ_AUTHORITATIVE_RESULT_BUGS.clear();
  PQ_BUG_CATEGORY_FIELD_REF = "";
}

// Identifica se a categoria do Bug pertence a Massa ou Infraestrutura.
function PQ_isMassOrInfrastructureCategory(value: string): boolean {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return (
    normalized === "massa" ||
    normalized.includes("massa") ||
    normalized === "infra" ||
    normalized === "infraestrutura" ||
    normalized.includes("infraestrutura")
  );
}

// Obtém a rastreabilidade do último Run/Result associado ao cenário.
function PQ_currentTrace(row: AU_ExecRecord): PQ_ResultTrace | undefined {
  if (
    row.planId <= 0 ||
    row.lastTestRunId <= 0 ||
    row.lastResultId <= 0
  ) {
    return undefined;
  }

  return PQ_RESULT_TRACES.get(
    PQ_resultTraceKey(
      row.planId,
      row.lastTestRunId,
      row.lastResultId
    )
  );
}

// Converte erros desconhecidos em uma mensagem detalhada para log.
function PQ_formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    try {
      const obj = error as {
        message?: unknown;
        code?: unknown;
        name?: unknown;
        type?: unknown;
        method?: unknown;
        line?: unknown;
        status?: unknown;
        statusCode?: unknown;
      };

      const parts: string[] = [];
      const push = (label: string, value: unknown): void => {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          parts.push(`${label}=${String(value)}`);
        }
      };

      push("message", obj.message);
      push("code", obj.code);
      push("name", obj.name);
      push("type", obj.type);
      push("method", obj.method);
      push("line", obj.line);
      push("status", obj.status);
      push("statusCode", obj.statusCode);

      if (parts.length > 0) {
        return parts.join("; ");
      }

      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    } catch {
      return String(error);
    }
  }

  return String(error);
}

// Monta a URL base usada nas consultas de Test Results do Azure.
function PQ_testResultsBaseUrl(azure: FL_AzureConfig): string {
  return (
    `https://vstmr.dev.azure.com/` +
    `${encodeURIComponent(azure.organization)}/` +
    `${encodeURIComponent(azure.project)}`
  );
}

// Confirma no Azure os Bugs realmente vinculados ao Run/Result atual.
async function PQ_loadAuthoritativeBugIds(
  workbook: ExcelScript.Workbook,
  row: AU_ExecRecord
): Promise<number[]> {
  if (
    row.planId <= 0 ||
    row.lastTestRunId <= 0 ||
    row.lastResultId <= 0
  ) {
    return [];
  }

  const key = PQ_resultTraceKey(
    row.planId,
    row.lastTestRunId,
    row.lastResultId
  );

  const cached = PQ_AUTHORITATIVE_RESULT_BUGS.get(key);
  if (cached) {
    return cached.slice();
  }

  const azure = FL_readAzureConfig(
    FL_getRequiredTable(workbook, "tbScriptAzureDevOps")
  );
  const authorization = FL_buildAuthorization(azure.pat);

  const url =
    `${PQ_testResultsBaseUrl(azure)}` +
    `/_apis/testresults/runs/${row.lastTestRunId}` +
    `/results/${row.lastResultId}/workitems` +
    `?api-version=7.1-preview.2`;

  const data = await FL_azureGet<
    PQ_ResultWorkItemRef[] | FL_AzureListResponse<PQ_ResultWorkItemRef>
  >(url, authorization);

  const refs: PQ_ResultWorkItemRef[] = Array.isArray(data)
    ? data
    : Array.isArray(data.value)
      ? data.value
      : [];

  const bugIds = Array.from(
    new Set(
      refs
        .filter((item) => AU_normalizeText(String(item.type ?? "")) === "bug")
        .map((item) => Number(item.id ?? 0))
        .filter((id) => id > 0)
    )
  ).sort((a, b) => a - b);

  PQ_AUTHORITATIVE_RESULT_BUGS.set(key, bugIds);

  const trace = PQ_RESULT_TRACES.get(key);
  if (trace) {
    trace.bugIds = Array.from(new Set(trace.bugIds.concat(bugIds))).sort((a, b) => a - b);
  }

  await PQ_ensureBugMetadata(workbook, bugIds, azure, authorization);

  console.log(
    `Audit QA - confirmação de vínculo ${row.planKey}/${row.testCaseId} ` +
    `Run ${row.lastTestRunId}/Result ${row.lastResultId}: ` +
    `${bugIds.length > 0 ? bugIds.join(" | ") : "nenhum Bug vinculado"}.`
  );

  return bugIds.slice();
}

// Carrega metadados faltantes dos Bugs usados nas regras da auditoria.
async function PQ_ensureBugMetadata(
  workbook: ExcelScript.Workbook,
  bugIds: number[],
  azure?: FL_AzureConfig,
  authorization?: string
): Promise<void> {
  const missing = Array.from(new Set(bugIds)).filter(
    (id) =>
      !PQ_BUG_STATES.has(id) ||
      !PQ_BUG_ASSIGNEES.has(id) ||
      !PQ_BUG_CATEGORIES.has(id)
  );

  if (missing.length === 0) {
    return;
  }

  const cfg = azure ?? FL_readAzureConfig(
    FL_getRequiredTable(workbook, "tbScriptAzureDevOps")
  );
  const auth = authorization ?? FL_buildAuthorization(cfg.pat);

  const fields = [
    "System.WorkItemType",
    "System.State",
    "System.AssignedTo"
  ];

  if (PQ_BUG_CATEGORY_FIELD_REF !== "") {
    fields.push(PQ_BUG_CATEGORY_FIELD_REF);
  }

  const workItems = await FL_getWorkItemsBatch(
    cfg,
    missing,
    fields,
    auth
  );

  for (const workItem of workItems) {
    const bugId = Number(workItem.id ?? 0);
    if (!bugId) {
      continue;
    }

    const source = workItem.fields ?? {};
    const type = AU_normalizeText(String(source["System.WorkItemType"] ?? ""));
    if (type !== "bug") {
      continue;
    }

    PQ_BUG_STATES.set(
      bugId,
      String(source["System.State"] ?? "").trim()
    );
    PQ_BUG_ASSIGNEES.set(
      bugId,
      FL_identityToText(source["System.AssignedTo"]).trim()
    );
    PQ_BUG_CATEGORIES.set(
      bugId,
      PQ_BUG_CATEGORY_FIELD_REF !== ""
        ? String(source[PQ_BUG_CATEGORY_FIELD_REF] ?? "").trim()
        : ""
    );
  }
}

// Marca a auditoria como desatualizada quando alguma etapa do fluxo completo falha.
function PQ_markAuditStaleSafe(
  workbook: ExcelScript.Workbook,
  stage: string,
  message: string
): void {
  try {
    const table = AU_getRequiredTable(workbook, AU_TABLE_PARAMETROS);
    AU_updateParameter(table, "StatusMotor", "ERRO - AUDITORIA DESATUALIZADA");
    AU_updateParameter(
      table,
      "Observacao",
      `A atualização falhou em ${stage}. Os resultados existentes são da última execução concluída e NÃO representam a fonte atual. Erro: ${message}`
    );
  } catch (statusError) {
    console.log(
      `ATENÇÃO: não foi possível marcar a auditoria como desatualizada: ` +
      `${PQ_formatUnknownError(statusError)}`
    );
  }
}

// Orquestra o fluxo completo: Falhas → Execuções → Auditoria, interrompendo se alguma etapa falhar.
async function main(workbook: ExcelScript.Workbook): Promise<void> {
  const inicio = new Date();
  let etapaAtual = "[1/3] Controle de Falhas";

  console.log("=== AUDIT QA - ATUALIZAÇÃO COMPLETA ===");
  // Limpa a rastreabilidade temporária para iniciar o fluxo com dados novos.
  PQ_resetTransientCaches();

  try {
    console.log("[1/3] Atualizando Controle de Falhas...");
    // Primeiro atualiza Bugs, impactos e metadados usados pela auditoria.
    await runAtualizarFalhasAzure(workbook);
    console.log("[1/3] Controle de Falhas concluído.");

    etapaAtual = "[2/3] Controle de Execuções";
    console.log("[2/3] Atualizando Controle de Execuções...");
    // Depois atualiza as execuções de EndToEnd e UAT que serão comparadas.
    await runAtualizarExecucoesAzure(workbook);
    console.log("[2/3] Controle de Execuções concluído.");

    etapaAtual = "[3/3] Audit QA";
    console.log("[3/3] Atualizando Audit QA...");
    // Só executa a auditoria depois que Falhas e Execuções concluíram sem erro.
    await runAtualizarAuditQA(workbook);
    console.log("[3/3] Auditoria concluída.");

    const fim = new Date();
    console.log(`=== AUDIT QA - TUDO CONCLUÍDO EM ${fim.getTime() - inicio.getTime()} ms ===`);
  } catch (error) {
    const mensagem = PQ_formatUnknownError(error);
    PQ_markAuditStaleSafe(workbook, etapaAtual, mensagem);
    console.log(
      `ERRO NA ATUALIZAÇÃO COMPLETA DO AUDIT QA em ${etapaAtual}: ${mensagem}`
    );
    throw error;
  }
}


/* ===================== CONTROLE DE FALHAS ===================== */

type FL_CellValue = string | number | boolean;
type FL_DataRow = { [key: string]: FL_CellValue };

const FL_RUN_CONCURRENCY = 5;
const FL_STATUS_EVERY_RUNS = 100;
const FL_EXCEL_WRITE_BATCH_SIZE = 200;
const FL_WORK_ITEM_BATCH_SIZE = 200;

/*
 * Senha usada para proteger/desproteger a aba Controle_Falhas.
 *
 * IMPORTANTE:
 * A mesma senha precisa estar configurada na proteção manual da aba.
 */
const FL_SHEET_PROTECTION_PASSWORD = "2565";

const FL_VALID_FRONTS = [
  "GEATE",
  "GEDEV",
  "GEFEA",
  "GEFIS",
  "GEMCO",
  "GERORJ",
  "GERSA",
  "GESIN"
];

interface FL_AzureConfig {
  organization: string;
  project: string;
  apiVersion: string;
  pat: string;
}

interface FL_PlanConfig {
  planKey: string;
  planId: number;
  planName: string;
  suiteNameFilter: string;
  maxSuites: number;
}

interface FL_DestinationConfig {
  sheetName: string;
  startRow: number;
  tableName: string;
  clearBefore: boolean;
  createHeader: boolean;
}

interface FL_FieldConfig {
  order: number;
  field: string;
  active: boolean;
}

interface FL_ShallowReference {
  id?: string | number;
  name?: string;
  url?: string;
}

interface FL_TestSuite {
  id?: number;
  name?: string;
}

interface FL_TestRun {
  id?: number;
  name?: string;
}

interface FL_TestResult {
  id?: number;
  outcome?: string;
  state?: string;

  testCase?: FL_ShallowReference;

  testPlan?: FL_ShallowReference;
  testSuite?: FL_ShallowReference;
  testPoint?: FL_ShallowReference;
  configuration?: FL_ShallowReference;

  associatedBugs?: FL_ShallowReference[];
}

interface FL_RunResultBundle {
  runId: number;
  results: FL_TestResult[];
}

interface FL_AzureListResponse<T> {
  count?: number;
  value?: T[];
}

interface FL_WorkItem {
  id?: number;
  rev?: number;
  fields?: { [key: string]: unknown };
  url?: string;
}

interface FL_WorkItemBatchResponse {
  count?: number;
  value?: FL_WorkItem[];
}

interface FL_WorkItemField {
  name?: string;
  referenceName?: string;
}

interface FL_WorkItemFieldList {
  count?: number;
  value?: FL_WorkItemField[];
}

interface FL_BugImpact {
  scenarioKeys: Set<string>;
}

interface FL_PlanImpactLoad {
  plan: FL_PlanConfig;
  bugImpacts: Map<number, FL_BugImpact>;
  resultTraces: PQ_ResultTrace[];
  runCount: number;
  resultCount: number;
}

interface FL_PlanBugLoad {
  plan: FL_PlanConfig;
  records: FL_DataRow[];
}

interface FL_CombinedOutput {
  headers: string[];
  rows: FL_CellValue[][];
  visualHeaderBodyIndexes: number[];
}

interface FL_StatusContext {
  range: ExcelScript.Range;
  index: { [key: string]: number };
}

/* =========================================================
   MAIN
   ========================================================= */

// Orquestra o Controle de Falhas: configuração, validação, coleta, tratamento, consolidação e gravação.
async function runAtualizarFalhasAzure(
  workbook: ExcelScript.Workbook
): Promise<void> {

  const TABLES = {
    azure: "tbScriptAzureDevOps",
    plans: "tbScriptTestPlans",
    responsibilities: "tbScriptResponsabilidades",
    destination: "tbScriptFalhasDestino",
    fields: "tbScriptFalhasCampos",
    status: "tbScriptStatusFalhas"
  };

  const statusContext =
    FL_getOptionalStatusContext(
      workbook,
      TABLES.status
    );

  let protectedWorksheet:
    ExcelScript.Worksheet | undefined;

  let protectionWasPaused = false;

  try {

    FL_setStatus(
      statusContext,
      "Status",
      "INICIANDO"
    );

    /* =====================================================
       CONFIGURAÇÕES
       ===================================================== */

    // Lê a configuração de acesso ao Azure.
    const azure =
      FL_readAzureConfig(
        FL_getRequiredTable(
          workbook,
          TABLES.azure
        )
      );

    // Lê os Test Plans ativos configurados na planilha.
    const plans =
      FL_readPlans(
        FL_getRequiredTable(
          workbook,
          TABLES.plans
        )
      );

    // Lê o mapeamento de categorias para responsabilidades.
    const responsibilities =
      FL_readResponsibilities(
        workbook.getTable(
          TABLES.responsibilities
        )
      );

    // Lê onde e como o Controle de Falhas será gravado.
    const destination =
      FL_readDestination(
        FL_getRequiredTable(
          workbook,
          TABLES.destination
        )
      );

    // Lê os campos configurados para a saída de falhas.
    const fieldConfigs =
      FL_readFields(
        FL_getRequiredTable(
          workbook,
          TABLES.fields
        )
      );

    /* =====================================================
       VALIDAÇÕES
       ===================================================== */

    if (plans.length === 0) {

      throw new Error(
        'Nenhum Test Plan está ativo em "tbScriptTestPlans".'
      );

    }

    // Monta a lista final de colunas usando somente os campos ativos.
    const outputFields =
      fieldConfigs
        .filter(
          field =>
            field.active
        )
        .sort(
          (a, b) =>
            a.order - b.order
        )
        .map(
          field =>
            field.field
        );

    if (
      outputFields.length === 0
    ) {

      throw new Error(
        'Nenhum campo está ativo em "tbScriptFalhasCampos".'
      );

    }

    if (
      plans.length > 1 &&
      !FL_containsNormalized(
        outputFields,
        "PlanKey"
      )
    ) {

      throw new Error(
        'Com mais de um Test Plan ativo, o campo "PlanKey" precisa estar como SIM em tbScriptFalhasCampos.'
      );

    }

    if (
      !destination.clearBefore
    ) {

      throw new Error(
        'Para este motor, "LimparAntes" precisa estar como SIM em tbScriptFalhasDestino.'
      );

    }

    if (
      !destination.createHeader
    ) {

      throw new Error(
        'Para este motor, "CriarCabecalho" precisa estar como SIM em tbScriptFalhasDestino.'
      );

    }

    FL_validatePlanKeys(
      plans
    );

    // Gera a autenticação usada nas chamadas ao Azure.
    const authorization =
      FL_buildAuthorization(
        azure.pat
      );

    /* =====================================================
       CAMPOS WIT
       ===================================================== */

    FL_setStatus(
      statusContext,
      "Status",
      "LENDO CAMPOS DO AZURE"
    );

    // Consulta os campos de Work Item disponíveis no Azure.
    const fieldDefinitions =
      await FL_getWorkItemFieldDefinitions(
        azure,
        authorization
      );

    // Localiza o campo de Categoria da Falha.
    const categoryField =
      FL_findFieldReference(
        fieldDefinitions,
        [
          "Categoria da Falha",
          "Categoria Falha"
        ]
      );

    // Localiza o campo de Ambiente.
    const environmentField =
      FL_findFieldReference(
        fieldDefinitions,
        [
          "Ambiente",
          "Environment"
        ]
      );

    // Monta os campos que serão buscados nos Bugs.
    const workItemFields =
      FL_buildBugWitFields(
        fieldConfigs,
        categoryField,
        environmentField
      );

    PQ_BUG_CATEGORY_FIELD_REF = categoryField;

    console.log(
      `Campo Categoria: ${categoryField ||
      "não encontrado"
      }`
    );

    console.log(
      `Campo Ambiente: ${environmentField ||
      "não encontrado"
      }`
    );

    /* =====================================================
       RUNS / RESULTADOS / BUGS / IMPACTOS
       ===================================================== */

    // Armazena os impactos coletados de cada Test Plan.
    const planImpactLoads:
      FL_PlanImpactLoad[] = [];

    for (
      let planIndex = 0;
      planIndex < plans.length;
      planIndex++
    ) {

      const plan =
        plans[planIndex];

      FL_setStatus(
        statusContext,
        "Status",
        `LENDO RUNS - ${plan.planKey}`
      );

      // Coleta Runs, Results, Bugs e impactos do plano atual.
      const load =
        await FL_collectPlanBugImpacts(
          azure,
          plan,
          authorization,
          statusContext,
          planIndex + 1,
          plans.length
        );

      planImpactLoads.push(
        load
      );

      console.log(
        `${plan.planKey}: ` +
        `${load.runCount} Runs, ` +
        `${load.resultCount} resultados, ` +
        `${load.bugImpacts.size} Bugs.`
      );

    }

    /* =====================================================
       BUGS ÚNICOS
       ===================================================== */

    // Reúne os IDs únicos dos Bugs encontrados em todos os planos.
    const allBugIds =
      FL_collectUniqueBugIds(
        planImpactLoads
      );

    FL_setStatus(
      statusContext,
      "Status",
      `LENDO ${allBugIds.length} BUGS`
    );

    /* =====================================================
       WORK ITEMS
       ===================================================== */

    // Busca os Work Items completos dos Bugs encontrados.
    const workItems =
      await FL_getWorkItemsBatch(
        azure,
        allBugIds,
        workItemFields,
        authorization
      );

    // Indexa os Work Items por ID para facilitar o tratamento.
    const workItemsById =
      new Map<number, FL_WorkItem>();

    for (
      const workItem of
      workItems
    ) {

      const id =
        Number(
          workItem.id ?? 0
        );

      if (id) {

        workItemsById.set(
          id,
          workItem
        );

      }

    }

    /* =====================================================
       CACHE TRANSITÓRIO DO AUDIT QA

       Mantém o vínculo exato:
       PlanId + RunId + ResultId -> Bugs associados
       e também o estado atual dos Bugs.

       O cache existe somente durante esta execução do script mestre.
       ===================================================== */

    PQ_RESULT_TRACES.clear();

    for (const planLoad of planImpactLoads) {
      for (const trace of planLoad.resultTraces) {
        PQ_RESULT_TRACES.set(
          PQ_resultTraceKey(
            trace.planId,
            trace.runId,
            trace.resultId
          ),
          trace
        );
      }
    }

    PQ_BUG_STATES.clear();
    PQ_BUG_ASSIGNEES.clear();
    PQ_BUG_CATEGORIES.clear();

    for (const workItem of workItems) {
      const bugId = Number(workItem.id ?? 0);

      if (!bugId) {
        continue;
      }

      const state = String(
        workItem.fields?.["System.State"] ?? ""
      ).trim();

      const assignedTo = FL_identityToText(
        workItem.fields?.["System.AssignedTo"]
      ).trim();

      const category = categoryField
        ? String(
          workItem.fields?.[categoryField] ?? ""
        ).trim()
        : "";

      PQ_BUG_STATES.set(bugId, state);
      PQ_BUG_ASSIGNEES.set(bugId, assignedTo);
      PQ_BUG_CATEGORIES.set(bugId, category);
    }

    const massInfraCount = Array.from(
      PQ_BUG_CATEGORIES.values()
    ).filter((category) =>
      PQ_isMassOrInfrastructureCategory(category)
    ).length;

    console.log(
      `Audit QA - rastreabilidade preservada: ` +
      `${PQ_RESULT_TRACES.size} resultados; ` +
      `${PQ_BUG_STATES.size} Bugs com estado conhecido; ` +
      `${PQ_BUG_ASSIGNEES.size} Bugs com AssignedTo carregado; ` +
      `${massInfraCount} Bugs classificados como Massa/Infraestrutura.`
    );

    FL_setStatus(
      statusContext,
      "Status",
      "MONTANDO REGISTROS"
    );

    /* =====================================================
       REGISTROS FINAIS
       ===================================================== */

    // Armazena os registros finais de Bugs por Test Plan.
    const planBugLoads:
      FL_PlanBugLoad[] = [];

    for (
      const planLoad of
      planImpactLoads
    ) {

      // Monta os registros finais do plano combinando Bug, impacto e metadados.
      const records =
        FL_buildPlanBugRecords(
          azure,
          planLoad,
          workItemsById,
          responsibilities,
          categoryField,
          environmentField
        );

      planBugLoads.push({
        plan:
          planLoad.plan,

        records
      });

    }

    /* =====================================================
       CONSOLIDAÇÃO
       ===================================================== */

    // Consolida todos os registros de Falhas em uma única saída.
    const output =
      FL_buildCombinedOutput(
        planBugLoads,
        outputFields
      );

    FL_setStatus(
      statusContext,
      "Status",
      "PREPARANDO GRAVAÇÃO"
    );

    /* =====================================================
       PAUSA A PROTEÇÃO DA ABA DESTINO
       ===================================================== */

    // Obtém a aba de destino antes de liberar a escrita.
    protectedWorksheet =
      FL_getOrCreateWorksheet(
        workbook,
        destination.sheetName
      );

    // Pausa a proteção somente quando a aba está protegida.
    protectionWasPaused =
      FL_pauseWorksheetProtection(
        protectedWorksheet,
        FL_SHEET_PROTECTION_PASSWORD
      );

    FL_setStatus(
      statusContext,
      "Status",
      "GRAVANDO EXCEL"
    );

    /* =====================================================
       GRAVAÇÃO
       ===================================================== */

    // Grava a base consolidada em Controle_Falhas.
    FL_replaceUnifiedOutput(
      workbook,
      destination,
      output
    );

    /* =====================================================
       FINALIZAÇÃO
       ===================================================== */

    const totalRuns =
      planImpactLoads.reduce(
        (sum, item) =>
          sum + item.runCount,
        0
      );

    const totalResults =
      planImpactLoads.reduce(
        (sum, item) =>
          sum + item.resultCount,
        0
      );

    const totalRecords =
      planBugLoads.reduce(
        (sum, item) =>
          sum + item.records.length,
        0
      );

    FL_setStatus(
      statusContext,
      "Status",
      "CONCLUÍDO"
    );

    FL_setStatus(
      statusContext,
      "ÚltimaAtualização",
      new Date().toLocaleString(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo"
        }
      )
    );

    FL_setStatus(
      statusContext,
      "RunsProcessados",
      totalRuns
    );

    FL_setStatus(
      statusContext,
      "ResultadosProcessados",
      totalResults
    );

    FL_setStatus(
      statusContext,
      "BugsÚnicos",
      allBugIds.length
    );

    FL_setStatus(
      statusContext,
      "RegistrosRetornados",
      totalRecords
    );

    console.log(
      `Concluído. ` +
      `Runs: ${totalRuns}; ` +
      `resultados: ${totalResults}; ` +
      `Bugs únicos: ${allBugIds.length}; ` +
      `registros: ${totalRecords}.`
    );

  }
  catch (error) {

    const message =
      FL_formatError(
        error
      );

    try {
      FL_setStatus(
        statusContext,
        "Status",
        `ERRO: ${message}`
      );
    } catch (statusError) {
      console.log(
        `ATENÇÃO: falha ao registrar o erro no status do Controle de Falhas: ` +
        `${PQ_formatUnknownError(statusError)}`
      );
    }

    console.log(
      `ERRO CRÍTICO: ${message}`
    );

    throw error;

  }
  finally {

    /*
     * Mesmo se ocorrer erro durante a gravação,
     * retoma a proteção que foi pausada pelo script.
     */
    if (
      protectionWasPaused &&
      protectedWorksheet
    ) {

      try {

        FL_resumeWorksheetProtection(
          protectedWorksheet
        );

        console.log(
          `Proteção da aba "${protectedWorksheet.getName()}" retomada.`
        );

      }
      catch (protectionError) {

        console.log(
          `ATENÇÃO: não foi possível retomar a proteção da aba ` +
          `"${protectedWorksheet.getName()}": ` +
          `${FL_formatError(protectionError)}`
        );

      }

    }

  }

}

/* =========================================================
   PROTEÇÃO DA ABA
   ========================================================= */

// Obtém a aba de destino ou cria a aba caso ela não exista.
function FL_getOrCreateWorksheet(
  workbook: ExcelScript.Workbook,
  sheetName: string
): ExcelScript.Worksheet {

  let worksheet =
    workbook.getWorksheet(
      sheetName
    );

  if (!worksheet) {

    worksheet =
      workbook.addWorksheet(
        sheetName
      );

  }

  return worksheet;

}

// Pausa temporariamente a proteção da aba para permitir a gravação.
function FL_pauseWorksheetProtection(
  worksheet: ExcelScript.Worksheet,
  password: string
): boolean {

  const protection =
    worksheet.getProtection();

  /*
   * Se a aba não estiver protegida, o script pode gravar
   * normalmente e não há nada para retomar no final.
   */
  if (
    !protection.getProtected()
  ) {

    console.log(
      `Aba "${worksheet.getName()}" não está protegida.`
    );

    return false;

  }

  /*
   * Valida a senha sem alterar o estado da proteção.
   * Isso diferencia senha realmente inválida de erro do
   * método unprotect, que era o problema da versão anterior.
   */
  const passwordIsValid =
    protection.checkPassword(
      password
    );

  if (
    !passwordIsValid
  ) {

    throw new Error(
      `A senha configurada no script não foi aceita pela proteção da aba "${worksheet.getName()}".`
    );

  }

  try {

    protection.pauseProtection(
      password
    );

  }
  catch (error) {

    throw new Error(
      `A senha foi validada, mas o Excel não conseguiu pausar a proteção da aba "${worksheet.getName()}". ` +
      `${FL_formatError(error)}`
    );

  }

  console.log(
    `Proteção da aba "${worksheet.getName()}" pausada para atualização.`
  );

  return true;

}

// Retoma a proteção original da aba após a atualização.
function FL_resumeWorksheetProtection(
  worksheet: ExcelScript.Worksheet
): void {

  const protection =
    worksheet.getProtection();

  /*
   * resumeProtection não recria a proteção.
   * Ele apenas retoma a mesma proteção, senha e opções
   * que já existiam antes do script.
   */
  protection.resumeProtection();

}


/* =========================================================
   IMPACTOS POR TEST PLAN
   ========================================================= */

// Carrega os impactos de Bugs de um Test Plan percorrendo Runs e Results.
async function FL_collectPlanBugImpacts(
  azure: FL_AzureConfig,
  plan: FL_PlanConfig,
  authorization: string,
  statusContext:
    FL_StatusContext |
    undefined,
  planPosition: number,
  planCount: number
): Promise<FL_PlanImpactLoad> {

  const allowedSuiteIds =
    await FL_getAllowedSuiteIdsIfNeeded(
      azure,
      plan,
      authorization
    );

  const runs =
    await FL_getRuns(
      azure,
      plan.planId,
      authorization
    );

  const bugImpacts =
    new Map<number, FL_BugImpact>();

  const resultTraces:
    PQ_ResultTrace[] = [];

  let resultCount = 0;
  let processedRuns = 0;

  for (
    let batchStart = 0;
    batchStart < runs.length;
    batchStart += FL_RUN_CONCURRENCY
  ) {

    const runBatch =
      runs.slice(
        batchStart,
        Math.min(
          batchStart +
          FL_RUN_CONCURRENCY,
          runs.length
        )
      );

    const promises:
      Promise<FL_RunResultBundle>[] = [];

    for (
      const run of
      runBatch
    ) {

      const runId =
        Number(
          run.id ?? 0
        );

      if (runId) {

        promises.push(
          FL_getRunResultBundle(
            azure,
            runId,
            authorization
          )
        );

      }

    }

    const resultBatches =
      await Promise.all(
        promises
      );

    for (
      const bundle of
      resultBatches
    ) {

      const runId =
        bundle.runId;

      const results =
        bundle.results;

      resultCount +=
        results.length;

      for (
        const result of
        results
      ) {

        if (
          !FL_resultBelongsToPlan(
            result,
            plan.planId
          )
        ) {

          continue;

        }

        const suiteId =
          Number(
            result
              .testSuite
              ?.id ?? 0
          );

        if (
          allowedSuiteIds
        ) {

          if (
            !suiteId ||
            !allowedSuiteIds.has(
              suiteId
            )
          ) {

            continue;

          }

        }

        const resultId =
          Number(
            result.id ?? 0
          );

        const testPointId =
          Number(
            result
              .testPoint
              ?.id ?? 0
          );

        const testCaseId =
          Number(
            result
              .testCase
              ?.id ?? 0
          );

        const bugs =
          Array.isArray(
            result.associatedBugs
          )
            ? result.associatedBugs
            : [];

        const bugIdSet =
          new Set<number>();

        for (
          const bug of
          bugs
        ) {

          const bugId =
            Number(
              bug.id ?? 0
            );

          if (bugId) {
            bugIdSet.add(bugId);
          }

        }

        const bugIds =
          Array.from(
            bugIdSet
          ).sort(
            (a, b) => a - b
          );

        /*
         * IMPORTANTE PARA O AUDIT QA:
         * preservamos TODOS os resultados, inclusive os que não possuem Bug.
         * Isso permite identificar Failed/Blocked sem rastreabilidade.
         */
        if (
          resultId > 0 &&
          runId > 0
        ) {

          resultTraces.push({
            planId: plan.planId,
            planKey: plan.planKey,
            runId,
            resultId,
            testPointId,
            testCaseId,
            suiteId,
            bugIds
          });

        }

        if (
          bugIds.length === 0
        ) {

          continue;

        }

        const scenarioKey =
          FL_buildScenarioKey(
            result,
            plan.planId
          );

        if (
          !scenarioKey
        ) {

          continue;

        }

        for (
          const bugId of
          bugIds
        ) {

          let impact =
            bugImpacts.get(
              bugId
            );

          if (
            !impact
          ) {

            impact = {
              scenarioKeys:
                new Set<string>()
            };

            bugImpacts.set(
              bugId,
              impact
            );

          }

          impact
            .scenarioKeys
            .add(
              scenarioKey
            );

        }

      }

    }

    processedRuns +=
      runBatch.length;

    if (
      processedRuns %
      FL_STATUS_EVERY_RUNS === 0 ||
      processedRuns >=
      runs.length
    ) {

      FL_setStatus(
        statusContext,
        "Status",
        `PLANO ` +
        `${planPosition}/${planCount} - ` +
        `${plan.planKey}: ` +
        `${processedRuns}/${runs.length} RUNS`
      );

    }

  }

  return {
    plan,
    bugImpacts,
    resultTraces,
    runCount:
      runs.length,
    resultCount
  };
}

// Busca os resultados de um Run preservando o RunId para a rastreabilidade.
async function FL_getRunResultBundle(
  azure: FL_AzureConfig,
  runId: number,
  authorization: string
): Promise<FL_RunResultBundle> {
  const results =
    await FL_getResultsWithBugs(
      azure,
      runId,
      authorization
    );

  return {
    runId,
    results
  };
}

/* =========================================================
   VALIDA TEST PLAN
   ========================================================= */

// Verifica se o resultado realmente pertence ao Test Plan esperado.
function FL_resultBelongsToPlan(
  result: FL_TestResult,
  expectedPlanId: number
): boolean {

  const resultPlanId =
    Number(
      result
        .testPlan
        ?.id ?? 0
    );

  if (
    resultPlanId > 0
  ) {

    return (
      resultPlanId ===
      expectedPlanId
    );

  }

  return true;

}

/* =========================================================
   CHAVE ÚNICA DO CENÁRIO
   ========================================================= */

// Cria uma chave única para identificar um cenário impactado por Bug.
function FL_buildScenarioKey(
  result: FL_TestResult,
  planId: number
): string {

  const testPointId =
    Number(
      result
        .testPoint
        ?.id ?? 0
    );

  if (
    testPointId > 0
  ) {

    return (
      `PLAN:${planId}` +
      `|POINT:${testPointId}`
    );

  }

  const suiteId =
    Number(
      result
        .testSuite
        ?.id ?? 0
    );

  const testCaseId =
    Number(
      result
        .testCase
        ?.id ?? 0
    );

  const configurationId =
    Number(
      result
        .configuration
        ?.id ?? 0
    );

  if (
    suiteId > 0 &&
    testCaseId > 0
  ) {

    return (
      `PLAN:${planId}` +
      `|SUITE:${suiteId}` +
      `|TC:${testCaseId}` +
      `|CONFIG:${configurationId}`
    );

  }

  if (
    testCaseId > 0
  ) {

    return (
      `PLAN:${planId}` +
      `|TC:${testCaseId}`
    );

  }

  return "";

}

/* =========================================================
   SUÍTES
   ========================================================= */

// Retorna as suítes permitidas quando o plano usa filtro de nome ou limite.
async function FL_getAllowedSuiteIdsIfNeeded(
  azure: FL_AzureConfig,
  plan: FL_PlanConfig,
  authorization: string
): Promise<
  Set<number> |
  undefined
> {

  const hasFilter =
    plan
      .suiteNameFilter
      .trim() !== "";

  const hasMax =
    plan.maxSuites > 0;

  if (
    !hasFilter &&
    !hasMax
  ) {

    return undefined;

  }

  const suites =
    await FL_getSuites(
      azure,
      plan.planId,
      authorization
    );

  let selected =
    suites.filter(
      suite =>
        Number(
          suite.id ?? 0
        ) > 0
    );

  if (
    hasFilter
  ) {

    const filter =
      FL_normalize(
        plan.suiteNameFilter
      );

    selected =
      selected.filter(
        suite =>
          FL_normalize(
            String(
              suite.name ?? ""
            )
          ).includes(
            filter
          )
      );

  }

  if (
    hasMax
  ) {

    selected =
      selected.slice(
        0,
        plan.maxSuites
      );

  }

  return new Set<number>(
    selected
      .map(
        suite =>
          Number(
            suite.id ?? 0
          )
      )
      .filter(
        id =>
          id > 0
      )
  );

}

// Consulta no Azure a lista de suítes de um Test Plan.
async function FL_getSuites(
  azure: FL_AzureConfig,
  planId: number,
  authorization: string
): Promise<FL_TestSuite[]> {

  const url =
    `${FL_projectBaseUrl(azure)}` +
    `/_apis/testplan/Plans/` +
    `${planId}/suites` +
    `?asTreeView=false` +
    `&api-version=` +
    `${encodeURIComponent(
      azure.apiVersion
    )}`;

  const data =
    await FL_azureGet<
      FL_AzureListResponse<FL_TestSuite>
    >(
      url,
      authorization
    );

  return Array.isArray(
    data.value
  )
    ? data.value
    : [];

}

/* =========================================================
   TEST RUNS
   ========================================================= */

// Consulta no Azure todos os Runs de um Test Plan, tratando paginação.
async function FL_getRuns(
  azure: FL_AzureConfig,
  planId: number,
  authorization: string
): Promise<FL_TestRun[]> {

  const all:
    FL_TestRun[] = [];

  const top =
    1000;

  let skip =
    0;

  while (
    true
  ) {

    const url =
      `${FL_projectBaseUrl(azure)}` +
      `/_apis/test/runs` +
      `?planId=${planId}` +
      `&$top=${top}` +
      `&$skip=${skip}` +
      `&api-version=` +
      `${encodeURIComponent(
        azure.apiVersion
      )}`;

    const data =
      await FL_azureGet<
        FL_AzureListResponse<FL_TestRun>
      >(
        url,
        authorization
      );

    const page =
      Array.isArray(
        data.value
      )
        ? data.value
        : [];

    all.push(
      ...page
    );

    if (
      page.length <
      top
    ) {

      break;

    }

    skip +=
      top;

  }

  return all;

}

/* =========================================================
   TEST RESULTS
   ========================================================= */

// Consulta os resultados de um Run e retorna os Bugs associados.
async function FL_getResultsWithBugs(
  azure: FL_AzureConfig,
  runId: number,
  authorization: string
): Promise<FL_TestResult[]> {

  const all:
    FL_TestResult[] = [];

  const top =
    200;

  let skip =
    0;

  while (
    true
  ) {

    const details =
      encodeURIComponent(
        "WorkItems,Point"
      );

    const url =
      `${FL_projectBaseUrl(azure)}` +
      `/_apis/test/Runs/` +
      `${runId}/results` +
      `?detailsToInclude=${details}` +
      `&$top=${top}` +
      `&$skip=${skip}` +
      `&api-version=` +
      `${encodeURIComponent(
        azure.apiVersion
      )}`;

    const data =
      await FL_azureGet<
        FL_AzureListResponse<FL_TestResult>
      >(
        url,
        authorization
      );

    const page =
      Array.isArray(
        data.value
      )
        ? data.value
        : [];

    all.push(
      ...page
    );

    if (
      page.length <
      top
    ) {

      break;

    }

    skip +=
      top;

  }

  return all;

}

/* =========================================================
   CAMPOS WIT
   ========================================================= */

// Consulta no Azure os campos disponíveis de Work Item.
async function FL_getWorkItemFieldDefinitions(
  azure: FL_AzureConfig,
  authorization: string
): Promise<FL_WorkItemField[]> {

  const url =
    `${FL_projectBaseUrl(azure)}` +
    `/_apis/wit/fields` +
    `?api-version=` +
    `${encodeURIComponent(
      azure.apiVersion
    )}`;

  const data =
    await FL_azureGet<
      FL_WorkItemFieldList
    >(
      url,
      authorization
    );

  return Array.isArray(
    data.value
  )
    ? data.value
    : [];

}

// Procura o referenceName de um campo do Azure a partir de nomes conhecidos.
function FL_findFieldReference(
  definitions:
    FL_WorkItemField[],
  aliases:
    string[]
): string {

  const normalizedAliases =
    aliases.map(
      alias =>
        FL_normalize(
          alias
        )
    );

  for (
    const field of
    definitions
  ) {

    const name =
      FL_normalize(
        String(
          field.name ?? ""
        )
      );

    const referenceName =
      FL_normalize(
        String(
          field.referenceName ?? ""
        )
      );

    for (
      const alias of
      normalizedAliases
    ) {

      if (
        name === alias ||
        referenceName === alias ||
        referenceName.endsWith(
          `.${alias}`
        )
      ) {

        return String(
          field.referenceName ?? ""
        );

      }

    }

  }

  return "";

}

/* =========================================================
   CAMPOS DOS BUGS
   ========================================================= */

// Monta a lista de campos que serão solicitados ao buscar os Bugs.
function FL_buildBugWitFields(
  fieldConfigs:
    FL_FieldConfig[],
  categoryField:
    string,
  environmentField:
    string
): string[] {

  const fields =
    new Set<string>([
      "System.WorkItemType",
      "System.Title",
      "System.State",
      "System.CreatedDate",
      "System.CreatedBy",
      "System.AssignedTo",
      "System.Tags",
      "Microsoft.VSTS.Common.ClosedDate"
    ]);

  if (
    categoryField
  ) {

    fields.add(
      categoryField
    );

  }

  if (
    environmentField
  ) {

    fields.add(
      environmentField
    );

  }

  for (
    const config of
    fieldConfigs
  ) {

    const field =
      config
        .field
        .trim();

    if (
      !config.active ||
      !field
    ) {

      continue;

    }

    if (
      field.startsWith(
        "System."
      ) ||
      field.startsWith(
        "Microsoft."
      ) ||
      field.startsWith(
        "Custom."
      )
    ) {

      fields.add(
        field
      );

    }

  }

  return Array.from(
    fields
  );

}

/* =========================================================
   WORK ITEMS BATCH
   ========================================================= */

// Busca os Bugs em lotes no endpoint de Work Items Batch.
async function FL_getWorkItemsBatch(
  azure: FL_AzureConfig,
  ids: number[],
  fields: string[],
  authorization: string
): Promise<FL_WorkItem[]> {

  const all:
    FL_WorkItem[] = [];

  for (
    let start = 0;
    start < ids.length;
    start += FL_WORK_ITEM_BATCH_SIZE
  ) {

    const batchIds =
      ids.slice(
        start,
        Math.min(
          start +
          FL_WORK_ITEM_BATCH_SIZE,
          ids.length
        )
      );

    if (
      batchIds.length === 0
    ) {

      continue;

    }

    const url =
      `${FL_projectBaseUrl(azure)}` +
      `/_apis/wit/workitemsbatch` +
      `?api-version=` +
      `${encodeURIComponent(
        azure.apiVersion
      )}`;

    const body = {
      ids:
        batchIds,

      fields,

      errorPolicy:
        "Omit"
    };

    const data =
      await FL_azurePost<
        FL_WorkItemBatchResponse
      >(
        url,
        body,
        authorization
      );

    if (
      Array.isArray(
        data.value
      )
    ) {

      all.push(
        ...data.value
      );

    }

  }

  return all;

}

/* =========================================================
   TAGS -> FRENTES
   ========================================================= */

// Extrai das tags as frentes válidas associadas ao Bug.
function FL_getFrontsFromTags(
  tags: string
): string[] {

  if (
    !tags.trim()
  ) {

    return [];

  }

  const fronts =
    new Set<string>();

  const tagItems =
    tags.split(
      ";"
    );

  for (
    const tag of
    tagItems
  ) {

    const front =
      FL_canonicalFront(
        tag
      );

    if (
      front
    ) {

      fronts.add(
        front
      );

    }

  }

  return FL_sortFronts(
    Array.from(
      fronts
    )
  );

}

// Normaliza um valor e retorna a frente oficial correspondente.
function FL_canonicalFront(
  value: string
): string {

  const normalizedValue =
    FL_normalize(
      value
    );

  for (
    const front of
    FL_VALID_FRONTS
  ) {

    if (
      FL_normalize(
        front
      ) ===
      normalizedValue
    ) {

      return front;

    }

  }

  return "";

}

// Ordena as frentes encontradas conforme a ordem oficial definida no script.
function FL_sortFronts(
  fronts: string[]
): string[] {

  const order =
    new Map<
      string,
      number
    >();

  FL_VALID_FRONTS.forEach(
    (
      front,
      index
    ) => {

      order.set(
        front,
        index
      );

    }
  );

  return fronts.sort(
    (
      a,
      b
    ) => {

      const aIndex =
        order.has(
          a
        )
          ? order.get(
            a
          )!
          : 999;

      const bIndex =
        order.has(
          b
        )
          ? order.get(
            b
          )!
          : 999;

      return (
        aIndex -
        bIndex ||
        a.localeCompare(
          b
        )
      );

    }
  );

}

/* =========================================================
   CONSTRUÇÃO DOS REGISTROS
   ========================================================= */

// Monta os registros finais de Bugs combinando Work Item, impacto e configurações.
function FL_buildPlanBugRecords(
  azure: FL_AzureConfig,
  planLoad: FL_PlanImpactLoad,

  workItemsById:
    Map<number, FL_WorkItem>,

  responsibilities:
    Map<string, string>,

  categoryField:
    string,

  environmentField:
    string
): FL_DataRow[] {

  const records:
    FL_DataRow[] = [];

  const bugIds =
    Array.from(
      planLoad
        .bugImpacts
        .keys()
    ).sort(
      (
        a,
        b
      ) =>
        b - a
    );

  for (
    const bugId of
    bugIds
  ) {

    const workItem =
      workItemsById.get(
        bugId
      );

    if (
      !workItem
    ) {

      continue;

    }

    const source =
      workItem.fields ??
      {};

    const workItemType =
      String(
        source[
        "System.WorkItemType"
        ] ?? ""
      ).trim();

    if (
      FL_normalize(
        workItemType
      ) !==
      FL_normalize(
        "Bug"
      )
    ) {

      continue;

    }

    const tags =
      String(
        source[
        "System.Tags"
        ] ?? ""
      ).trim();

    const category =
      categoryField
        ? String(
          source[
          categoryField
          ] ?? ""
        ).trim()
        : "";

    const responsibility =
      responsibilities.get(
        FL_normalize(
          category
        )
      ) ?? "";

    const environment =
      FL_resolveEnvironmentValue(
        source,
        environmentField,
        tags
      );

    const front =
      FL_getFrontsFromTags(
        tags
      ).join(
        " | "
      );

    const impact =
      planLoad
        .bugImpacts
        .get(
          bugId
        );

    const impactCount =
      impact
        ? impact
          .scenarioKeys
          .size
        : 0;

    const record:
      FL_DataRow = {};

    for (
      const referenceName of
      Object.keys(
        source
      )
    ) {

      record[
        referenceName
      ] =
        FL_workItemFieldToCell(
          source[
          referenceName
          ]
        );

    }

    record["PlanKey"] =
      planLoad
        .plan
        .planKey;

    record["PlanId"] =
      planLoad
        .plan
        .planId;

    record["PlanName"] =
      planLoad
        .plan
        .planName;

    record["Responsavel"] =
      responsibility;

    record["Responsável"] =
      responsibility;

    record["Responsabilidade"] =
      responsibility;

    record["Ambiente"] =
      environment;

    record["Categoria"] =
      category;

    record["ID"] =
      bugId;

    record["Impacto"] =
      impactCount;

    record["Frente"] =
      front;

    record["Título"] =
      String(
        source[
        "System.Title"
        ] ?? ""
      );

    record["Titulo"] =
      String(
        source[
        "System.Title"
        ] ?? ""
      );

    record["Status"] =
      String(
        source[
        "System.State"
        ] ?? ""
      );

    record["Criação"] =
      FL_formatAzureDate(
        source[
        "System.CreatedDate"
        ]
      );

    record["Criacao"] =
      FL_formatAzureDate(
        source[
        "System.CreatedDate"
        ]
      );

    record["Fechamento"] =
      FL_formatAzureDate(
        source[
        "Microsoft.VSTS.Common.ClosedDate"
        ]
      );

    record["Links"] =
      FL_buildWorkItemLink(
        azure,
        bugId
      );

    record["Link"] =
      FL_buildWorkItemLink(
        azure,
        bugId
      );

    record["Tags"] =
      tags;

    record["CreatedBy"] =
      FL_identityToText(
        source[
        "System.CreatedBy"
        ]
      );

    record["AssignedTo"] =
      FL_identityToText(
        source[
        "System.AssignedTo"
        ]
      );

    records.push(
      record
    );

  }

  return records;

}

/* =========================================================
   AMBIENTE
   ========================================================= */

// Resolve o valor de Ambiente usando campo específico ou fallback por tags.
function FL_resolveEnvironmentValue(
  source:
    {
      [key: string]:
      unknown
    },

  environmentField:
    string,

  tags:
    string
): string {

  if (
    environmentField
  ) {

    const directValue =
      String(
        source[
        environmentField
        ] ?? ""
      ).trim();

    if (
      directValue
    ) {

      return directValue;

    }

  }

  if (
    FL_normalize(
      tags
    ).includes(
      FL_normalize(
        "V3Online"
      )
    )
  ) {

    return "V3";

  }

  return "";

}

/* =========================================================
   BUG IDS
   ========================================================= */

// Reúne e ordena todos os IDs únicos de Bugs encontrados.
function FL_collectUniqueBugIds(
  planLoads:
    FL_PlanImpactLoad[]
): number[] {

  const ids =
    new Set<number>();

  for (
    const load of
    planLoads
  ) {

    for (
      const id of
      load
        .bugImpacts
        .keys()
    ) {

      ids.add(
        id
      );

    }

  }

  return Array.from(
    ids
  ).sort(
    (
      a,
      b
    ) =>
      a - b
  );

}

/* =========================================================
   OUTPUT MULTI-PLAN
   ========================================================= */

// Consolida os registros de todos os Test Plans em uma única saída.
function FL_buildCombinedOutput(
  planLoads:
    FL_PlanBugLoad[],

  outputFields:
    string[]
): FL_CombinedOutput {

  const rows:
    FL_CellValue[][] = [];

  const visualHeaderBodyIndexes:
    number[] = [];

  for (
    let planIndex = 0;
    planIndex < planLoads.length;
    planIndex++
  ) {

    const load =
      planLoads[
      planIndex
      ];

    /* Tabela estruturada: sem linhas visuais artificiais entre planos. */

    for (
      const record of
      load.records
    ) {

      rows.push(
        outputFields.map(
          field =>
            FL_toCellValue(
              record[
              field
              ]
            )
        )
      );

    }

  }

  return {
    headers:
      outputFields,

    rows,

    visualHeaderBodyIndexes
  };

}

/* =========================================================
   ESCREVE NO EXCEL
   ========================================================= */

// Substitui o conteúdo da tabela de destino pelos dados consolidados.
function FL_replaceUnifiedOutput(
  workbook:
    ExcelScript.Workbook,

  destination:
    FL_DestinationConfig,

  output:
    FL_CombinedOutput
): void {

  let worksheet =
    workbook.getWorksheet(
      destination.sheetName
    );

  if (
    !worksheet
  ) {

    worksheet =
      workbook.addWorksheet(
        destination.sheetName
      );

  }

  const startRowIndex =
    destination.startRow - 1;

  const startColumnIndex =
    0;

  const headers =
    output.headers;

  if (
    headers.length === 0
  ) {

    throw new Error(
      "Nenhuma coluna foi definida para a saída."
    );

  }

  const bodyRows =
    output.rows.length > 0
      ? output.rows
      : [
        headers.map(
          () => ""
        )
      ];

  const rowCount =
    1 +
    bodyRows.length;

  const columnCount =
    headers.length;

  const targetRange =
    worksheet.getRangeByIndexes(
      startRowIndex,
      startColumnIndex,
      rowCount,
      columnCount
    );

  let table =
    workbook.getTable(
      destination.tableName
    );

  /* =====================================================
     SE NÃO ENCONTROU PELO NOME,
     PROCURA UMA TABELA QUE COMECE NO DESTINO
     ===================================================== */

  if (
    !table
  ) {

    const existingTables =
      worksheet.getTables();

    for (
      const existing of
      existingTables
    ) {

      const existingRange =
        existing.getRange();

      if (
        existingRange.getRowIndex() ===
        startRowIndex &&
        existingRange.getColumnIndex() ===
        startColumnIndex
      ) {

        table =
          existing;

        break;

      }

    }

  }

  /* =====================================================
     CRIA NOVA TABELA
     ===================================================== */

  if (
    !table
  ) {

    targetRange.clear(
      ExcelScript
        .ClearApplyTo
        .all
    );

    worksheet
      .getRangeByIndexes(
        startRowIndex,
        startColumnIndex,
        1,
        columnCount
      )
      .setValues([
        headers
      ]);

    FL_writeRowsInBatches(
      worksheet,
      startRowIndex + 1,
      startColumnIndex,
      bodyRows,
      columnCount
    );

    table =
      worksheet.addTable(
        targetRange,
        true
      );

    table.setName(
      destination.tableName
    );

  }

  /* =====================================================
     ATUALIZA TABELA EXISTENTE
     ===================================================== */

  else {

    /*
     * Salvaguarda confirmada no laboratório:
     * filtros ativos podem impedir operações estruturais como resize().
     * A proteção da aba já está pausada neste ponto.
     */
    try {
      table.getAutoFilter().clearCriteria();
    } catch (filterError) {
      console.log(
        `ATENÇÃO: não foi possível limpar os filtros da tabela "${table.getName()}": ${FL_formatError(filterError)}`
      );
    }

    /*
     * IMPORTANTE:
     * NÃO usamos mais:
     *
     * table.setShowTotals(false)
     *
     * Essa chamada estava causando:
     * "Você não pode realizar a operação solicitada."
     */

    const oldRange =
      table.getRange();

    const oldRowIndex =
      oldRange.getRowIndex();

    const oldColumnIndex =
      oldRange.getColumnIndex();

    const oldRowCount =
      oldRange.getRowCount();

    const oldColumnCount =
      oldRange.getColumnCount();

    if (
      oldRowIndex !==
      startRowIndex ||
      oldColumnIndex !==
      startColumnIndex
    ) {

      throw new Error(
        `A tabela "${table.getName()}" existe, ` +
        `mas não começa em A${destination.startRow}. ` +
        `Ajuste tbScriptFalhasDestino ou reposicione a tabela.`
      );

    }

    table.resize(
      targetRange
    );

    table
      .getHeaderRowRange()
      .setValues([
        headers
      ]);

    const bodyRange =
      table
        .getRangeBetweenHeaderAndTotal();

    bodyRange.clear(
      ExcelScript
        .ClearApplyTo
        .contents
    );

    FL_writeRowsInBatches(
      worksheet,
      startRowIndex + 1,
      startColumnIndex,
      bodyRows,
      columnCount
    );

    /* ===================================================
       LIMPA LINHAS ANTIGAS EXCEDENTES
       =================================================== */

    if (
      oldRowCount >
      rowCount
    ) {

      worksheet
        .getRangeByIndexes(
          startRowIndex +
          rowCount,

          startColumnIndex,

          oldRowCount -
          rowCount,

          oldColumnCount
        )
        .clear(
          ExcelScript
            .ClearApplyTo
            .all
        );

    }

    /* ===================================================
       LIMPA COLUNAS ANTIGAS EXCEDENTES
       =================================================== */

    if (
      oldColumnCount >
      columnCount
    ) {

      worksheet
        .getRangeByIndexes(
          startRowIndex,

          startColumnIndex +
          columnCount,

          Math.min(
            oldRowCount,
            rowCount
          ),

          oldColumnCount -
          columnCount
        )
        .clear(
          ExcelScript
            .ClearApplyTo
            .all
        );

    }

  }

  /* =====================================================
     FORMATAÇÃO
     ===================================================== */

  const finalBodyRange =
    table
      .getRangeBetweenHeaderAndTotal();

  finalBodyRange
    .getFormat()
    .getFont()
    .setBold(
      false
    );

  for (
    const bodyIndex of
    output
      .visualHeaderBodyIndexes
  ) {

    if (
      bodyIndex < 0 ||
      bodyIndex >=
      bodyRows.length
    ) {

      continue;

    }

    worksheet
      .getRangeByIndexes(
        startRowIndex +
        1 +
        bodyIndex,

        startColumnIndex,

        1,

        columnCount
      )
      .getFormat()
      .getFont()
      .setBold(
        true
      );

  }

}

/* =========================================================
   GRAVAÇÃO EM LOTES
   ========================================================= */

// Grava as linhas no Excel em lotes para reduzir o custo de escrita.
function FL_writeRowsInBatches(
  worksheet:
    ExcelScript.Worksheet,

  startRowIndex:
    number,

  startColumnIndex:
    number,

  rows:
    FL_CellValue[][],

  columnCount:
    number
): void {

  for (
    let start = 0;
    start < rows.length;
    start +=
    FL_EXCEL_WRITE_BATCH_SIZE
  ) {

    const batch =
      rows.slice(
        start,
        Math.min(
          start +
          FL_EXCEL_WRITE_BATCH_SIZE,
          rows.length
        )
      );

    worksheet
      .getRangeByIndexes(
        startRowIndex +
        start,

        startColumnIndex,

        batch.length,

        columnCount
      )
      .setValues(
        batch
      );

  }

}

/* =========================================================
   HTTP GET
   ========================================================= */

async function FL_azureGet<T>(
  url: string,
  authorization: string
): Promise<T> {

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          Authorization:
            authorization,

          Accept:
            "application/json"
        }
      }
    );

  if (
    !response.ok
  ) {

    const body =
      await FL_safeResponseText(
        response
      );

    if (
      response.status ===
      429
    ) {

      throw new Error(
        `Azure DevOps retornou HTTP 429 ` +
        `(limite de requisições). ` +
        `Reduza RUN_CONCURRENCY de ` +
        `${FL_RUN_CONCURRENCY} para 3 ` +
        `e execute novamente. ${body}`
      );

    }

    throw new Error(
      `GET ${url} falhou com ` +
      `HTTP ${response.status}. ` +
      `${body}`
    );

  }

  return (
    await response.json()
  ) as T;

}

/* =========================================================
   HTTP POST
   ========================================================= */

async function FL_azurePost<T>(
  url: string,
  body: unknown,
  authorization: string
): Promise<T> {

  const response =
    await fetch(
      url,
      {
        method:
          "POST",

        headers: {
          Authorization:
            authorization,

          Accept:
            "application/json",

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            body
          )
      }
    );

  if (
    !response.ok
  ) {

    const responseBody =
      await FL_safeResponseText(
        response
      );

    if (
      response.status ===
      429
    ) {

      throw new Error(
        `Azure DevOps retornou HTTP 429 ` +
        `(limite de requisições). ` +
        `Reduza RUN_CONCURRENCY de ` +
        `${FL_RUN_CONCURRENCY} para 3 ` +
        `e execute novamente. ` +
        `${responseBody}`
      );

    }

    throw new Error(
      `POST ${url} falhou com ` +
      `HTTP ${response.status}. ` +
      `${responseBody}`
    );

  }

  return (
    await response.json()
  ) as T;

}

/* =========================================================
   RESPONSE TEXT
   ========================================================= */

// Obtém o texto da resposta HTTP sem deixar a leitura de erro quebrar o fluxo.
async function FL_safeResponseText(
  response:
    Response
): Promise<string> {

  try {

    return await response.text();

  }
  catch {

    return "";

  }

}

/* =========================================================
   URLs
   ========================================================= */

// Monta a URL base do projeto no Azure DevOps.
function FL_projectBaseUrl(
  azure:
    FL_AzureConfig
): string {

  return (
    `https://dev.azure.com/` +
    `${encodeURIComponent(
      azure.organization
    )}/` +
    `${encodeURIComponent(
      azure.project
    )}`
  );

}

// Monta o link direto de um Work Item no Azure DevOps.
function FL_buildWorkItemLink(
  azure:
    FL_AzureConfig,

  workItemId:
    number
): string {

  return (
    `${FL_projectBaseUrl(
      azure
    )}` +
    `/_workitems/edit/` +
    `${workItemId}`
  );

}

/* =========================================================
   AUTH
   ========================================================= */

// Monta o cabeçalho de autenticação Basic usando o PAT configurado.
function FL_buildAuthorization(
  pat:
    string
): string {

  return (
    `Basic ` +
    `${btoa(
      `:${pat}`
    )}`
  );

}

/* =========================================================
   CONFIG AZURE
   ========================================================= */

// Lê da tabela de configuração os dados necessários para acessar o Azure.
function FL_readAzureConfig(
  table:
    ExcelScript.Table
): FL_AzureConfig {

  const row =
    FL_getFirstRow(
      table
    );

  const organization =
    String(
      row[
      "Organization"
      ] ?? ""
    ).trim();

  const project =
    String(
      row[
      "Project"
      ] ?? ""
    ).trim();

  const apiVersion =
    String(
      row[
      "ApiVersion"
      ] ??
      "7.1"
    ).trim() ||
    "7.1";

  const pat =
    String(
      row[
      "PAT"
      ] ?? ""
    ).trim();

  if (
    !organization
  ) {

    throw new Error(
      'Organization não preenchida em "tbScriptAzureDevOps".'
    );

  }

  if (
    !project
  ) {

    throw new Error(
      'Project não preenchido em "tbScriptAzureDevOps".'
    );

  }

  if (
    !pat
  ) {

    throw new Error(
      'PAT não preenchido em "tbScriptAzureDevOps".'
    );

  }

  return {
    organization,
    project,
    apiVersion,
    pat
  };

}

/* =========================================================
   TEST PLANS
   ========================================================= */

// Lê os Test Plans configurados e retorna somente os planos ativos.
function FL_readPlans(
  table:
    ExcelScript.Table
): FL_PlanConfig[] {

  const rows =
    FL_getTableRows(
      table
    );

  const plans:
    FL_PlanConfig[] = [];

  for (
    const row of
    rows
  ) {

    if (
      !FL_isYes(
        row[
        "Carregar"
        ]
      )
    ) {

      continue;

    }

    const planKey =
      String(
        row[
        "PlanKey"
        ] ?? ""
      ).trim();

    const planId =
      Number(
        row[
        "PlanId"
        ] ?? 0
      );

    const planName =
      String(
        row[
        "PlanName"
        ] ?? ""
      ).trim();

    const suiteNameFilter =
      String(
        row[
        "SuiteNameFilter"
        ] ?? ""
      ).trim();

    const maxSuites =
      Number(
        row[
        "MaxSuites"
        ] ?? 0
      );

    if (
      !planKey
    ) {

      throw new Error(
        "Existe Test Plan ativo sem PlanKey."
      );

    }

    if (
      !planId
    ) {

      throw new Error(
        `PlanId inválido para o PlanKey "${planKey}".`
      );

    }

    plans.push({
      planKey,
      planId,
      planName,
      suiteNameFilter,

      maxSuites:
        Number.isFinite(
          maxSuites
        ) &&
          maxSuites > 0
          ? Math.floor(
            maxSuites
          )
          : 0
    });

  }

  return plans;

}

/* =========================================================
   DESTINO
   ========================================================= */

// Lê a configuração da aba, tabela e linha onde os dados serão gravados.
function FL_readDestination(
  table:
    ExcelScript.Table
): FL_DestinationConfig {

  const map =
    FL_getKeyValueMap(
      table,
      "Parâmetro",
      "Valor"
    );

  const sheetName =
    String(
      map.get(
        FL_normalize(
          "AbaDestino"
        )
      ) ?? ""
    ).trim();

  const startRow =
    Number(
      map.get(
        FL_normalize(
          "LinhaInicial"
        )
      ) ?? 0
    );

  const tableName =
    String(
      map.get(
        FL_normalize(
          "NomeTabela"
        )
      ) ?? ""
    ).trim();

  const clearBefore =
    FL_isYes(
      map.get(
        FL_normalize(
          "LimparAntes"
        )
      )
    );

  const createHeader =
    FL_isYes(
      map.get(
        FL_normalize(
          "CriarCabecalho"
        )
      )
    );

  if (
    !sheetName
  ) {

    throw new Error(
      'AbaDestino não preenchida em "tbScriptFalhasDestino".'
    );

  }

  if (
    !startRow ||
    startRow < 1
  ) {

    throw new Error(
      'LinhaInicial inválida em "tbScriptFalhasDestino".'
    );

  }

  if (
    !tableName
  ) {

    throw new Error(
      'NomeTabela não preenchido em "tbScriptFalhasDestino".'
    );

  }

  return {
    sheetName,
    startRow,
    tableName,
    clearBefore,
    createHeader
  };

}

/* =========================================================
   CAMPOS
   ========================================================= */

// Lê os campos configurados para compor a saída de falhas.
function FL_readFields(
  table:
    ExcelScript.Table
): FL_FieldConfig[] {

  const rows =
    FL_getTableRows(
      table
    );

  return rows
    .map(
      row => ({
        order:
          Number(
            row[
            "Ordem"
            ] ?? 0
          ),

        field:
          String(
            row[
            "Campo"
            ] ?? ""
          ).trim(),

        active:
          FL_isYes(
            row[
            "Ativo"
            ]
          )
      })
    )
    .filter(
      row =>
        row.field !== "" &&
        row.order > 0
    );

}

/* =========================================================
   RESPONSABILIDADES
   ========================================================= */

// Lê o mapeamento entre categoria da falha e responsabilidade.
function FL_readResponsibilities(
  table:
    ExcelScript.Table |
    undefined
): Map<
  string,
  string
> {

  const map =
    new Map<
      string,
      string
    >();

  if (
    !table
  ) {

    return map;

  }

  const rows =
    FL_getTableRows(
      table
    );

  for (
    const row of
    rows
  ) {

    const category =
      String(
        row[
        "Categoria"
        ] ?? ""
      ).trim();

    const responsibility =
      String(
        row[
        "Responsabilidade"
        ] ?? ""
      ).trim();

    if (
      category
    ) {

      map.set(
        FL_normalize(
          category
        ),
        responsibility
      );

    }

  }

  return map;

}

/* =========================================================
   PLANKEYS
   ========================================================= */

// Valida se as chaves dos Test Plans estão preenchidas e não se repetem.
function FL_validatePlanKeys(
  plans:
    FL_PlanConfig[]
): void {

  const keys =
    new Set<string>();

  for (
    const plan of
    plans
  ) {

    const key =
      FL_normalize(
        plan.planKey
      );

    if (
      keys.has(
        key
      )
    ) {

      throw new Error(
        `PlanKey duplicado em tbScriptTestPlans: "${plan.planKey}".`
      );

    }

    keys.add(
      key
    );

  }

}

/* =========================================================
   STATUS
   ========================================================= */

// Localiza a tabela de status usada para acompanhar a execução do script.
function FL_getOptionalStatusContext(
  workbook:
    ExcelScript.Workbook,

  tableName:
    string
): FL_StatusContext |
  undefined {

  const table =
    workbook.getTable(
      tableName
    );

  if (
    !table
  ) {

    return undefined;

  }

  const range =
    table
      .getRangeBetweenHeaderAndTotal();

  const values =
    range.getValues();

  const index:
    {
      [key: string]:
      number
    } = {};

  for (
    let row = 0;
    row < values.length;
    row++
  ) {

    const key =
      FL_normalize(
        String(
          values[
          row
          ][
          0
          ] ?? ""
        )
      );

    if (
      key
    ) {

      index[
        key
      ] =
        row;

    }

  }

  return {
    range,
    index
  };

}

// Atualiza um indicador na tabela de status do script.
function FL_setStatus(
  context:
    FL_StatusContext |
    undefined,

  key:
    string,

  value:
    FL_CellValue
): void {

  if (
    !context
  ) {

    return;

  }

  try {

    const row =
      context.index[
      FL_normalize(
        key
      )
      ];

    if (
      row === undefined
    ) {

      return;

    }

    context
      .range
      .getCell(
        row,
        1
      )
      .setValue(
        value
      );

  }
  catch (
  error
  ) {

    console.log(
      `Não foi possível atualizar o status "${key}": ${FL_formatError(error)}`
    );

  }

}

/* =========================================================
   TABLE HELPERS
   ========================================================= */

// Obtém uma tabela obrigatória e gera erro se ela não existir.
function FL_getRequiredTable(
  workbook:
    ExcelScript.Workbook,

  tableName:
    string
): ExcelScript.Table {

  const table =
    workbook.getTable(
      tableName
    );

  if (
    !table
  ) {

    throw new Error(
      `Tabela "${tableName}" não encontrada.`
    );

  }

  return table;

}

// Converte as linhas de uma tabela do Excel em objetos chave/valor.
function FL_getTableRows(
  table:
    ExcelScript.Table
): {
  [key: string]:
  FL_CellValue
}[] {

  const headers =
    table
      .getHeaderRowRange()
      .getTexts()[
    0
    ];

  const bodyRange =
    table
      .getRangeBetweenHeaderAndTotal();

  const values =
    bodyRange
      .getValues();

  const rows:
    {
      [key: string]:
      FL_CellValue
    }[] = [];

  for (
    let rowIndex = 0;
    rowIndex < values.length;
    rowIndex++
  ) {

    const row:
      {
        [key: string]:
        FL_CellValue
      } = {};

    for (
      let columnIndex = 0;
      columnIndex < headers.length;
      columnIndex++
    ) {

      row[
        String(
          headers[
          columnIndex
          ]
        )
      ] =
        FL_toCellValue(
          values[
          rowIndex
          ][
          columnIndex
          ]
        );

    }

    rows.push(
      row
    );

  }

  return rows;

}

// Retorna a primeira linha disponível de uma tabela de configuração.
function FL_getFirstRow(
  table:
    ExcelScript.Table
): {
  [key: string]:
  FL_CellValue
} {

  const rows =
    FL_getTableRows(
      table
    );

  if (
    rows.length ===
    0
  ) {

    throw new Error(
      `Tabela "${table.getName()}" não possui dados.`
    );

  }

  return rows[
    0
  ];

}

// Converte uma tabela de chave/valor em um mapa de configuração.
function FL_getKeyValueMap(
  table:
    ExcelScript.Table,

  keyColumn:
    string,

  valueColumn:
    string
): Map<
  string,
  FL_CellValue
> {

  const map =
    new Map<
      string,
      FL_CellValue
    >();

  for (
    const row of
    FL_getTableRows(
      table
    )
  ) {

    const key =
      FL_normalize(
        String(
          row[
          keyColumn
          ] ?? ""
        )
      );

    if (
      key
    ) {

      map.set(
        key,
        row[
        valueColumn
        ] ?? ""
      );

    }

  }

  return map;

}

/* =========================================================
   IDENTIDADES
   ========================================================= */

// Converte uma identidade do Azure em texto legível.
function FL_identityToText(
  value:
    unknown
): string {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }

  if (
    typeof value ===
    "string" ||
    typeof value ===
    "number" ||
    typeof value ===
    "boolean"
  ) {

    return String(
      value
    );

  }

  if (
    typeof value ===
    "object"
  ) {

    const identity =
      value as {
        displayName?:
        string;

        uniqueName?:
        string;

        name?:
        string;
      };

    return String(
      identity.displayName ??
      identity.uniqueName ??
      identity.name ??
      ""
    );

  }

  return "";

}

/* =========================================================
   WIT FIELD -> EXCEL
   ========================================================= */

// Converte um campo de Work Item em valor compatível com célula.
function FL_workItemFieldToCell(
  value:
    unknown
): FL_CellValue {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }

  if (
    typeof value ===
    "string" ||
    typeof value ===
    "number" ||
    typeof value ===
    "boolean"
  ) {

    return value;

  }

  return FL_identityToText(
    value
  );

}

/* =========================================================
   DATAS
   ========================================================= */

// Formata uma data do Azure em texto legível para a planilha.
function FL_formatAzureDate(
  value:
    unknown
): string {

  if (
    value === null ||
    value === undefined ||
    String(
      value
    )
      .trim() ===
    ""
  ) {

    return "";

  }

  const date =
    new Date(
      String(
        value
      )
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }

  return date.toLocaleString(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit"
    }
  );

}

/* =========================================================
   CELL VALUE
   ========================================================= */

// Converte qualquer valor em um tipo aceito por célula do Excel.
function FL_toCellValue(
  value:
    unknown
): FL_CellValue {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }

  if (
    typeof value ===
    "string" ||
    typeof value ===
    "number" ||
    typeof value ===
    "boolean"
  ) {

    return value;

  }

  return String(
    value
  );

}

/* =========================================================
   SIM / NÃO
   ========================================================= */

// Interpreta valores como SIM/YES/TRUE/1 como verdadeiro.
function FL_isYes(
  value:
    unknown
): boolean {

  const text =
    FL_normalize(
      String(
        value ??
        ""
      )
    );

  return (
    text === "sim" ||
    text === "yes" ||
    text === "true" ||
    text === "1"
  );

}

/* =========================================================
   NORMALIZAÇÃO
   ========================================================= */

// Normaliza texto removendo acentos, espaços extras e diferenças de caixa.
function FL_normalize(
  value:
    string
): string {

  return String(
    value ??
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();

}

// Verifica se uma lista contém um texto após normalização.
function FL_containsNormalized(
  values:
    string[],

  expected:
    string
): boolean {

  const target =
    FL_normalize(
      expected
    );

  return values.some(
    value =>
      FL_normalize(
        value
      ) ===
      target
  );

}

// Localiza o índice de um texto em uma lista após normalização.
function FL_findNormalizedIndex(
  values:
    string[],

  expected:
    string
): number {

  const target =
    FL_normalize(
      expected
    );

  return values.findIndex(
    value =>
      FL_normalize(
        value
      ) ===
      target
  );

}

/* =========================================================
   ERROS
   ========================================================= */

// Converte qualquer erro recebido em uma mensagem legível.
function FL_formatError(
  error:
    unknown
): string {

  return PQ_formatUnknownError(error);

}

/* =================== CONTROLE DE EXECUÇÕES ==================== */

type EX_CellValue = string | number | boolean;
type EX_DataRow = { [key: string]: EX_CellValue };

const EX_SUITE_CONCURRENCY = 4;
const EX_EXCEL_WRITE_BATCH_SIZE = 200;
const EX_STATUS_EVERY_SUITES = 10;

/*
 * Senha da proteção da aba de destino.
 * Mantida igual ao Controle de Falhas que já funcionou.
 */
const EX_SHEET_PROTECTION_PASSWORD = "2565";

interface EX_AzureConfig {
  organization: string;
  project: string;
  apiVersion: string;
  pat: string;
}

interface EX_PlanConfig {
  planKey: string;
  planId: number;
  planName: string;
  suiteNameFilter: string;
  maxSuites: number;
}

interface EX_DestinationConfig {
  sheetName: string;
  startRow: number;
  tableName: string;
  clearBefore: boolean;
  createHeader: boolean;
}

interface EX_FieldConfig {
  order: number;
  field: string;
  active: boolean;
}

interface EX_HierarchyConfig {
  order: number;
  columnName: string;
  sourceLevel: string;
  active: boolean;
}

interface EX_IdentityRef {
  id?: string;
  displayName?: string;
  uniqueName?: string;
}

interface EX_ShallowReference {
  id?: string | number;
  name?: string;
  url?: string;
}

interface EX_WorkItemReference {
  id?: string | number;
  name?: string;
  type?: string;
  url?: string;
  webUrl?: string;
}

interface EX_WorkItemPropertyValue {
  key?: string;
  value?: unknown;
}

interface EX_WorkItemProperty {
  workItem?: EX_WorkItemPropertyValue;
}

interface EX_LastResultDetails {
  dateCompleted?: string;
  duration?: number;
  runBy?: EX_IdentityRef;
}

interface EX_TestPoint {
  id?: number;

  assignedTo?: EX_IdentityRef;
  configuration?: EX_ShallowReference;

  lastTestRun?: EX_ShallowReference;
  lastResult?: EX_ShallowReference;
  lastResultDetails?: EX_LastResultDetails;

  lastUpdatedDate?: string;
  lastUpdatedBy?: EX_IdentityRef;

  outcome?: string;
  state?: string;

  suite?: EX_ShallowReference;
  testCase?: EX_WorkItemReference;
  testPlan?: EX_ShallowReference;

  workItemProperties?: EX_WorkItemProperty[];
}

interface EX_TestSuite {
  id?: number;
  name?: string;

  parentSuite?: EX_ShallowReference;
  children?: EX_TestSuite[];

  hasChildren?: boolean;
}

interface EX_AzureListResponse<T> {
  count?: number;
  value?: T[];
}

interface EX_SuitePath {
  suite: EX_TestSuite;
  path: EX_TestSuite[];
}

interface EX_ResolvedHierarchy {
  frente: string;
  onda: string;
  atalho: string;

  suiteId: number;
  suiteName: string;

  additional: {
    [key: string]: string;
  };
}

interface EX_PlanExecutionLoad {
  plan: EX_PlanConfig;
  rows: EX_DataRow[];
  suitesProcessed: number;
  pointsReturned: number;
}

interface EX_CombinedOutput {
  headers: string[];
  rows: EX_CellValue[][];
  visualHeaderBodyIndexes: number[];
}

interface EX_StatusContext {
  range: ExcelScript.Range;

  index: {
    [key: string]: number;
  };
}

/* =========================================================
   MAIN
   ========================================================= */

// Orquestra o Controle de Execuções: configuração, validação, coleta, tratamento, consolidação e gravação.
async function runAtualizarExecucoesAzure(
  workbook: ExcelScript.Workbook
): Promise<void> {

  const TABLES = {
    azure: "tbScriptAzureDevOps",
    plans: "tbScriptTestPlans",
    hierarchy: "tbScriptHierarquiaSuites",
    destination: "tbScriptExecucoesDestino",
    fields: "tbScriptExecucoesCampos",
    status: "tbScriptStatusExecucoes"
  };

  const statusContext =
    EX_getOptionalStatusContext(
      workbook,
      TABLES.status
    );

  let protectedWorksheet:
    ExcelScript.Worksheet | undefined;

  let protectionWasPaused = false;

  try {

    EX_setStatus(
      statusContext,
      "Status",
      "INICIANDO"
    );

    /* =====================================================
       CONFIGURAÇÕES
       ===================================================== */

    // Lê a configuração de acesso ao Azure.
    const azure =
      EX_readAzureConfig(
        EX_getRequiredTable(
          workbook,
          TABLES.azure
        )
      );

    // Lê os Test Plans ativos configurados na planilha.
    const plans =
      EX_readPlans(
        EX_getRequiredTable(
          workbook,
          TABLES.plans
        )
      );

    // Lê como os níveis de suíte serão convertidos em Frente, Onda e Atalho.
    const hierarchy =
      EX_readHierarchy(
        EX_getRequiredTable(
          workbook,
          TABLES.hierarchy
        )
      );

    // Lê onde e como o Controle de Execuções será gravado.
    const destination =
      EX_readDestination(
        EX_getRequiredTable(
          workbook,
          TABLES.destination
        )
      );

    // Lê os campos configurados para a saída de execuções.
    const fieldConfigs =
      EX_readFields(
        EX_getRequiredTable(
          workbook,
          TABLES.fields
        )
      );

    /* =====================================================
       VALIDAÇÕES
       ===================================================== */

    if (plans.length === 0) {
      throw new Error(
        'Nenhum Test Plan está ativo em "tbScriptTestPlans".'
      );
    }

    EX_validatePlanKeys(plans);

    if (!destination.clearBefore) {
      throw new Error(
        'Para este motor, "LimparAntes" precisa estar como SIM em tbScriptExecucoesDestino.'
      );
    }

    if (!destination.createHeader) {
      throw new Error(
        'Para este motor, "CriarCabecalho" precisa estar como SIM em tbScriptExecucoesDestino.'
      );
    }

    // Monta a lista final de colunas da base de execuções.
    const outputFields =
      EX_buildOutputFields(
        fieldConfigs,
        hierarchy
      );

    if (outputFields.length === 0) {
      throw new Error(
        "Nenhum campo de saída está ativo."
      );
    }

    if (
      plans.length > 1 &&
      !EX_containsNormalized(
        outputFields,
        "PlanKey"
      )
    ) {
      throw new Error(
        "Com mais de um Test Plan ativo, PlanKey precisa estar habilitado."
      );
    }

    // Gera a autenticação usada nas chamadas ao Azure.
    const authorization =
      EX_buildAuthorization(
        azure.pat
      );

    /* =====================================================
       CARREGA TODOS OS PLANOS PRIMEIRO
       ===================================================== */

    // Armazena os registros coletados de cada Test Plan.
    const planLoads: EX_PlanExecutionLoad[] = [];

    for (
      let planIndex = 0;
      planIndex < plans.length;
      planIndex++
    ) {

      const plan =
        plans[planIndex];

      EX_setStatus(
        statusContext,
        "Status",
        `LENDO SUÍTES - ${plan.planKey}`
      );

      // Executa a coleta completa de suítes e Test Points do plano atual.
      const load =
        await EX_loadPlanExecutions(
          azure,
          plan,
          hierarchy,
          authorization,
          statusContext,
          planIndex + 1,
          plans.length
        );

      planLoads.push(load);

      console.log(
        `${plan.planKey}: ${load.rows.length} registros coletados.`
      );

    }

    /* =====================================================
       CONSOLIDA
       ===================================================== */

    // Consolida os registros de todos os Test Plans em uma única saída.
    const output =
      EX_buildCombinedOutput(
        planLoads,
        outputFields
      );

    EX_setStatus(
      statusContext,
      "Status",
      "PREPARANDO GRAVAÇÃO"
    );

    /* =====================================================
       PAUSA TEMPORARIAMENTE A PROTEÇÃO DA ABA DESTINO
       ===================================================== */

    // Obtém a aba de destino antes de liberar a escrita.
    protectedWorksheet =
      EX_getOrCreateWorksheet(
        workbook,
        destination.sheetName
      );

    // Pausa a proteção somente quando a aba está protegida.
    protectionWasPaused =
      EX_pauseWorksheetProtection(
        protectedWorksheet,
        EX_SHEET_PROTECTION_PASSWORD
      );

    EX_setStatus(
      statusContext,
      "Status",
      "GRAVANDO EXCEL"
    );

    /* =====================================================
       GRAVA
       ===================================================== */

    // Grava a base consolidada em Controle_Execucoes.
    EX_replaceUnifiedOutput(
      workbook,
      destination,
      output
    );

    const totalRecords =
      planLoads.reduce(
        (sum, load) =>
          sum + load.rows.length,
        0
      );

    EX_setStatus(
      statusContext,
      "Status",
      "CONCLUÍDO"
    );

    EX_setStatus(
      statusContext,
      "ÚltimaAtualização",
      new Date().toLocaleString(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo"
        }
      )
    );

    EX_setStatus(
      statusContext,
      "RegistrosRetornados",
      totalRecords
    );

    EX_setStatus(
      statusContext,
      "ColunasSolicitadas",
      outputFields.length
    );

    EX_setStatus(
      statusContext,
      "ColunasEncontradas",
      outputFields.length
    );

    EX_setStatus(
      statusContext,
      "ColunasNãoEncontradas",
      "-"
    );

    console.log(
      `Concluído. ${totalRecords} registros; ` +
      `${outputFields.length} colunas.`
    );

  }
  catch (error) {

    const message =
      EX_formatError(error);

    EX_setStatus(
      statusContext,
      "Status",
      `ERRO: ${message}`
    );

    console.log(
      `ERRO CRÍTICO: ${message}`
    );

    throw error;

  }
  finally {

    /*
     * Se a proteção foi pausada, ela é retomada mesmo se
     * ocorrer erro durante a gravação.
     */
    if (
      protectionWasPaused &&
      protectedWorksheet
    ) {

      try {

        EX_resumeWorksheetProtection(
          protectedWorksheet
        );

        console.log(
          `Proteção da aba "${protectedWorksheet.getName()}" retomada.`
        );

      }
      catch (protectionError) {

        console.log(
          `ATENÇÃO: não foi possível retomar a proteção da aba ` +
          `"${protectedWorksheet.getName()}": ` +
          `${EX_formatError(protectionError)}`
        );

      }

    }

  }

}

/* =========================================================
   PROTEÇÃO TEMPORÁRIA DA ABA
   ========================================================= */

// Obtém a aba de destino ou cria a aba caso ela não exista.
function EX_getOrCreateWorksheet(
  workbook: ExcelScript.Workbook,
  sheetName: string
): ExcelScript.Worksheet {

  let worksheet =
    workbook.getWorksheet(
      sheetName
    );

  if (!worksheet) {

    worksheet =
      workbook.addWorksheet(
        sheetName
      );

  }

  return worksheet;

}

// Pausa temporariamente a proteção da aba para permitir a gravação.
function EX_pauseWorksheetProtection(
  worksheet: ExcelScript.Worksheet,
  password: string
): boolean {

  const protection =
    worksheet.getProtection();

  /*
   * Se a aba não estiver protegida, o script continua
   * normalmente e não tenta retomá-la no final.
   */
  if (
    !protection.getProtected()
  ) {

    console.log(
      `Aba "${worksheet.getName()}" não está protegida.`
    );

    return false;

  }

  /*
   * Valida a senha usando o próprio mecanismo do Excel
   * antes de pausar a proteção.
   */
  const passwordIsValid =
    protection.checkPassword(
      password
    );

  if (
    !passwordIsValid
  ) {

    throw new Error(
      `A senha configurada no script não foi aceita pela proteção da aba "${worksheet.getName()}".`
    );

  }

  protection.pauseProtection(
    password
  );

  console.log(
    `Proteção da aba "${worksheet.getName()}" pausada para atualização.`
  );

  return true;

}

// Retoma a proteção original da aba após a atualização.
function EX_resumeWorksheetProtection(
  worksheet: ExcelScript.Worksheet
): void {

  const protection =
    worksheet.getProtection();

  protection.resumeProtection();

}

/* =========================================================
   CARREGAMENTO DE UM TEST PLAN
   ========================================================= */

// Carrega todas as execuções de um Test Plan, percorrendo suas suítes.
async function EX_loadPlanExecutions(
  azure: EX_AzureConfig,
  plan: EX_PlanConfig,
  hierarchy: EX_HierarchyConfig[],
  authorization: string,
  statusContext: EX_StatusContext | undefined,
  planPosition: number,
  planCount: number
): Promise<EX_PlanExecutionLoad> {

  const suiteTree =
    await EX_getSuiteTree(
      azure,
      plan.planId,
      authorization
    );

  /*
   * IMPORTANTE:
   *
   * flattenSuiteTree já remove a Root Suite
   * da hierarquia.
   *
   * Isso faz:
   *
   * UAT
   * Nivel 1 = Testes Homologação
   * Nivel 2 = GEDEV / GEATE / ...
   * Nivel 3 = Onda
   * Ultimo  = Processo
   *
   * EndToEnd
   * Nivel 1 = Onda
   * Nivel 2 = Processo
   * Nivel 3 = inexistente
   */
  let suitePaths =
    EX_flattenSuiteTree(
      suiteTree
    );

  /*
   * Só processamos caminhos a partir
   * do nível 2.
   *
   * Evita processar apenas:
   * - Testes Homologação
   * - Onda 1
   * - etc.
   */
  suitePaths =
    suitePaths.filter(
      item =>
        item.path.length >= 2
    );

  /* =====================================================
     FILTRO OPCIONAL
     ===================================================== */

  if (
    plan.suiteNameFilter.trim() !== ""
  ) {

    const filter =
      EX_normalize(
        plan.suiteNameFilter
      );

    suitePaths =
      suitePaths.filter(
        item =>
          EX_normalize(
            String(
              item.suite.name ?? ""
            )
          ).includes(
            filter
          )
      );

  }

  /* =====================================================
     LIMITE OPCIONAL
     ===================================================== */

  if (
    plan.maxSuites > 0
  ) {

    suitePaths =
      suitePaths.slice(
        0,
        plan.maxSuites
      );

  }

  console.log(
    `${plan.planKey}: ` +
    `${suitePaths.length} suítes para processar.`
  );

  /* =====================================================
     TEST POINTS
     ===================================================== */

  const rows: EX_DataRow[] = [];

  let processedSuites = 0;
  let pointsReturned = 0;

  for (
    let start = 0;
    start < suitePaths.length;
    start += EX_SUITE_CONCURRENCY
  ) {

    const batch =
      suitePaths.slice(
        start,
        Math.min(
          start + EX_SUITE_CONCURRENCY,
          suitePaths.length
        )
      );

    const promises =
      batch.map(
        suitePath =>
          EX_loadSuiteExecutions(
            azure,
            plan,
            hierarchy,
            suitePath,
            authorization
          )
      );

    const resultBatches =
      await Promise.all(
        promises
      );

    for (
      const result of resultBatches
    ) {

      rows.push(
        ...result
      );

      pointsReturned +=
        result.length;

    }

    processedSuites +=
      batch.length;

    if (
      processedSuites %
      EX_STATUS_EVERY_SUITES === 0 ||
      processedSuites >=
      suitePaths.length
    ) {

      EX_setStatus(
        statusContext,
        "Status",
        `PLANO ${planPosition}/${planCount} - ` +
        `${plan.planKey}: ` +
        `${processedSuites}/${suitePaths.length} SUÍTES`
      );

    }

  }

  console.log(
    `${plan.planKey}: ` +
    `${pointsReturned} registros coletados.`
  );

  return {
    plan,
    rows,
    suitesProcessed:
      processedSuites,
    pointsReturned
  };

}

/* =========================================================
   TEST POINTS DA SUÍTE
   ========================================================= */

// Busca os Test Points de uma suíte e transforma cada ponto em um registro.
async function EX_loadSuiteExecutions(
  azure: EX_AzureConfig,
  plan: EX_PlanConfig,
  hierarchy: EX_HierarchyConfig[],
  suitePath: EX_SuitePath,
  authorization: string
): Promise<EX_DataRow[]> {

  const actualSuite =
    suitePath.suite;

  const actualSuiteId =
    Number(
      actualSuite.id ?? 0
    );

  if (!actualSuiteId) {
    return [];
  }

  const points =
    await EX_getTestPoints(
      azure,
      plan.planId,
      actualSuiteId,
      authorization
    );

  if (points.length === 0) {
    return [];
  }

  const resolvedHierarchy =
    EX_resolveHierarchy(
      suitePath.path,
      hierarchy
    );

  const rows: EX_DataRow[] = [];

  for (
    const point of points
  ) {

    rows.push(
      EX_buildExecutionRecord(
        azure,
        plan,
        resolvedHierarchy,
        point
      )
    );

  }

  return rows;

}

/* =========================================================
   RESOLVE HIERARQUIA
   ========================================================= */

// Converte o caminho da suíte em Frente, Onda, Atalho e demais níveis configurados.
function EX_resolveHierarchy(
  path: EX_TestSuite[],
  hierarchyConfigs: EX_HierarchyConfig[]
): EX_ResolvedHierarchy {

  const additional: {
    [key: string]: string;
  } = {};

  const activeHierarchy =
    hierarchyConfigs
      .filter(
        item =>
          item.active
      )
      .sort(
        (a, b) =>
          a.order - b.order
      );

  for (
    const config of activeHierarchy
  ) {

    const sourceSuite =
      EX_getSuiteByConfiguredLevel(
        path,
        config.sourceLevel
      );

    additional[
      config.columnName
    ] =
      String(
        sourceSuite?.name ?? ""
      ).trim();

  }

  /*
   * SuiteId e SuiteName sempre são
   * a suíte real onde os Test Points estão.
   */
  const leaf =
    path[
    path.length - 1
    ];

  const suiteId =
    Number(
      leaf?.id ?? 0
    );

  const suiteName =
    String(
      leaf?.name ?? ""
    ).trim();

  const frente =
    EX_getAdditionalValue(
      additional,
      "Frente"
    );

  const onda =
    EX_getAdditionalValue(
      additional,
      "Onda"
    );

  const atalho =
    EX_extractAtalho(
      suiteName
    );

  return {
    frente,
    onda,
    atalho,
    suiteId,
    suiteName,
    additional
  };

}

/* =========================================================
   BUSCA NÍVEL DA HIERARQUIA
   ========================================================= */

// Retorna a suíte correspondente ao nível configurado da hierarquia.
function EX_getSuiteByConfiguredLevel(
  path: EX_TestSuite[],
  sourceLevel: string
): EX_TestSuite | undefined {

  const source =
    EX_normalize(
      sourceLevel
    );

  if (
    source ===
    EX_normalize("ULTIMO")
  ) {

    return path[
      path.length - 1
    ];

  }

  const level =
    Number(
      sourceLevel
    );

  if (
    !Number.isFinite(level) ||
    level <= 0
  ) {

    return undefined;

  }

  /*
   * Nível 1 = índice 0
   * Nível 2 = índice 1
   * Nível 3 = índice 2
   */
  return path[
    level - 1
  ];

}

// Busca um valor da hierarquia pelo nome da coluna.
function EX_getAdditionalValue(
  values: {
    [key: string]: string;
  },
  expectedName: string
): string {

  const target =
    EX_normalize(
      expectedName
    );

  for (
    const key of
    Object.keys(values)
  ) {

    if (
      EX_normalize(key) ===
      target
    ) {

      return values[key];

    }

  }

  return "";

}

/* =========================================================
   ATALHO
   ========================================================= */

// Extrai o código do atalho a partir do nome da suíte.
function EX_extractAtalho(
  suiteName: string
): string {

  const text =
    String(
      suiteName ?? ""
    ).trim();

  if (!text) {
    return "";
  }

  const separator =
    " - ";

  const index =
    text.indexOf(
      separator
    );

  if (index < 0) {
    return text;
  }

  return text
    .substring(
      0,
      index
    )
    .trim();

}

/* =========================================================
   MONTA REGISTRO
   ========================================================= */

// Monta a linha final de execução com dados do plano, suíte, Test Point e Test Case.
function EX_buildExecutionRecord(
  azure: EX_AzureConfig,
  plan: EX_PlanConfig,
  hierarchy: EX_ResolvedHierarchy,
  point: EX_TestPoint
): EX_DataRow {

  const testCaseId =
    Number(
      point
        .testCase
        ?.id ?? 0
    );

  const titleValue =
    EX_getWorkItemProperty(
      point,
      "System.Title"
    );

  const stateValue =
    EX_getWorkItemProperty(
      point,
      "System.State"
    );

  const tagsValue =
    EX_getWorkItemProperty(
      point,
      "System.Tags"
    );

  const record: EX_DataRow = {};

  /* =====================================================
     PLANO
     ===================================================== */

  record["PlanKey"] =
    plan.planKey;

  record["PlanId"] =
    plan.planId;

  record["PlanName"] =
    plan.planName;

  /* =====================================================
     HIERARQUIA
     ===================================================== */

  for (
    const key of
    Object.keys(
      hierarchy.additional
    )
  ) {

    record[key] =
      hierarchy.additional[key];

  }

  /*
   * Garante os campos oficiais.
   */
  record["Frente"] =
    hierarchy.frente;

  record["Onda"] =
    hierarchy.onda;

  record["Atalho"] =
    hierarchy.atalho;

  record["SuiteId"] =
    hierarchy.suiteId;

  record["SuiteName"] =
    hierarchy.suiteName;

  /* =====================================================
     TEST POINT
     ===================================================== */

  record["TestPointId"] =
    Number(
      point.id ?? 0
    );

  record["TestCaseId"] =
    testCaseId;

  record["TestCaseTitle"] =
    EX_valueToText(
      titleValue ??
      point
        .testCase
        ?.name ??
      ""
    );

  /*
   * Mantém vazio.
   * Não usa Tags para responsabilidade.
   */
  record["Responsabilidade"] =
    "";

  record["TestCaseState"] =
    EX_valueToText(
      stateValue
    );

  record["TestPointState"] =
    String(
      point.state ?? ""
    );

  record["Outcome"] =
    String(
      point.outcome ?? ""
    ).trim() === "Unspecified"
      ? "Active"
      : String(
        point.outcome ?? ""
      );

  /* =====================================================
     ÚLTIMO RESULTADO
     ===================================================== */

  record["DateCompleted"] =
    String(
      point
        .lastResultDetails
        ?.dateCompleted ?? ""
    );

  record["RunBy"] =
    EX_identityToText(
      point
        .lastResultDetails
        ?.runBy
    );

  record["LastUpdatedDate"] =
    String(
      point
        .lastUpdatedDate ?? ""
    );

  record["LastTestRunId"] =
    EX_referenceIdToCellValue(
      point.lastTestRun
    );

  record["LastResultId"] =
    EX_referenceIdToCellValue(
      point.lastResult
    );

  /* =====================================================
     TEST CASE
     ===================================================== */

  record["TestCaseLink"] =
    EX_getTestCaseLink(
      azure,
      point,
      testCaseId
    );

  record["TestCaseTags"] =
    EX_valueToText(
      tagsValue
    );

  return record;

}

/* =========================================================
   LINK TEST CASE
   ========================================================= */

// Obtém ou monta o link do Test Case no Azure DevOps.
function EX_getTestCaseLink(
  azure: EX_AzureConfig,
  point: EX_TestPoint,
  testCaseId: number
): string {

  const webUrl =
    String(
      point
        .testCase
        ?.webUrl ?? ""
    ).trim();

  if (webUrl) {
    return webUrl;
  }

  if (!testCaseId) {
    return "";
  }

  return (
    `${EX_projectBaseUrl(azure)}` +
    `/_workitems/edit/` +
    `${testCaseId}`
  );

}

/* =========================================================
   PROPRIEDADES DO WORK ITEM
   ========================================================= */

// Busca uma propriedade específica do Work Item retornado no Test Point.
function EX_getWorkItemProperty(
  point: EX_TestPoint,
  referenceName: string
): unknown {

  const properties =
    Array.isArray(
      point.workItemProperties
    )
      ? point.workItemProperties
      : [];

  const expected =
    EX_normalize(
      referenceName
    );

  for (
    const property of properties
  ) {

    const item =
      property.workItem;

    if (!item) {
      continue;
    }

    if (
      EX_normalize(
        String(
          item.key ?? ""
        )
      ) === expected
    ) {

      return item.value;

    }

  }

  return "";

}

/* =========================================================
   ÁRVORE DE SUÍTES
   ========================================================= */

// Consulta no Azure a árvore de suítes de um Test Plan.
async function EX_getSuiteTree(
  azure: EX_AzureConfig,
  planId: number,
  authorization: string
): Promise<EX_TestSuite[]> {

  const url =
    `${EX_projectBaseUrl(azure)}` +
    `/_apis/testplan/Plans/` +
    `${planId}/suites` +
    `?asTreeView=true` +
    `&api-version=` +
    `${encodeURIComponent(
      azure.apiVersion
    )}`;

  const data =
    await EX_azureGet<
      EX_AzureListResponse<EX_TestSuite>
    >(
      url,
      authorization
    );

  return Array.isArray(
    data.value
  )
    ? data.value
    : [];

}

/* =========================================================
   ACHATA ÁRVORE DE SUÍTES

   CORREÇÃO IMPORTANTE:

   A ROOT SUITE DO TEST PLAN NÃO FAZ PARTE
   DOS NÍVEIS CONFIGURADOS.

   Antes estava acontecendo:

   UAT:
   nível 1 = ROOT
   nível 2 = Testes Homologação  <- errado
   nível 3 = GEDEV               <- errado

   Agora:

   nível 1 = Testes Homologação
   nível 2 = GEDEV
   nível 3 = Onda

   EndToEnd:

   nível 1 = Onda
   nível 2 = Processo
   nível 3 = vazio
   ========================================================= */

// Transforma a árvore de suítes em uma lista de caminhos hierárquicos.
function EX_flattenSuiteTree(
  roots: EX_TestSuite[]
): EX_SuitePath[] {

  const output: EX_SuitePath[] = [];

  /*
   * Percorre normalmente a partir
   * de uma suíte que JÁ faz parte
   * da estrutura real.
   */
  // Percorre recursivamente os filhos de cada suíte e registra o caminho completo.
  function walk(
    suite: EX_TestSuite,
    parentPath: EX_TestSuite[]
  ): void {

    const currentPath =
      [
        ...parentPath,
        suite
      ];

    output.push({
      suite,
      path:
        currentPath
    });

    const children =
      Array.isArray(
        suite.children
      )
        ? suite.children
        : [];

    for (
      const child of children
    ) {

      walk(
        child,
        currentPath
      );

    }

  }

  /*
   * A API devolve a Root Suite do plano.
   *
   * NÃO adicionamos essa Root ao path.
   *
   * Começamos diretamente nos filhos dela.
   */
  for (
    const root of roots
  ) {

    const children =
      Array.isArray(
        root.children
      )
        ? root.children
        : [];

    /*
     * Caso excepcional:
     * se a API não trouxer a Root tradicional,
     * usamos o item retornado como primeiro nível.
     */
    if (
      children.length === 0
    ) {

      walk(
        root,
        []
      );

      continue;

    }

    for (
      const child of children
    ) {

      walk(
        child,
        []
      );

    }

  }

  return output;

}

/* =========================================================
   TEST POINTS
   ========================================================= */

// Consulta os Test Points de uma suíte no Azure, tratando paginação.
async function EX_getTestPoints(
  azure: EX_AzureConfig,
  planId: number,
  suiteId: number,
  authorization: string
): Promise<EX_TestPoint[]> {

  const all: EX_TestPoint[] = [];

  const top = 1000;

  let skip = 0;

  const witFields =
    [
      "System.Title",
      "System.State",
      "System.Tags"
    ].join(",");

  while (true) {

    const url =
      `${EX_projectBaseUrl(azure)}` +
      `/_apis/test/Plans/` +
      `${planId}/Suites/` +
      `${suiteId}/points` +
      `?witFields=` +
      `${encodeURIComponent(
        witFields
      )}` +
      `&includePointDetails=true` +
      `&$skip=${skip}` +
      `&$top=${top}` +
      `&api-version=` +
      `${encodeURIComponent(
        azure.apiVersion
      )}`;

    const data =
      await EX_azureGet<
        EX_AzureListResponse<EX_TestPoint>
      >(
        url,
        authorization
      );

    const page =
      Array.isArray(
        data.value
      )
        ? data.value
        : [];

    all.push(
      ...page
    );

    if (
      page.length < top
    ) {
      break;
    }

    skip += top;

  }

  return all;

}

/* =========================================================
   CAMPOS DE SAÍDA
   ========================================================= */

// Monta a lista final de colunas que serão gravadas na tabela de execuções.
function EX_buildOutputFields(
  fieldConfigs: EX_FieldConfig[],
  hierarchyConfigs: EX_HierarchyConfig[]
): string[] {

  const fields =
    fieldConfigs
      .filter(
        item =>
          item.active
      )
      .sort(
        (a, b) =>
          a.order - b.order
      )
      .map(
        item =>
          item.field
      );

  const hierarchyFields =
    hierarchyConfigs
      .filter(
        item =>
          item.active
      )
      .sort(
        (a, b) =>
          a.order - b.order
      )
      .map(
        item =>
          item.columnName
      );

  let insertIndex =
    EX_findNormalizedIndex(
      fields,
      "Atalho"
    );

  if (
    insertIndex < 0
  ) {
    insertIndex =
      fields.length;
  }

  for (
    const hierarchyField of
    hierarchyFields
  ) {

    if (
      EX_containsNormalized(
        fields,
        hierarchyField
      )
    ) {
      continue;
    }

    fields.splice(
      insertIndex,
      0,
      hierarchyField
    );

    insertIndex++;

  }

  return fields;

}

/* =========================================================
   CONSOLIDA PLANOS
   ========================================================= */

// Consolida os registros de todos os Test Plans em uma única saída.
function EX_buildCombinedOutput(
  planLoads: EX_PlanExecutionLoad[],
  outputFields: string[]
): EX_CombinedOutput {

  const rows: EX_CellValue[][] = [];

  const visualHeaderBodyIndexes:
    number[] = [];

  for (
    let planIndex = 0;
    planIndex < planLoads.length;
    planIndex++
  ) {

    const load =
      planLoads[
      planIndex
      ];

    /* Tabela estruturada: sem linhas visuais artificiais entre planos. */

    for (
      const record of load.rows
    ) {

      rows.push(
        outputFields.map(
          field =>
            EX_toCellValue(
              EX_getRecordValue(
                record,
                field
              )
            )
        )
      );

    }

  }

  return {
    headers:
      outputFields,

    rows,

    visualHeaderBodyIndexes
  };

}

/* =========================================================
   BUSCA CAMPO DO RECORD
   ========================================================= */

// Lê um campo de um registro considerando o nome normalizado da coluna.
function EX_getRecordValue(
  record: EX_DataRow,
  field: string
): EX_CellValue {

  if (
    record[field] !==
    undefined
  ) {

    return record[field];

  }

  const expected =
    EX_normalize(
      field
    );

  for (
    const key of
    Object.keys(record)
  ) {

    if (
      EX_normalize(key) ===
      expected
    ) {

      return record[key];

    }

  }

  return "";

}

/* =========================================================
   GRAVAÇÃO
   ========================================================= */

// Substitui o conteúdo da tabela de destino pelos dados consolidados.
function EX_replaceUnifiedOutput(
  workbook: ExcelScript.Workbook,
  destination: EX_DestinationConfig,
  output: EX_CombinedOutput
): void {

  let worksheet =
    workbook.getWorksheet(
      destination.sheetName
    );

  if (!worksheet) {

    worksheet =
      workbook.addWorksheet(
        destination.sheetName
      );

  }

  const startRowIndex =
    destination.startRow - 1;

  const startColumnIndex =
    0;

  const headers =
    output.headers;

  if (
    headers.length === 0
  ) {

    throw new Error(
      "Nenhuma coluna foi definida para a saída."
    );

  }

  const bodyRows =
    output.rows.length > 0
      ? output.rows
      : [
        headers.map(
          () => ""
        )
      ];

  const rowCount =
    1 +
    bodyRows.length;

  const columnCount =
    headers.length;

  const targetRange =
    worksheet.getRangeByIndexes(
      startRowIndex,
      startColumnIndex,
      rowCount,
      columnCount
    );

  let table =
    workbook.getTable(
      destination.tableName
    );

  /* =====================================================
     TABELA NOVA
     ===================================================== */

  if (!table) {

    /*
     * Antes de criar, procura uma tabela
     * que já comece exatamente no destino.
     *
     * Isso protege contra o erro:
     * "Uma tabela não pode se sobrepor a outra".
     */
    const existingTables =
      worksheet.getTables();

    for (
      const existing of
      existingTables
    ) {

      const existingRange =
        existing.getRange();

      if (
        existingRange.getRowIndex() ===
        startRowIndex &&
        existingRange.getColumnIndex() ===
        startColumnIndex
      ) {

        table =
          existing;

        break;

      }

    }

  }

  /* =====================================================
     SE REALMENTE NÃO EXISTE
     ===================================================== */

  if (!table) {

    targetRange.clear(
      ExcelScript
        .ClearApplyTo
        .all
    );

    worksheet
      .getRangeByIndexes(
        startRowIndex,
        startColumnIndex,
        1,
        columnCount
      )
      .setValues([
        headers
      ]);

    EX_writeRowsInBatches(
      worksheet,
      startRowIndex + 1,
      startColumnIndex,
      bodyRows,
      columnCount
    );

    table =
      worksheet.addTable(
        targetRange,
        true
      );

    table.setName(
      destination.tableName
    );

  }

  /* =====================================================
     ATUALIZA TABELA EXISTENTE
     ===================================================== */

  else {

    /*
     * Salvaguarda confirmada no laboratório:
     * filtros ativos podem impedir operações estruturais como resize().
     * A proteção da aba já está pausada neste ponto.
     */
    try {
      table.getAutoFilter().clearCriteria();
    } catch (filterError) {
      console.log(
        `ATENÇÃO: não foi possível limpar os filtros da tabela "${table.getName()}": ${EX_formatError(filterError)}`
      );
    }

    /*
     * Não alteramos a linha de totais aqui.
     * Essa operação estrutural era desnecessária para a atualização
     * e pode ser bloqueada em planilhas protegidas.
     */

    const oldRange =
      table.getRange();

    const oldRowIndex =
      oldRange.getRowIndex();

    const oldColumnIndex =
      oldRange.getColumnIndex();

    const oldRowCount =
      oldRange.getRowCount();

    const oldColumnCount =
      oldRange.getColumnCount();

    if (
      oldRowIndex !==
      startRowIndex ||
      oldColumnIndex !==
      startColumnIndex
    ) {

      throw new Error(
        `A tabela "${table.getName()}" existe, ` +
        `mas não começa em A${destination.startRow}.`
      );

    }

    table.resize(
      targetRange
    );

    table
      .getHeaderRowRange()
      .setValues([
        headers
      ]);

    const bodyRange =
      table
        .getRangeBetweenHeaderAndTotal();

    bodyRange.clear(
      ExcelScript
        .ClearApplyTo
        .contents
    );

    EX_writeRowsInBatches(
      worksheet,
      startRowIndex + 1,
      startColumnIndex,
      bodyRows,
      columnCount
    );

    /* ===================================================
       LIMPA LINHAS ANTIGAS
       =================================================== */

    if (
      oldRowCount >
      rowCount
    ) {

      worksheet
        .getRangeByIndexes(
          startRowIndex +
          rowCount,

          startColumnIndex,

          oldRowCount -
          rowCount,

          oldColumnCount
        )
        .clear(
          ExcelScript
            .ClearApplyTo
            .all
        );

    }

    /* ===================================================
       LIMPA COLUNAS ANTIGAS
       =================================================== */

    if (
      oldColumnCount >
      columnCount
    ) {

      worksheet
        .getRangeByIndexes(
          startRowIndex,

          startColumnIndex +
          columnCount,

          Math.min(
            oldRowCount,
            rowCount
          ),

          oldColumnCount -
          columnCount
        )
        .clear(
          ExcelScript
            .ClearApplyTo
            .all
        );

    }

  }

  /* =====================================================
     FORMATAÇÃO
     ===================================================== */

  const finalBody =
    table
      .getRangeBetweenHeaderAndTotal();

  finalBody
    .getFormat()
    .getFont()
    .setBold(false);

  for (
    const bodyIndex of
    output.visualHeaderBodyIndexes
  ) {

    if (
      bodyIndex < 0 ||
      bodyIndex >=
      bodyRows.length
    ) {
      continue;
    }

    worksheet
      .getRangeByIndexes(
        startRowIndex +
        1 +
        bodyIndex,

        startColumnIndex,

        1,

        columnCount
      )
      .getFormat()
      .getFont()
      .setBold(true);

  }

}

/* =========================================================
   ESCRITA EM LOTES
   ========================================================= */

// Grava as linhas no Excel em lotes para reduzir o custo de escrita.
function EX_writeRowsInBatches(
  worksheet: ExcelScript.Worksheet,
  startRowIndex: number,
  startColumnIndex: number,
  rows: EX_CellValue[][],
  columnCount: number
): void {

  for (
    let start = 0;
    start < rows.length;
    start +=
    EX_EXCEL_WRITE_BATCH_SIZE
  ) {

    const batch =
      rows.slice(
        start,
        Math.min(
          start +
          EX_EXCEL_WRITE_BATCH_SIZE,
          rows.length
        )
      );

    worksheet
      .getRangeByIndexes(
        startRowIndex +
        start,

        startColumnIndex,

        batch.length,

        columnCount
      )
      .setValues(
        batch
      );

  }

}

/* =========================================================
   HTTP
   ========================================================= */

async function EX_azureGet<T>(
  url: string,
  authorization: string
): Promise<T> {

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          Authorization:
            authorization,

          Accept:
            "application/json"
        }
      }
    );

  if (!response.ok) {

    const body =
      await EX_safeResponseText(
        response
      );

    if (
      response.status === 429
    ) {

      throw new Error(
        `Azure DevOps retornou HTTP 429. ` +
        `Reduza SUITE_CONCURRENCY de ` +
        `${EX_SUITE_CONCURRENCY} para 2 e execute novamente. ` +
        `${body}`
      );

    }

    throw new Error(
      `GET ${url} falhou com ` +
      `HTTP ${response.status}. ` +
      `${body}`
    );

  }

  return (
    await response.json()
  ) as T;

}

// Obtém o texto da resposta HTTP sem deixar a leitura de erro quebrar o fluxo.
async function EX_safeResponseText(
  response: Response
): Promise<string> {

  try {
    return await response.text();
  }
  catch {
    return "";
  }

}

/* =========================================================
   URL
   ========================================================= */

// Monta a URL base do projeto no Azure DevOps.
function EX_projectBaseUrl(
  azure: EX_AzureConfig
): string {

  return (
    `https://dev.azure.com/` +
    `${encodeURIComponent(
      azure.organization
    )}/` +
    `${encodeURIComponent(
      azure.project
    )}`
  );

}

/* =========================================================
   AUTH
   ========================================================= */

// Monta o cabeçalho de autenticação Basic usando o PAT configurado.
function EX_buildAuthorization(
  pat: string
): string {

  return (
    `Basic ` +
    `${btoa(
      `:${pat}`
    )}`
  );

}

/* =========================================================
   CONFIG AZURE
   ========================================================= */

// Lê da tabela de configuração os dados necessários para acessar o Azure.
function EX_readAzureConfig(
  table: ExcelScript.Table
): EX_AzureConfig {

  const row =
    EX_getFirstRow(table);

  const organization =
    String(
      row["Organization"] ?? ""
    ).trim();

  const project =
    String(
      row["Project"] ?? ""
    ).trim();

  const apiVersion =
    String(
      row["ApiVersion"] ?? "7.1"
    ).trim() ||
    "7.1";

  const pat =
    String(
      row["PAT"] ?? ""
    ).trim();

  if (!organization) {
    throw new Error(
      "Organization não preenchida em tbScriptAzureDevOps."
    );
  }

  if (!project) {
    throw new Error(
      "Project não preenchido em tbScriptAzureDevOps."
    );
  }

  if (!pat) {
    throw new Error(
      "PAT não preenchido em tbScriptAzureDevOps."
    );
  }

  return {
    organization,
    project,
    apiVersion,
    pat
  };

}

/* =========================================================
   TEST PLANS
   ========================================================= */

// Lê os Test Plans configurados e retorna somente os planos ativos.
function EX_readPlans(
  table: ExcelScript.Table
): EX_PlanConfig[] {

  const rows =
    EX_getTableRows(table);

  const plans:
    EX_PlanConfig[] = [];

  for (
    const row of rows
  ) {

    if (
      !EX_isYes(
        row["Carregar"]
      )
    ) {
      continue;
    }

    const planKey =
      String(
        row["PlanKey"] ?? ""
      ).trim();

    const planId =
      Number(
        row["PlanId"] ?? 0
      );

    const planName =
      String(
        row["PlanName"] ?? ""
      ).trim();

    const suiteNameFilter =
      String(
        row["SuiteNameFilter"] ?? ""
      ).trim();

    const maxSuitesRaw =
      Number(
        row["MaxSuites"] ?? 0
      );

    if (!planKey) {
      throw new Error(
        "Existe Test Plan ativo sem PlanKey."
      );
    }

    if (!planId) {
      throw new Error(
        `PlanId inválido para "${planKey}".`
      );
    }

    plans.push({
      planKey,
      planId,
      planName,
      suiteNameFilter,

      maxSuites:
        Number.isFinite(
          maxSuitesRaw
        ) &&
          maxSuitesRaw > 0
          ? Math.floor(
            maxSuitesRaw
          )
          : 0
    });

  }

  return plans;

}

/* =========================================================
   HIERARQUIA
   ========================================================= */

// Lê a configuração dos níveis de hierarquia das suítes.
function EX_readHierarchy(
  table: ExcelScript.Table
): EX_HierarchyConfig[] {

  const rows =
    EX_getTableRows(table);

  return rows
    .map(
      row => ({
        order:
          Number(
            row["Ordem"] ?? 0
          ),

        columnName:
          String(
            row["NomeColuna"] ?? ""
          ).trim(),

        sourceLevel:
          String(
            row["NivelOrigem"] ?? ""
          ).trim(),

        active:
          EX_isYes(
            row["Ativo"]
          )
      })
    )
    .filter(
      item =>
        item.order > 0 &&
        item.columnName !== ""
    )
    .sort(
      (a, b) =>
        a.order - b.order
    );

}

/* =========================================================
   CAMPOS
   ========================================================= */

// Lê os campos configurados para compor a saída de execuções.
function EX_readFields(
  table: ExcelScript.Table
): EX_FieldConfig[] {

  const rows =
    EX_getTableRows(table);

  return rows
    .map(
      row => ({
        order:
          Number(
            row["Ordem"] ?? 0
          ),

        field:
          String(
            row["Campo"] ?? ""
          ).trim(),

        active:
          EX_isYes(
            row["Ativo"]
          )
      })
    )
    .filter(
      item =>
        item.order > 0 &&
        item.field !== ""
    )
    .sort(
      (a, b) =>
        a.order - b.order
    );

}

/* =========================================================
   DESTINO
   ========================================================= */

// Lê a configuração da aba, tabela e linha onde os dados serão gravados.
function EX_readDestination(
  table: ExcelScript.Table
): EX_DestinationConfig {

  const map =
    EX_getKeyValueMap(
      table,
      "Parâmetro",
      "Valor"
    );

  const sheetName =
    String(
      map.get(
        EX_normalize(
          "AbaDestino"
        )
      ) ?? ""
    ).trim();

  const startRow =
    Number(
      map.get(
        EX_normalize(
          "LinhaInicial"
        )
      ) ?? 0
    );

  const tableName =
    String(
      map.get(
        EX_normalize(
          "NomeTabela"
        )
      ) ?? ""
    ).trim();

  const clearBefore =
    EX_isYes(
      map.get(
        EX_normalize(
          "LimparAntes"
        )
      )
    );

  const createHeader =
    EX_isYes(
      map.get(
        EX_normalize(
          "CriarCabecalho"
        )
      )
    );

  if (!sheetName) {
    throw new Error(
      "AbaDestino não preenchida."
    );
  }

  if (startRow < 1) {
    throw new Error(
      "LinhaInicial inválida."
    );
  }

  if (!tableName) {
    throw new Error(
      "NomeTabela não preenchido."
    );
  }

  return {
    sheetName,
    startRow,
    tableName,
    clearBefore,
    createHeader
  };

}

/* =========================================================
   PLANKEY
   ========================================================= */

// Valida se as chaves dos Test Plans estão preenchidas e não se repetem.
function EX_validatePlanKeys(
  plans: EX_PlanConfig[]
): void {

  const seen =
    new Set<string>();

  for (
    const plan of plans
  ) {

    const key =
      EX_normalize(
        plan.planKey
      );

    if (
      seen.has(key)
    ) {

      throw new Error(
        `PlanKey duplicado: "${plan.planKey}".`
      );

    }

    seen.add(key);

  }

}

/* =========================================================
   STATUS
   ========================================================= */

// Localiza a tabela de status usada para acompanhar a execução do script.
function EX_getOptionalStatusContext(
  workbook: ExcelScript.Workbook,
  tableName: string
): EX_StatusContext | undefined {

  const table =
    workbook.getTable(
      tableName
    );

  if (!table) {
    return undefined;
  }

  const range =
    table
      .getRangeBetweenHeaderAndTotal();

  const values =
    range.getValues();

  const index: {
    [key: string]: number;
  } = {};

  for (
    let row = 0;
    row < values.length;
    row++
  ) {

    const key =
      EX_normalize(
        String(
          values[row][0] ?? ""
        )
      );

    if (key) {
      index[key] =
        row;
    }

  }

  return {
    range,
    index
  };

}

// Atualiza um indicador na tabela de status do script.
function EX_setStatus(
  context: EX_StatusContext | undefined,
  key: string,
  value: EX_CellValue
): void {

  if (!context) {
    return;
  }

  try {

    const row =
      context.index[
      EX_normalize(key)
      ];

    if (
      row === undefined
    ) {
      return;
    }

    context
      .range
      .getCell(
        row,
        1
      )
      .setValue(
        value
      );

  }
  catch (error) {

    console.log(
      `Falha ao atualizar status "${key}": ` +
      `${EX_formatError(error)}`
    );

  }

}

/* =========================================================
   TABELAS
   ========================================================= */

// Obtém uma tabela obrigatória e gera erro se ela não existir.
function EX_getRequiredTable(
  workbook: ExcelScript.Workbook,
  tableName: string
): ExcelScript.Table {

  const table =
    workbook.getTable(
      tableName
    );

  if (!table) {

    throw new Error(
      `Tabela "${tableName}" não encontrada.`
    );

  }

  return table;

}

// Converte as linhas de uma tabela do Excel em objetos chave/valor.
function EX_getTableRows(
  table: ExcelScript.Table
): {
  [key: string]: EX_CellValue;
}[] {

  const headers =
    table
      .getHeaderRowRange()
      .getTexts()[0];

  const bodyRange =
    table
      .getRangeBetweenHeaderAndTotal();

  const values =
    bodyRange.getValues();

  const rows: {
    [key: string]: EX_CellValue;
  }[] = [];

  for (
    let rowIndex = 0;
    rowIndex < values.length;
    rowIndex++
  ) {

    const record: {
      [key: string]: EX_CellValue;
    } = {};

    for (
      let columnIndex = 0;
      columnIndex < headers.length;
      columnIndex++
    ) {

      record[
        String(
          headers[
          columnIndex
          ]
        )
      ] =
        EX_toCellValue(
          values[
          rowIndex
          ][
          columnIndex
          ]
        );

    }

    rows.push(
      record
    );

  }

  return rows;

}

// Retorna a primeira linha disponível de uma tabela de configuração.
function EX_getFirstRow(
  table: ExcelScript.Table
): {
  [key: string]: EX_CellValue;
} {

  const rows =
    EX_getTableRows(table);

  if (
    rows.length === 0
  ) {

    throw new Error(
      `Tabela "${table.getName()}" está vazia.`
    );

  }

  return rows[0];

}

// Converte uma tabela de chave/valor em um mapa de configuração.
function EX_getKeyValueMap(
  table: ExcelScript.Table,
  keyColumn: string,
  valueColumn: string
): Map<string, EX_CellValue> {

  const map =
    new Map<
      string,
      EX_CellValue
    >();

  for (
    const row of
    EX_getTableRows(table)
  ) {

    const key =
      EX_normalize(
        String(
          row[
          keyColumn
          ] ?? ""
        )
      );

    if (!key) {
      continue;
    }

    map.set(
      key,
      row[
      valueColumn
      ] ?? ""
    );

  }

  return map;

}

/* =========================================================
   IDENTIDADE
   ========================================================= */

// Converte uma identidade do Azure em texto legível.
function EX_identityToText(
  value: EX_IdentityRef | undefined
): string {

  if (!value) {
    return "";
  }

  return String(
    value.displayName ??
    value.uniqueName ??
    ""
  );

}

/* =========================================================
   ID DE REFERÊNCIA
   ========================================================= */

// Converte o ID de uma referência do Azure em valor compatível com célula.
function EX_referenceIdToCellValue(
  value: EX_ShallowReference | undefined
): EX_CellValue {

  if (
    !value ||
    value.id === undefined ||
    value.id === null
  ) {
    return "";
  }

  const numeric =
    Number(
      value.id
    );

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }

  return String(
    value.id
  );

}

/* =========================================================
   VALORES
   ========================================================= */

// Converte um valor recebido em texto seguro para gravação.
function EX_valueToText(
  value: unknown
): string {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";

}

// Converte qualquer valor em um tipo aceito por célula do Excel.
function EX_toCellValue(
  value: unknown
): EX_CellValue {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);

}

/* =========================================================
   SIM / NÃO
   ========================================================= */

// Interpreta valores como SIM/YES/TRUE/1 como verdadeiro.
function EX_isYes(
  value: unknown
): boolean {

  const text =
    EX_normalize(
      String(
        value ?? ""
      )
    );

  return (
    text === "sim" ||
    text === "yes" ||
    text === "true" ||
    text === "1"
  );

}

/* =========================================================
   NORMALIZAÇÃO
   ========================================================= */

// Normaliza texto removendo acentos, espaços extras e diferenças de caixa.
function EX_normalize(
  value: string
): string {

  return String(
    value ?? ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();

}

// Verifica se uma lista contém um texto após normalização.
function EX_containsNormalized(
  values: string[],
  expected: string
): boolean {

  const target =
    EX_normalize(
      expected
    );

  return values.some(
    item =>
      EX_normalize(item) ===
      target
  );

}

// Localiza o índice de um texto em uma lista após normalização.
function EX_findNormalizedIndex(
  values: string[],
  expected: string
): number {

  const target =
    EX_normalize(
      expected
    );

  return values.findIndex(
    item =>
      EX_normalize(item) ===
      target
  );

}

/* =========================================================
   ERRO
   ========================================================= */

// Converte qualquer erro recebido em uma mensagem legível.
function EX_formatError(
  error: unknown
): string {

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);

}

/* ====================== AUDIT QA ==================== */

/*
 * AUDIT QA - Atualizar Auditoria V1
 *
 * Objetivo:
 * - Ler tbControle_ExecucoesScript atualizada pelos scripts operacionais.
 * - Regerar tbAuditoria_Mapeamento.
 * - Reaplicar somente as regras V1 ativas em tbAuditoria_Regras.
 * - Regerar tbAuditoria_Resultados.
 * - Atualizar os resumos das abas de auditoria.
 *
 * IMPORTANTE:
 * - O motor é determinístico: não usa IA e não inventa regras.
 * - Regras marcadas como NÃO implementadas não são executadas.
 * - O script limpa filtros das tabelas de saída antes de redimensioná-las.
 */

const AU_TABLE_EXECUCOES = "tbControle_ExecucoesScript";
const AU_TABLE_REGRAS = "tbAuditoria_Regras";
const AU_TABLE_PARAMETROS = "tbAuditoria_Parametros";
const AU_TABLE_MAPEAMENTO = "tbAuditoria_Mapeamento";
const AU_TABLE_RESULTADOS = "tbAuditoria_Resultados";

const AU_SHEET_MAPEAMENTO = "Auditoria_Mapeamento";
const AU_SHEET_RESULTADOS = "Auditoria_Resultados";

const AU_WRITE_BATCH_SIZE = 250;
const AU_SHEET_PROTECTION_PASSWORD = "2565";

type AU_Cell = string | number | boolean;

type AU_RowObject = {
  [key: string]: AU_Cell;
};

interface AU_ExecRecord {
  planKey: string;
  planId: number;
  planName: string;
  frente: string;
  onda: string;
  atalho: string;
  suiteId: number;
  suiteName: string;
  testPointId: number;
  testCaseId: number;
  title: string;
  testCaseState: string;
  testPointState: string;
  outcome: string;
  dateCompleted: string;
  runBy: string;
  lastUpdatedDate: string;
  lastTestRunId: number;
  lastResultId: number;
  link: string;
  tags: string;
}

interface AU_RuleDef {
  id: string;
  category: string;
  name: string;
  severity: string;
  active: boolean;
  implemented: string;
  scope: string;
  observation: string;
}

interface AU_MappingRecord {
  e2e: AU_ExecRecord;
  front: string;
  exactCandidates: AU_ExecRecord[];
  matched?: AU_ExecRecord;
  suggestion?: AU_ExecRecord;
  suggestionSimilarity: number;
  status: string;
  type: string;
  observation: string;
}

interface AU_AuditFinding {
  severity: string;
  rule: string;
  category: string;
  plan: string;
  atalho: string;
  front: string;
  e2eId: number | "";
  uatId: number | "";
  e2eStatus: string;
  e2eOutcome: string;
  uatStatus: string;
  uatOutcome: string;
  problem: string;
  expected: string;
  found: string;
  actionable: string;
  e2eLink: string;
  uatLink: string;
  observation: string;
}

interface AU_TestAttachment {
  id?: number;
  fileName?: string;
  comment?: string;
  size?: number;
  url?: string;
  isDeleted?: boolean;
  state?: string;
  attachmentType?: string;
}

interface AU_TestLogEntry {
  logReference?: {
    filePath?: string;
    type?: string;
  };
  metaData?: {
    [key: string]: unknown;
  };
}

interface AU_AttachmentTarget {
  planId: number;
  runId: number;
  resultId: number;
}

interface AU_AttachmentSnapshot {
  names: string[];
  error: string;
}

interface AU_AttachmentLoad {
  key: string;
  snapshot: AU_AttachmentSnapshot;
}

interface AU_ProtectionState {
  protection: ExcelScript.WorksheetProtection;
  paused: boolean;
}

// Orquestra a auditoria: leitura das bases, mapeamento, regras, consolidação e gravação dos achados.
async function runAtualizarAuditQA(workbook: ExcelScript.Workbook): Promise<void> {
  const started = new Date();

  console.log("=== AUDIT QA - ATUALIZAÇÃO DA AUDITORIA ===");

  // Lê as tabelas que alimentam e controlam o motor de auditoria.
  const execTable = AU_getRequiredTable(workbook, AU_TABLE_EXECUCOES);
  const rulesTable = AU_getRequiredTable(workbook, AU_TABLE_REGRAS);
  const paramsTable = AU_getRequiredTable(workbook, AU_TABLE_PARAMETROS);
  const mapTable = AU_getRequiredTable(workbook, AU_TABLE_MAPEAMENTO);
  const resultsTable = AU_getRequiredTable(workbook, AU_TABLE_RESULTADOS);

  // Obtém as abas onde Mapeamento e Resultados serão atualizados.
  const mapSheet = workbook.getWorksheet(AU_SHEET_MAPEAMENTO);
  const resultsSheet = workbook.getWorksheet(AU_SHEET_RESULTADOS);

  if (!mapSheet || !resultsSheet) {
    throw new Error("As abas de auditoria esperadas não foram encontradas.");
  }

  // Pausa temporariamente a proteção das abas de saída.
  const mapProtection = AU_pauseProtectionIfNeeded(mapSheet, AU_SHEET_PROTECTION_PASSWORD);
  const resultsProtection = AU_pauseProtectionIfNeeded(resultsSheet, AU_SHEET_PROTECTION_PASSWORD);

  try {
    AU_updateParameter(paramsTable, "StatusMotor", "EXECUTANDO");

    // Lê os parâmetros que definem os PlanKeys e valores usados pelas regras.
    const parameters = AU_readParameters(paramsTable);
    const planKeyE2E = AU_getParameter(parameters, "PlanKey_EndToEnd", "EndToEnd");
    const planKeyUAT = AU_getParameter(parameters, "PlanKey_Homologacao", "UAT");
    const activeApiValue = AU_getParameter(parameters, "Active_na_API", "Unspecified");

    console.log(`Planos: E2E=${planKeyE2E} | UAT=${planKeyUAT}`);

    // Carrega Controle_Execucoes e converte cada linha em um registro da auditoria.
    const execRows: AU_ExecRecord[] = [];
    const rawExecRows = AU_getTableRows(execTable);

    for (const row of rawExecRows) {
      const execRecord = AU_rowToExecRecord(row);

      if (execRecord.planKey !== "") {
        execRows.push(execRecord);
      }
    }

    // Separa a base consolidada entre EndToEnd e UAT.
    const e2eRows = execRows.filter(
      (row) => AU_normalizeSimple(row.planKey) === AU_normalizeSimple(planKeyE2E)
    );

    const uatRows = execRows.filter(
      (row) => AU_normalizeSimple(row.planKey) === AU_normalizeSimple(planKeyUAT)
    );

    if (e2eRows.length === 0) {
      throw new Error(`Nenhum registro do plano "${planKeyE2E}" foi encontrado.`);
    }

    if (uatRows.length === 0) {
      throw new Error(`Nenhum registro do plano "${planKeyUAT}" foi encontrado.`);
    }

    console.log(`Execuções lidas: E2E=${e2eRows.length} | UAT=${uatRows.length}`);

    /*
     * Sincroniza a coluna Implementada_V1 com o que esta versão do motor
     * realmente implementa. A coluna Ativa continua sendo respeitada como
     * chave de liga/desliga definida pelo usuário.
     */
    AU_syncImplementedRuleMetadataSafe(rulesTable);

    // Lê somente a configuração atual das regras antes de aplicá-las.
    const rules = AU_readRules(rulesTable);
    const ruleMap = new Map<string, AU_RuleDef>();
    rules.forEach((rule) => ruleMap.set(rule.id, rule));

    const knownFronts = Array.from(
      new Set(
        uatRows
          .map((row) => AU_normalizeFront(row.frente))
          .filter((front) => front !== "")
      )
    ).sort();

    // Cria índices de UAT para acelerar a busca de correspondências.
    const uatExactIndex = AU_buildUatExactIndex(uatRows);
    const uatFrontIndex = AU_buildUatFrontIndex(uatRows);

    console.log(`Frentes reconhecidas: ${knownFronts.join(", ")}`);

    // Relaciona cada cenário E2E aos candidatos correspondentes em UAT.
    const mappings = AU_buildMappings(
      e2eRows,
      knownFronts,
      uatExactIndex,
      uatFrontIndex
    );

    const mappingRows: AU_Cell[][] = [];

    for (const mapping of mappings) {
      mappingRows.push(AU_mappingToOutputRow(mapping));
    }

    // Grava o mapeamento atualizado antes de executar as regras.
    AU_clearTableFilters(mapTable);
    AU_replaceTableData(mapTable, mappingRows, AU_WRITE_BATCH_SIZE);
    AU_updateMappingSummary(mapSheet, mappings);

    console.log(`Mapeamentos gerados: ${mappings.length}`);

    /*
     * Os anexos são consultados somente para pares E2E ↔ UAT já
     * mapeados e ainda acionáveis. O conteúdo dos arquivos NÃO é
     * baixado: comparamos apenas os nomes/títulos dos anexos.
     */
    // Carrega somente os nomes dos anexos necessários para as regras de evidência.
    const attachmentSnapshots =
      await AU_loadAttachmentSnapshots(
        workbook,
        mappings,
        ruleMap
      );

    // Acumula os achados gerados pelas diferentes famílias de regras.
    const rawFindings: AU_AuditFinding[] = [];

    // Aplica as regras de mapeamento, status, paralelismo, Bugs, títulos e evidências.
    // MAP001/PAR004: regras específicas para E2E Closed + NotApplicable.
    AU_auditMappings(mappings, ruleMap, rawFindings);
    AU_auditClosedNotApplicableCoherence(mappings, ruleMap, rawFindings);
    AU_auditE2E(e2eRows, ruleMap, activeApiValue, rawFindings);
    AU_auditUAT(uatRows, ruleMap, activeApiValue, rawFindings);
    AU_auditParallelism(mappings, ruleMap, rawFindings);
    AU_auditTitles(mappings, ruleMap, rawFindings);
    await AU_auditBugTrace(
      workbook,
      execRows,
      ruleMap,
      planKeyE2E,
      planKeyUAT,
      knownFronts,
      rawFindings
    );
    await AU_auditMassInfraParallelism(
      workbook,
      mappings,
      ruleMap,
      rawFindings
    );
    AU_auditAttachmentNames(
      mappings,
      ruleMap,
      attachmentSnapshots,
      rawFindings
    );

    // Remove achados exatamente duplicados antes da gravação final.
    const findings = AU_deduplicateFindings(rawFindings);

    if (findings.length !== rawFindings.length) {
      console.log(
        `Audit QA - deduplicação: ${rawFindings.length - findings.length} ` +
        `achado(s) duplicado(s) removido(s).`
      );
    }

    AU_logFindingBreakdown(findings);

    // Converte os achados finais para o formato da tabela Auditoria_Resultados.
    const resultRows: AU_Cell[][] = [];

    for (const finding of findings) {
      resultRows.push(AU_findingToOutputRow(finding));
    }

    // Grava os achados finais e atualiza o resumo da auditoria.
    AU_clearTableFilters(resultsTable);
    AU_replaceTableData(resultsTable, resultRows, AU_WRITE_BATCH_SIZE);
    AU_updateResultsSummary(resultsSheet, findings);

    // Finaliza o motor registrando status e horário da atualização.
    const finished = new Date();
    const localTimestamp = AU_formatDateTimeBrazil(finished);

    AU_updateParameter(paramsTable, "StatusMotor", "ATUALIZADO");
    AU_updateParameter(paramsTable, "UltimaAtualizacao_Fonte", localTimestamp);
    AU_updateParameter(
      paramsTable,
      "Observacao",
      "Mapeamento e resultados são regenerados pelo script Atualizar_AuditQA com base nas tabelas operacionais atuais."
    );

    console.log(`Achados gerados: ${findings.length}`);
    console.log(`Duração: ${finished.getTime() - started.getTime()} ms`);
    console.log("=== AUDIT QA - CONCLUÍDO ===");
  } catch (error) {
    AU_updateParameterSafe(paramsTable, "StatusMotor", `ERRO: ${AU_formatError(error)}`);
    console.log(`ERRO CRÍTICO: ${AU_formatError(error)}`);
    throw error;
  } finally {
    AU_resumeProtection(mapProtection);
    AU_resumeProtection(resultsProtection);
  }
}

/* =========================================================
   AUDITORIAS
   ========================================================= */

// Aplica as regras relacionadas ao mapeamento entre cenários E2E e UAT.
function AU_auditMappings(
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  findings: AU_AuditFinding[]
): void {
  const ruleMissing = AU_getEnabledRule(rules, "MAP001");
  const ruleAmbiguous = AU_getEnabledRule(rules, "MAP002");

  for (const mapping of mappings) {
    /*
     * Regra dura: cenário UAT já encerrado corretamente nunca pode
     * gerar correção operacional. Ele permanece somente no mapa como
     * registro histórico.
     */
    if (mapping.status === "ENCERRADO UAT") {
      continue;
    }

    if (mapping.status === "SEM CORRESPONDÊNCIA" && ruleMissing) {
      /*
       * E2E Closed + NotApplicable não exige correspondente UAT.
       * A ausência nesse cenário é válida e não deve gerar MAP001.
       */
      if (AU_isClosedNotApplicable(mapping.e2e)) {
        continue;
      }

      const suggestionText = mapping.suggestion
        ? `0 correspondentes. Melhor sugestão: ${mapping.suggestion.testCaseId} - ${mapping.suggestion.title} (${AU_formatPercent(mapping.suggestionSimilarity)})`
        : "0 correspondentes. Nenhuma sugestão encontrada no mesmo Atalho + Frente.";

      findings.push({
        severity: ruleMissing.severity,
        rule: ruleMissing.id,
        category: ruleMissing.category,
        plan: "E2E↔UAT",
        atalho: mapping.e2e.atalho,
        front: mapping.front,
        e2eId: mapping.e2e.testCaseId,
        uatId: "",
        e2eStatus: mapping.e2e.testCaseState,
        e2eOutcome: mapping.e2e.outcome,
        uatStatus: "",
        uatOutcome: "",
        problem: "Não foi encontrado cenário UAT equivalente nesta frente.",
        expected: "1 correspondente por Atalho + Frente + Título normalizado",
        found: suggestionText,
        actionable: "SIM",
        e2eLink: mapping.e2e.link,
        uatLink: "",
        observation: "Pode representar cenário ausente ou título alterado."
      });
    }

    if (mapping.status === "AMBÍGUO" && ruleAmbiguous) {
      const ids = mapping.exactCandidates
        .map((candidate) => String(candidate.testCaseId))
        .join(" | ");

      findings.push({
        severity: ruleAmbiguous.severity,
        rule: ruleAmbiguous.id,
        category: ruleAmbiguous.category,
        plan: "E2E↔UAT",
        atalho: mapping.e2e.atalho,
        front: mapping.front,
        e2eId: mapping.e2e.testCaseId,
        uatId: "",
        e2eStatus: mapping.e2e.testCaseState,
        e2eOutcome: mapping.e2e.outcome,
        uatStatus: "",
        uatOutcome: "",
        problem: "Há múltiplos cenários UAT equivalentes para o mesmo E2E/frente.",
        expected: "1 correspondente único",
        found: `${mapping.exactCandidates.length} candidatos: ${ids}`,
        actionable: "SIM",
        e2eLink: mapping.e2e.link,
        uatLink: "",
        observation: "O motor não escolheu candidato automaticamente."
      });
    }
  }
}

/*
 * PAR004 — Coerência E2E Closed + NotApplicable ↔ UAT
 *
 * Regra de negócio:
 * - E2E Closed + NotApplicable NÃO precisa existir na Homologação (MAP001 suprimido).
 * - Se existir correspondente UAT, ele também deve estar Closed + NotApplicable.
 * - Qualquer outro estado no UAT gera achado PAR004, inclusive terminais divergentes
 *   como Closed + Passed.
 */
function AU_auditClosedNotApplicableCoherence(
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  findings: AU_AuditFinding[]
): void {
  const rule = AU_getEnabledRuleOrDefault(
    rules,
    "PAR004",
    {
      id: "PAR004",
      category: "Paralelismo",
      name: "E2E Closed + NotApplicable exige UAT Closed + NotApplicable quando existir correspondente",
      severity: "ALTA",
      active: true,
      implemented: "SIM",
      scope: "E2E↔UAT",
      observation:
        "Cenários encerrados como NotApplicable no EndToEnd não precisam existir na Homologação. " +
        "Porém, quando existir correspondente UAT, ele também deve estar Closed + NotApplicable."
    }
  );

  if (!rule) {
    return;
  }

  for (const mapping of mappings) {
    if (!AU_isClosedNotApplicable(mapping.e2e)) {
      continue;
    }

    /*
     * Ausência de correspondente UAT é válida para E2E Closed + NotApplicable.
     * MAP001 já foi suprimido nesse cenário.
     */
    if (!mapping.matched) {
      continue;
    }

    if (AU_isClosedNotApplicable(mapping.matched)) {
      continue;
    }

    findings.push(
      AU_parallelFinding(
        rule,
        mapping,
        "Cenário encerrado como NotApplicable no EndToEnd possui correspondente UAT fora de Closed + NotApplicable.",
        "Closed + NotApplicable nos dois planos, ou ausência de correspondente UAT",
        `E2E ${mapping.e2e.testCaseState}/${mapping.e2e.outcome} | UAT ${mapping.matched.testCaseState}/${mapping.matched.outcome}`,
        mapping.status === "ENCERRADO UAT"
          ? "O correspondente UAT está em combinação terminal diferente de Closed + NotApplicable."
          : ""
      )
    );
  }
}

// Aplica as regras de Status e Outcome específicas do EndToEnd.
function AU_auditE2E(
  rows: AU_ExecRecord[],
  rules: Map<string, AU_RuleDef>,
  activeApiValue: string,
  findings: AU_AuditFinding[]
): void {
  const activeOutcomes = new Set([
    AU_normalizeSimple(activeApiValue),
    "active",
    "unspecified"
  ]);

  const finalOutcomes = new Set(["passed", "notapplicable", "not applicable"]);
  const failureOutcomes = new Set(["failed", "blocked"]);

  for (const row of rows) {
    const status = AU_normalizeText(row.testCaseState);
    const outcome = AU_normalizeSimple(row.outcome);

    const e2e001 = AU_getEnabledRule(rules, "E2E001");
    if (e2e001 && status === "qa" && !activeOutcomes.has(outcome)) {
      findings.push(AU_singlePlanFinding(
        e2e001,
        "EndToEnd",
        row,
        true,
        "Status QA possui Outcome incompatível com cenário ativo para execução.",
        `QA + ${activeApiValue} (Active)`,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const e2e002 = AU_getEnabledRule(rules, "E2E002");
    if (
      e2e002 &&
      (status === "bug" || status === "pendencias") &&
      !failureOutcomes.has(outcome)
    ) {
      findings.push(AU_singlePlanFinding(
        e2e002,
        "EndToEnd",
        row,
        true,
        "Status de falha possui Outcome incompatível.",
        `${row.testCaseState} + Failed/Blocked`,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const e2e003 = AU_getEnabledRule(rules, "E2E003");
    if (e2e003 && status === "closed" && !finalOutcomes.has(outcome)) {
      findings.push(AU_singlePlanFinding(
        e2e003,
        "EndToEnd",
        row,
        true,
        "Cenário está Closed sem Outcome final coerente.",
        "Closed + Passed ou Closed + NotApplicable",
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const e2e004 = AU_getEnabledRule(rules, "E2E004");
    if (e2e004 && status === "uat" && outcome !== "passed") {
      findings.push(AU_singlePlanFinding(
        e2e004,
        "EndToEnd",
        row,
        true,
        "Cenário está em UAT no EndToEnd sem Outcome Passed.",
        "UAT + Passed",
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }
  }
}

// Aplica as regras de Status, Outcome e terminalidade da Homologação.
function AU_auditUAT(
  rows: AU_ExecRecord[],
  rules: Map<string, AU_RuleDef>,
  activeApiValue: string,
  findings: AU_AuditFinding[]
): void {
  const activeOutcomes = new Set([
    AU_normalizeSimple(activeApiValue),
    "active",
    "unspecified"
  ]);

  const finalOutcomes = new Set(["passed", "notapplicable", "not applicable"]);

  for (const row of rows) {
    const status = AU_normalizeText(row.testCaseState);
    const outcome = AU_normalizeSimple(row.outcome);

    /*
     * REGRA CENTRAL DE TERMINALIDADE UAT
     *
     * Um cenário já encerrado corretamente NÃO pode voltar para a fila
     * acionável por regras de fluxo. Hoje, por regra de negócio confirmada:
     *
     * - Closed + Passed              => terminal
     * - Closed + NotApplicable       => terminal
     * - Ressalva + Passed            => terminal
     *
     * Qualquer nova combinação terminal deve ser incluída APENAS em
     * AU_isUatTerminal(), evitando regras divergentes espalhadas no código.
     */
    if (AU_isUatTerminal(row)) {
      continue;
    }

    const uat001 = AU_getEnabledRule(rules, "UAT001");
    if (uat001 && status === "closed" && !finalOutcomes.has(outcome)) {
      findings.push(AU_singlePlanFinding(
        uat001,
        "UAT",
        row,
        false,
        "Cenário está Closed sem Outcome final coerente.",
        "Closed + Passed ou Closed + NotApplicable",
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const uat002 = AU_getEnabledRule(rules, "UAT002");
    if (uat002 && finalOutcomes.has(outcome) && !AU_isUatTerminal(row)) {
      let expected = "Combinação terminal válida";

      if (outcome === "passed") {
        expected = "Closed + Passed ou Ressalva + Passed";
      } else if (outcome === "notapplicable" || outcome === "not applicable") {
        expected = "Closed + NotApplicable";
      }

      findings.push(AU_singlePlanFinding(
        uat002,
        "UAT",
        row,
        false,
        "Cenário possui resultado final, mas não está em uma combinação terminal válida.",
        expected,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const uat003 = AU_getEnabledRule(rules, "UAT003");
    if (uat003 && status === "analise bug" && !activeOutcomes.has(outcome)) {
      findings.push(AU_singlePlanFinding(
        uat003,
        "UAT",
        row,
        false,
        "Análise BUG alterou o Outcome da execução.",
        `Análise BUG + ${activeApiValue} (Active no Test Plan)`,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const uat004 = AU_getEnabledRule(rules, "UAT004");
    if (
      uat004 &&
      (status === "design" || status === "nao atribuido") &&
      !activeOutcomes.has(outcome)
    ) {
      findings.push(AU_singlePlanFinding(
        uat004,
        "UAT",
        row,
        false,
        "Cenário não liberado/desenhando possui Outcome de execução incompatível.",
        `${row.testCaseState} + ${activeApiValue} (Active)`,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    const uat005 = AU_getEnabledRule(rules, "UAT005");
    if (uat005 && status === "uat" && !activeOutcomes.has(outcome)) {
      findings.push(AU_singlePlanFinding(
        uat005,
        "UAT",
        row,
        false,
        "Cenário liberado para UAT possui Outcome incompatível.",
        `UAT + ${activeApiValue} (Active)`,
        `${row.testCaseState} + ${row.outcome}`,
        ""
      ));
    }

    /*
     * Regras ainda não formalizadas NÃO são inventadas aqui.
     * Ex.: Ressalva + Unspecified e demais combinações especiais só devem
     * virar achado após regra explícita em Auditoria_Config.
     */
  }
}

// Valida o paralelismo e a coerência entre cenários mapeados de E2E e UAT.
function AU_auditParallelism(
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  findings: AU_AuditFinding[]
): void {
  for (const mapping of mappings) {
    /*
     * REGRA CENTRAL DO AUDIT QA:
     * se a Homologação já foi encerrada corretamente
     * (Closed + Passed/NotApplicable ou Ressalva + Passed), o processo daquela
     * frente já terminou e não deve entrar na fila acionável
     * de comparação E2E ↔ UAT.
     */
    if (!AU_shouldAuditCrossPlan(mapping)) {
      continue;
    }

    if (!mapping.matched) {
      continue;
    }

    const e2e = mapping.e2e;
    const uat = mapping.matched;

    const e2eStatus = AU_normalizeText(e2e.testCaseState);
    const e2eOutcome = AU_normalizeSimple(e2e.outcome);
    const uatStatus = AU_normalizeText(uat.testCaseState);
    const uatOutcome = AU_normalizeSimple(uat.outcome);

    const par001 = AU_getEnabledRule(rules, "PAR001");
    if (
      par001 &&
      e2eStatus === "closed" &&
      !AU_isClosedNotApplicable(e2e) &&
      (uatStatus === "design" || uatStatus === "nao atribuido")
    ) {
      findings.push(AU_parallelFinding(
        par001,
        mapping,
        "EndToEnd está encerrado, mas o cenário correspondente ainda não aparece liberado na Homologação.",
        "Após E2E Closed, UAT não deve permanecer Design/Não atribuído",
        `E2E ${e2e.testCaseState}/${e2e.outcome} | UAT ${uat.testCaseState}/${uat.outcome}`,
        ""
      ));
    }

    const par002 = AU_getEnabledRule(rules, "PAR002");
    if (
      par002 &&
      e2eStatus === "uat" &&
      e2eOutcome === "passed" &&
      (uatStatus === "design" || uatStatus === "nao atribuido")
    ) {
      /*
       * PAR002 trata pendência de liberação na Homologação, não paralelismo
       * de execução. Por isso a categoria do achado é forçada para Liberação.
       */
      const finding = AU_parallelFinding(
        par002,
        mapping,
        "Cenário aprovado no EndToEnd ainda não aparece liberado na Homologação.",
        "E2E UAT/Passed deve possuir correspondente UAT liberado",
        `E2E ${e2e.testCaseState}/${e2e.outcome} | UAT ${uat.testCaseState}/${uat.outcome}`,
        "Pendência de liberação; não significa necessariamente fechamento incorreto."
      );

      finding.category = "Liberação";
      findings.push(finding);
    }

    /*
     * PAR003 não é executada aqui por Status/Outcome isolado.
     * Ela é executada em AU_auditMassInfraParallelism(), onde o próprio
     * BugId de Massa/Infraestrutura funciona como chave causal entre E2E e UAT.
     * Isso evita falso positivo por simples coincidência de Atalho/Frente.
     */
  }
}

/* =========================================================
   AUDITORIA DE TÍTULO
   ========================================================= */

// Compara os títulos dos cenários mapeados entre E2E e UAT.
function AU_auditTitles(
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  findings: AU_AuditFinding[]
): void {
  const rule = AU_getEnabledRuleOrDefault(
    rules,
    "CNT001",
    {
      id: "CNT001",
      category: "Conteúdo",
      name: "Título divergente entre E2E e UAT",
      severity: "MÉDIA",
      active: true,
      implemented: "SIM",
      scope: "E2E↔UAT",
      observation: "Compara títulos apenas quando o vínculo entre os cenários é determinístico."
    }
  );

  if (!rule) {
    return;
  }

  for (const mapping of mappings) {
    if (!AU_shouldAuditCrossPlan(mapping) || !mapping.matched) {
      continue;
    }

    const e2eTitle = AU_normalizeTitle(mapping.e2e.title);
    const uatTitle = AU_normalizeTitle(mapping.matched.title);

    if (e2eTitle === uatTitle) {
      continue;
    }

    findings.push(AU_parallelFinding(
      rule,
      mapping,
      "O título do cenário diverge entre EndToEnd e Homologação.",
      `Mesmo título normalizado nos dois planos. E2E: "${mapping.e2e.title}"`,
      `UAT: "${mapping.matched.title}"`,
      `Vínculo: ${mapping.type}. Similaridade informativa: ${AU_formatPercent(mapping.suggestionSimilarity)}.`
    ));
  }
}

/* =========================================================
   AUDITORIA DE RASTREABILIDADE DE BUG
   ========================================================= */

// Valida a rastreabilidade de Bugs nos Runs/Results atuais dos cenários.
async function AU_auditBugTrace(
  workbook: ExcelScript.Workbook,
  rows: AU_ExecRecord[],
  rules: Map<string, AU_RuleDef>,
  planKeyE2E: string,
  planKeyUAT: string,
  knownFronts: string[],
  findings: AU_AuditFinding[]
): Promise<void> {
  const ruleBugTrace = AU_getEnabledRuleOrDefault(
    rules,
    "BUG001",
    {
      id: "BUG001",
      category: "Rastreabilidade BUG",
      name: "BUG de desenvolvimento no E2E deve possuir Bug associado",
      severity: "CRÍTICA",
      active: true,
      implemented: "SIM",
      scope: "EndToEnd",
      observation:
        "Valida somente EndToEnd em Status BUG + Failed/Blocked. O resultado atual precisa possuir pelo menos 1 Bug associado. Bugs de Massa/Infraestrutura são tratados separadamente pela PAR003."
    }
  );

  const ruleClosedBug = AU_getEnabledRuleOrDefault(
    rules,
    "BUG002",
    {
      id: "BUG002",
      category: "Rastreabilidade BUG",
      name: "Bug Closed não pode manter a execução atual Failed/Blocked",
      severity: "ALTA",
      active: true,
      implemented: "SIM",
      scope: "E2E/UAT",
      observation:
        "Só aponta quando o resultado atual possui Bug(s), todos os estados são conhecidos e TODOS os Bugs associados estão Closed."
    }
  );

  if (!ruleBugTrace && !ruleClosedBug) {
    return;
  }

  let missingDevelopmentBugFindings = 0;
  let closedBugFindings = 0;
  let missingTraceRows = 0;

  for (const row of rows) {
    const outcome = AU_normalizeSimple(row.outcome);

    if (outcome !== "failed" && outcome !== "blocked") {
      continue;
    }

    const status = AU_normalizeText(row.testCaseState);
    const isE2E =
      AU_normalizeSimple(row.planKey) ===
      AU_normalizeSimple(planKeyE2E);
    const isUAT =
      AU_normalizeSimple(row.planKey) ===
      AU_normalizeSimple(planKeyUAT);

    /*
     * Cenário UAT terminal nunca volta para a fila de correção.
     */
    if (isUAT && AU_isUatTerminal(row)) {
      continue;
    }

    /*
     * BUG002 só faz sentido nos estados formalmente usados para
     * falha/impedimento. As outras combinações continuam sob as regras
     * E2E/UAT já existentes.
     */
    if (status !== "bug" && status !== "pendencias") {
      continue;
    }

    const displayFront = isUAT
      ? row.frente
      : AU_extractFronts(row.frente, knownFronts).join(" | ");

    const trace = PQ_currentTrace(row);

    if (!trace) {
      missingTraceRows++;
      console.log(
        `Audit QA - rastreabilidade indisponível para ${row.planKey}/${row.testCaseId}: ` +
        `Run=${row.lastTestRunId}; Result=${row.lastResultId}.`
      );
      continue;
    }

    let bugIds = Array.from(new Set(trace.bugIds));

    /*
     * associatedBugs vindo da listagem de resultados pode ficar defasado em
     * relação ao painel "Linked work items". Antes de declarar ausência de
     * Bug no BUG001, confirmamos no endpoint específico do Run/Result.
     */
    if (
      ruleBugTrace &&
      isE2E &&
      status === "bug" &&
      bugIds.length === 0
    ) {
      const authoritative = await PQ_loadAuthoritativeBugIds(workbook, row);
      bugIds = Array.from(new Set(bugIds.concat(authoritative))).sort((a, b) => a - b);
    }

    /* =====================================================
       BUG001 - BUG DE DESENVOLVIMENTO / END-TO-END

       Regra fechada:
       - somente EndToEnd;
       - Status BUG;
       - Outcome Failed/Blocked;
       - precisa existir Bug associado ao Run/Result atual.

       Não usamos AssignedTo nem exigimos reflexo no UAT aqui.
       ===================================================== */
    if (
      ruleBugTrace &&
      isE2E &&
      status === "bug" &&
      bugIds.length === 0
    ) {
      findings.push({
        severity: ruleBugTrace.severity,
        rule: ruleBugTrace.id,
        category: ruleBugTrace.category,
        plan: row.planKey,
        atalho: row.atalho,
        front: displayFront,
        e2eId: row.testCaseId,
        uatId: "",
        e2eStatus: row.testCaseState,
        e2eOutcome: row.outcome,
        uatStatus: "",
        uatOutcome: "",
        problem:
          "O cenário EndToEnd está em BUG com resultado Failed/Blocked, mas a falha atual não possui Bug associado.",
        expected:
          "EndToEnd BUG + Failed/Blocked com pelo menos 1 Bug associado ao Run/Result atual.",
        found:
          `${row.testCaseState} + ${row.outcome} | Run ${row.lastTestRunId} / Result ${row.lastResultId} | 0 Bugs associados`,
        actionable: "SIM",
        e2eLink: row.link,
        uatLink: "",
        observation:
          "Esta é a validação de Bug de desenvolvimento no EndToEnd. Bugs de Massa/Infraestrutura possuem regras próprias de reflexo E2E↔UAT."
      });

      missingDevelopmentBugFindings++;
    }

    /* =====================================================
       BUG002 - BUG FECHADO E EXECUÇÃO AINDA FALHADA

       Mantém a regra já estabelecida:
       - existe Bug associado ao resultado atual;
       - todos os Bugs possuem estado conhecido;
       - todos estão Closed;
       - a execução continua Failed/Blocked.

       Um único achado é criado por cenário, mesmo com vários Bugs.
       ===================================================== */
    if (!ruleClosedBug || bugIds.length === 0) {
      continue;
    }

    let allStatesKnown = true;
    let allClosed = true;
    const bugStateTexts: string[] = [];

    for (const bugId of bugIds) {
      const state = String(PQ_BUG_STATES.get(bugId) ?? "").trim();
      const category = String(PQ_BUG_CATEGORIES.get(bugId) ?? "").trim();
      const assignedTo = String(PQ_BUG_ASSIGNEES.get(bugId) ?? "").trim();

      const categoryText = category !== "" ? ` | ${category}` : "";
      const responsibleText = assignedTo !== "" ? ` | ${assignedTo}` : "";

      if (state === "") {
        allStatesKnown = false;
        allClosed = false;
        bugStateTexts.push(
          `${bugId}=ESTADO DESCONHECIDO${categoryText}${responsibleText}`
        );
        continue;
      }

      bugStateTexts.push(
        `${bugId}=${state}${categoryText}${responsibleText}`
      );

      if (AU_normalizeText(state) !== "closed") {
        allClosed = false;
      }
    }

    if (allStatesKnown && allClosed) {
      findings.push({
        severity: ruleClosedBug.severity,
        rule: ruleClosedBug.id,
        category: ruleClosedBug.category,
        plan: row.planKey,
        atalho: row.atalho,
        front: displayFront,
        e2eId: isUAT ? "" : row.testCaseId,
        uatId: isUAT ? row.testCaseId : "",
        e2eStatus: isUAT ? "" : row.testCaseState,
        e2eOutcome: isUAT ? "" : row.outcome,
        uatStatus: isUAT ? row.testCaseState : "",
        uatOutcome: isUAT ? row.outcome : "",
        problem:
          "Todos os Bugs associados à falha atual estão Closed, mas o cenário continua Failed/Blocked.",
        expected:
          "Após o fechamento de todos os Bugs da falha atual, o cenário deve voltar para reexecução antes de receber um novo resultado.",
        found:
          `${row.testCaseState} + ${row.outcome} | ${bugStateTexts.join(" | ")}`,
        actionable: "SIM",
        e2eLink: isUAT ? "" : row.link,
        uatLink: isUAT ? row.link : "",
        observation:
          "A validação usa somente os Bugs associados ao Run/Result atual. Um Bug histórico não é suficiente para manter uma execução falhada."
      });

      closedBugFindings++;
    }
  }

  console.log(
    `Audit QA - auditoria de Bugs: ` +
    `BUG desenvolvimento sem associação=${missingDevelopmentBugFindings}; ` +
    `todos Bugs Closed ainda falhado=${closedBugFindings}; ` +
    `rastreabilidade indisponível=${missingTraceRows}.`
  );
}

/* =========================================================
   PAR003 - MASSA / INFRAESTRUTURA E2E ↔ UAT
   ========================================================= */

// Valida o reflexo de Bugs de Massa/Infraestrutura entre E2E e UAT.
async function AU_auditMassInfraParallelism(
  workbook: ExcelScript.Workbook,
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  findings: AU_AuditFinding[]
): Promise<void> {
  const rule = AU_getEnabledRuleOrDefault(
    rules,
    "PAR003",
    {
      id: "PAR003",
      category: "Paralelismo",
      name: "Bug de Massa/Infraestrutura deve refletir E2E e UAT",
      severity: "ALTA",
      active: true,
      implemented: "SIM",
      scope: "E2E↔UAT",
      observation:
        "Usa o próprio Bug como chave causal. O mesmo Bug de Massa/Infraestrutura deve estar associado aos dois resultados atuais, com ambos os cenários em Pendências + Failed/Blocked e AssignedTo = Edson Kiyoshi Sato ou Diego Garcia Africa."
    }
  );

  if (!rule) {
    return;
  }

  const allowedAssignees = new Set(
    PQ_ALLOWED_MASS_INFRA_ASSIGNEES.map(
      (name) => AU_normalizeText(name)
    )
  );

  let mappingsInScope = 0;
  let findingsCount = 0;
  let okCount = 0;
  let skippedWithoutTrace = 0;
  let diegoValidCount = 0;

  for (const mapping of mappings) {
    /*
     * Mantém a regra dura: UAT corretamente encerrado não entra novamente
     * em fila de correção.
     */
    if (!AU_shouldAuditCrossPlan(mapping) || !mapping.matched) {
      continue;
    }

    const e2e = mapping.e2e;
    const uat = mapping.matched;

    const e2eTrace = PQ_currentTrace(e2e);
    const uatTrace = PQ_currentTrace(uat);

    if (!e2eTrace || !uatTrace) {
      /*
       * Sem os dois Run/Result atuais não existe prova suficiente para
       * afirmar reflexo ou ausência do mesmo Bug.
       */
      skippedWithoutTrace++;
      continue;
    }

    let e2eBugIds = Array.from(new Set(e2eTrace.bugIds));
    let uatBugIds = Array.from(new Set(uatTrace.bugIds));

    const e2eStatusInitial = AU_normalizeText(e2e.testCaseState);
    const uatStatusInitial = AU_normalizeText(uat.testCaseState);
    const e2eOutcomeInitial = AU_normalizeSimple(e2e.outcome);
    const uatOutcomeInitial = AU_normalizeSimple(uat.outcome);

    const e2eLooksLikeDependency =
      e2eStatusInitial === "pendencias" &&
      (e2eOutcomeInitial === "failed" || e2eOutcomeInitial === "blocked");
    const uatLooksLikeDependency =
      uatStatusInitial === "pendencias" &&
      (uatOutcomeInitial === "failed" || uatOutcomeInitial === "blocked");

    let unionBugIds = Array.from(new Set(e2eBugIds.concat(uatBugIds)));
    let massInfraBugIds = unionBugIds.filter((bugId) =>
      PQ_isMassOrInfrastructureCategory(
        String(PQ_BUG_CATEGORIES.get(bugId) ?? "")
      )
    );

    /*
     * Se ambos os lados têm aparência de pendência, mas a listagem comum não
     * trouxe nenhum Bug de Massa/Infra, confirmamos os WorkItems realmente
     * ligados aos dois resultados antes de concluir que não há regra PAR003.
     */
    if (
      massInfraBugIds.length === 0 &&
      (e2eLooksLikeDependency || uatLooksLikeDependency)
    ) {
      const confirmedE2E = await PQ_loadAuthoritativeBugIds(workbook, e2e);
      const confirmedUAT = await PQ_loadAuthoritativeBugIds(workbook, uat);

      e2eBugIds = Array.from(new Set(e2eBugIds.concat(confirmedE2E))).sort((a, b) => a - b);
      uatBugIds = Array.from(new Set(uatBugIds.concat(confirmedUAT))).sort((a, b) => a - b);
      unionBugIds = Array.from(new Set(e2eBugIds.concat(uatBugIds)));
      massInfraBugIds = unionBugIds.filter((bugId) =>
        PQ_isMassOrInfrastructureCategory(
          String(PQ_BUG_CATEGORIES.get(bugId) ?? "")
        )
      );
    }

    if (massInfraBugIds.length === 0) {
      continue;
    }

    /*
     * Antes de acusar ausência de reflexo, confirme o lado que aparenta estar
     * sem o Bug. Isso corrige exatamente o caso em que o Azure mostra o mesmo
     * Bug em "Linked work items", mas associatedBugs da listagem ficou vazio.
     */
    let e2eSet = new Set(e2eBugIds);
    let uatSet = new Set(uatBugIds);
    let provisionalMissingInUAT = massInfraBugIds.filter(
      (bugId) => e2eSet.has(bugId) && !uatSet.has(bugId)
    );
    let provisionalMissingInE2E = massInfraBugIds.filter(
      (bugId) => uatSet.has(bugId) && !e2eSet.has(bugId)
    );

    if (provisionalMissingInUAT.length > 0) {
      const confirmedUAT = await PQ_loadAuthoritativeBugIds(workbook, uat);
      uatBugIds = Array.from(new Set(uatBugIds.concat(confirmedUAT))).sort((a, b) => a - b);
    }

    if (provisionalMissingInE2E.length > 0) {
      const confirmedE2E = await PQ_loadAuthoritativeBugIds(workbook, e2e);
      e2eBugIds = Array.from(new Set(e2eBugIds.concat(confirmedE2E))).sort((a, b) => a - b);
    }

    unionBugIds = Array.from(new Set(e2eBugIds.concat(uatBugIds)));
    massInfraBugIds = unionBugIds.filter((bugId) =>
      PQ_isMassOrInfrastructureCategory(
        String(PQ_BUG_CATEGORIES.get(bugId) ?? "")
      )
    );

    mappingsInScope++;

    e2eSet = new Set(e2eBugIds);
    uatSet = new Set(uatBugIds);
    const issues: string[] = [];

    const missingInUAT = massInfraBugIds.filter(
      (bugId) => e2eSet.has(bugId) && !uatSet.has(bugId)
    );
    const missingInE2E = massInfraBugIds.filter(
      (bugId) => uatSet.has(bugId) && !e2eSet.has(bugId)
    );

    if (missingInUAT.length > 0) {
      issues.push(
        `Bug(s) de Massa/Infraestrutura sem reflexo no UAT: ${missingInUAT.join(" | ")}`
      );
    }

    if (missingInE2E.length > 0) {
      issues.push(
        `Bug(s) de Massa/Infraestrutura sem reflexo no EndToEnd: ${missingInE2E.join(" | ")}`
      );
    }

    const e2eStatus = AU_normalizeText(e2e.testCaseState);
    const uatStatus = AU_normalizeText(uat.testCaseState);
    const e2eOutcome = AU_normalizeSimple(e2e.outcome);
    const uatOutcome = AU_normalizeSimple(uat.outcome);

    const e2eFailure =
      e2eOutcome === "failed" ||
      e2eOutcome === "blocked";
    const uatFailure =
      uatOutcome === "failed" ||
      uatOutcome === "blocked";

    if (e2eStatus !== "pendencias") {
      issues.push(
        `EndToEnd deveria estar em Pendências e está em "${e2e.testCaseState}"`
      );
    }

    if (!e2eFailure) {
      issues.push(
        `EndToEnd deveria estar Failed/Blocked e está em "${e2e.outcome}"`
      );
    }

    if (uatStatus !== "pendencias") {
      issues.push(
        `UAT deveria estar em Pendências e está em "${uat.testCaseState}"`
      );
    }

    if (!uatFailure) {
      issues.push(
        `UAT deveria estar Failed/Blocked e está em "${uat.outcome}"`
      );
    }

    const invalidAssigneeTexts: string[] = [];
    const diegoBugIds: number[] = [];

    for (const bugId of massInfraBugIds) {
      const assignedTo = String(
        PQ_BUG_ASSIGNEES.get(bugId) ?? ""
      ).trim();

      const normalizedAssignedTo =
        AU_normalizeText(assignedTo);

      if (!allowedAssignees.has(normalizedAssignedTo)) {
        invalidAssigneeTexts.push(
          `${bugId}=${assignedTo !== "" ? assignedTo : "SEM RESPONSÁVEL"}`
        );
      } else if (
        normalizedAssignedTo ===
        AU_normalizeText("Diego Garcia Africa")
      ) {
        diegoBugIds.push(bugId);
      }
    }

    if (invalidAssigneeTexts.length > 0) {
      issues.push(
        `AssignedTo inválido em Bug(s) de Massa/Infraestrutura: ${invalidAssigneeTexts.join(" | ")}`
      );
    }

    if (diegoBugIds.length > 0) {
      diegoValidCount += diegoBugIds.length;
    }

    if (issues.length === 0) {
      okCount++;
      continue;
    }

    const bugDetails = massInfraBugIds.map((bugId) => {
      const category = String(
        PQ_BUG_CATEGORIES.get(bugId) ?? ""
      ).trim();
      const assignedTo = String(
        PQ_BUG_ASSIGNEES.get(bugId) ?? ""
      ).trim();
      const state = String(
        PQ_BUG_STATES.get(bugId) ?? ""
      ).trim();

      return (
        `${bugId}` +
        `${category !== "" ? ` [${category}]` : ""}` +
        `${assignedTo !== "" ? ` [${assignedTo}]` : ""}` +
        `${state !== "" ? ` [${state}]` : ""}`
      );
    });

    /*
     * UM achado por cenário/frente. Se houver vários Bugs ou várias
     * violações, tudo é agregado no mesmo registro.
     */
    findings.push({
      severity: rule.severity,
      rule: rule.id,
      category: rule.category,
      plan: "E2E↔UAT",
      atalho: e2e.atalho,
      front: mapping.front,
      e2eId: e2e.testCaseId,
      uatId: uat.testCaseId,
      e2eStatus: e2e.testCaseState,
      e2eOutcome: e2e.outcome,
      uatStatus: uat.testCaseState,
      uatOutcome: uat.outcome,
      problem:
        "Bug de Massa/Infraestrutura não está refletido corretamente entre EndToEnd e Homologação.",
      expected:
        "Mesmo Bug associado aos dois resultados atuais + E2E Pendências/Failed ou Blocked + UAT Pendências/Failed ou Blocked + AssignedTo Edson Kiyoshi Sato ou Diego Garcia Africa.",
      found:
        `${issues.join("; ")} | Bugs em escopo: ${bugDetails.join(" | ")}`,
      actionable: "SIM",
      e2eLink: e2e.link,
      uatLink: uat.link,
      observation:
        "Edson Kiyoshi Sato é a preferência operacional; Diego Garcia Africa também é válido e não gera correção. A chave causal é o próprio BugId associado ao Run/Result atual."
    });

    findingsCount++;
  }

  console.log(
    `Audit QA - PAR003 Massa/Infraestrutura: ` +
    `mapeamentos em escopo=${mappingsInScope}; ` +
    `corretos=${okCount}; ` +
    `achados=${findingsCount}; ` +
    `sem rastreabilidade suficiente=${skippedWithoutTrace}; ` +
    `Bugs válidos com Diego=${diegoValidCount}.`
  );
}


/* =========================================================
   COLETA E AUDITORIA DOS TÍTULOS DOS ANEXOS
   ========================================================= */

// Carrega os nomes dos anexos dos pares E2E/UAT que precisam ser auditados.
async function AU_loadAttachmentSnapshots(
  workbook: ExcelScript.Workbook,
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>
): Promise<Map<string, AU_AttachmentSnapshot>> {
  const result = new Map<string, AU_AttachmentSnapshot>();

  const rule = AU_getEnabledRuleOrDefault(
    rules,
    "EVD001",
    {
      id: "EVD001",
      category: "Evidências",
      name: "Títulos dos anexos divergentes entre E2E e UAT",
      severity: "MÉDIA",
      active: true,
      implemented: "SIM",
      scope: "E2E↔UAT",
      observation: "Compara somente anexos ativos do resultado atual; ignora evidências Deleted retornadas por PAT com permissão elevada."
    }
  );

  if (!rule) {
    return result;
  }

  const targetMap = new Map<string, AU_AttachmentTarget>();

  for (const mapping of mappings) {
    if (!AU_shouldAuditCrossPlan(mapping) || !mapping.matched) {
      continue;
    }

    const rows = [mapping.e2e, mapping.matched];

    for (const row of rows) {
      if (row.lastTestRunId <= 0 || row.lastResultId <= 0 || row.planId <= 0) {
        continue;
      }

      const key = PQ_resultTraceKey(
        row.planId,
        row.lastTestRunId,
        row.lastResultId
      );

      if (!targetMap.has(key)) {
        targetMap.set(key, {
          planId: row.planId,
          runId: row.lastTestRunId,
          resultId: row.lastResultId
        });
      }
    }
  }

  if (targetMap.size === 0) {
    return result;
  }

  const azure = FL_readAzureConfig(
    FL_getRequiredTable(
      workbook,
      "tbScriptAzureDevOps"
    )
  );

  const authorization = FL_buildAuthorization(azure.pat);
  const targets = Array.from(targetMap.values());
  const concurrency = 8;
  let failedLoads = 0;

  console.log(
    `Audit QA - lendo títulos de anexos de ${targets.length} resultado(s) atuais.`
  );

  for (
    let start = 0;
    start < targets.length;
    start += concurrency
  ) {
    const batch = targets.slice(
      start,
      Math.min(start + concurrency, targets.length)
    );

    const promises: Promise<AU_AttachmentLoad>[] = [];

    for (const target of batch) {
      promises.push(
        AU_loadOneAttachmentSnapshot(
          azure,
          authorization,
          target
        )
      );
    }

    const loaded = await Promise.all(promises);

    for (const item of loaded) {
      result.set(item.key, item.snapshot);

      if (item.snapshot.error !== "") {
        failedLoads++;
      }
    }
  }

  if (failedLoads > 0) {
    console.log(
      `ATENÇÃO: ${failedLoads} resultado(s) não puderam ter os títulos de anexos lidos. ` +
      "Esses pares serão ignorados pela regra EVD001 para evitar falso positivo."
    );
  }

  return result;
}

// Busca os nomes dos anexos ativos de um Run/Result específico.
async function AU_loadOneAttachmentSnapshot(
  azure: FL_AzureConfig,
  authorization: string,
  target: AU_AttachmentTarget
): Promise<AU_AttachmentLoad> {
  const key = PQ_resultTraceKey(
    target.planId,
    target.runId,
    target.resultId
  );

  try {
    /*
     * Fonte principal: testlog/generalAttachment no vstmr.
     * Esse endpoint reflete os anexos efetivamente visíveis no cenário e evita
     * incluir histórico Deleted retornado pela API de attachments para PATs
     * com permissão elevada.
     */
    const testlogUrl =
      `${PQ_testResultsBaseUrl(azure)}` +
      `/_apis/testresults/runs/${target.runId}` +
      `/results/${target.resultId}/testlog` +
      `?type=generalAttachment&fetchMetaData=true&api-version=7.1-preview.1`;

    const testlogData = await FL_azureGet<
      FL_AzureListResponse<AU_TestLogEntry>
    >(
      testlogUrl,
      authorization
    );

    const testlogEntries = Array.isArray(testlogData.value)
      ? testlogData.value
      : [];

    const namesFromTestlog =
      AU_extractActiveAttachmentNamesFromTestLog(testlogEntries);

    if (testlogEntries.length > 0 || namesFromTestlog.length > 0) {
      return {
        key,
        snapshot: {
          names: namesFromTestlog,
          error: ""
        }
      };
    }

    /*
     * Fallback defensivo: attachments clássico, filtrando registros Deleted
     * quando o testlog não retornar dados.
     */
    const attachmentsUrl =
      `${PQ_testResultsBaseUrl(azure)}` +
      `/_apis/testresults/runs/${target.runId}` +
      `/results/${target.resultId}/attachments` +
      `?api-version=7.1-preview.1`;

    const attachmentData = await FL_azureGet<
      FL_AzureListResponse<AU_TestAttachment>
    >(
      attachmentsUrl,
      authorization
    );

    const attachments = Array.isArray(attachmentData.value)
      ? attachmentData.value
      : [];

    const names = AU_extractActiveAttachmentNamesFromAttachments(attachments);

    return {
      key,
      snapshot: {
        names,
        error: ""
      }
    };
  } catch (error) {
    return {
      key,
      snapshot: {
        names: [],
        error: AU_formatError(error)
      }
    };
  }
}

/*
 * Identifica anexos excluídos que ainda podem aparecer em APIs do Azure DevOps
 * quando o PAT consegue enxergar histórico Deleted.
 */
function AU_isDeletedAttachmentRecord(
  fileName: string,
  metadata?: { [key: string]: unknown },
  attachment?: AU_TestAttachment
): boolean {
  const normalizedName = AU_normalizeText(fileName);

  if (
    normalizedName === "deleted" ||
    normalizedName.endsWith(" deleted") ||
    normalizedName.indexOf("(deleted)") >= 0
  ) {
    return true;
  }

  if (attachment?.isDeleted === true) {
    return true;
  }

  const attachmentState = AU_normalizeText(String(attachment?.state ?? ""));

  if (
    attachmentState === "deleted" ||
    attachmentState.indexOf("deleted") >= 0
  ) {
    return true;
  }

  const comment = AU_normalizeText(String(attachment?.comment ?? ""));

  if (comment === "deleted" || comment.indexOf(" deleted") >= 0) {
    return true;
  }

  if (!metadata) {
    return false;
  }

  for (const [metaKey, metaValue] of Object.entries(metadata)) {
    const normalizedKey = AU_normalizeText(metaKey);
    const normalizedValue = AU_normalizeText(String(metaValue ?? ""));

    if (
      normalizedKey.indexOf("deleted") >= 0 &&
      (
        normalizedValue === "true" ||
        normalizedValue === "sim" ||
        normalizedValue === "yes" ||
        normalizedValue === "1"
      )
    ) {
      return true;
    }

    if (normalizedValue === "deleted") {
      return true;
    }
  }

  return false;
}

// Extrai somente os nomes de anexos ativos retornados pelo endpoint testlog.
function AU_extractActiveAttachmentNamesFromTestLog(
  entries: AU_TestLogEntry[]
): string[] {
  const names: string[] = [];

  for (const entry of entries) {
    const filePath = String(entry.logReference?.filePath ?? "").trim();

    if (filePath === "") {
      continue;
    }

    if (AU_isDeletedAttachmentRecord(filePath, entry.metaData)) {
      continue;
    }

    names.push(filePath);
  }

  names.sort((a, b) =>
    AU_normalizeAttachmentName(a).localeCompare(
      AU_normalizeAttachmentName(b)
    )
  );

  return names;
}

// Extrai nomes ativos da API de attachments, descartando registros Deleted.
function AU_extractActiveAttachmentNamesFromAttachments(
  attachments: AU_TestAttachment[]
): string[] {
  const names: string[] = [];

  for (const attachment of attachments) {
    const fileName = String(attachment.fileName ?? "").trim();

    if (fileName === "") {
      continue;
    }

    if (AU_isDeletedAttachmentRecord(fileName, undefined, attachment)) {
      continue;
    }

    names.push(fileName);
  }

  names.sort((a, b) =>
    AU_normalizeAttachmentName(a).localeCompare(
      AU_normalizeAttachmentName(b)
    )
  );

  return names;
}

// Compara os nomes das evidências anexadas entre E2E e UAT.
function AU_auditAttachmentNames(
  mappings: AU_MappingRecord[],
  rules: Map<string, AU_RuleDef>,
  snapshots: Map<string, AU_AttachmentSnapshot>,
  findings: AU_AuditFinding[]
): void {
  const rule = AU_getEnabledRuleOrDefault(
    rules,
    "EVD001",
    {
      id: "EVD001",
      category: "Evidências",
      name: "Títulos dos anexos divergentes entre E2E e UAT",
      severity: "MÉDIA",
      active: true,
      implemented: "SIM",
      scope: "E2E↔UAT",
      observation: "Compara somente anexos ativos do resultado atual; ignora evidências Deleted retornadas por PAT com permissão elevada."
    }
  );

  if (!rule) {
    return;
  }

  for (const mapping of mappings) {
    if (!AU_shouldAuditCrossPlan(mapping) || !mapping.matched) {
      continue;
    }

    const e2e = mapping.e2e;
    const uat = mapping.matched;

    if (
      e2e.lastTestRunId <= 0 ||
      e2e.lastResultId <= 0 ||
      uat.lastTestRunId <= 0 ||
      uat.lastResultId <= 0
    ) {
      continue;
    }

    const e2eKey = PQ_resultTraceKey(
      e2e.planId,
      e2e.lastTestRunId,
      e2e.lastResultId
    );

    const uatKey = PQ_resultTraceKey(
      uat.planId,
      uat.lastTestRunId,
      uat.lastResultId
    );

    const e2eSnapshot = snapshots.get(e2eKey);
    const uatSnapshot = snapshots.get(uatKey);

    if (
      !e2eSnapshot ||
      !uatSnapshot ||
      e2eSnapshot.error !== "" ||
      uatSnapshot.error !== ""
    ) {
      continue;
    }

    const diff = AU_compareAttachmentNames(
      e2eSnapshot.names,
      uatSnapshot.names
    );

    if (diff.equal) {
      continue;
    }

    findings.push(AU_parallelFinding(
      rule,
      mapping,
      "Os títulos dos anexos/evidências do resultado atual não batem entre EndToEnd e Homologação.",
      "Mesma relação de nomes de anexos nos dois resultados atuais.",
      `Somente no E2E: ${AU_formatAttachmentList(diff.onlyE2E)} | ` +
      `Somente no UAT: ${AU_formatAttachmentList(diff.onlyUAT)}`,
      `E2E (${e2eSnapshot.names.length}): ${AU_formatAttachmentList(e2eSnapshot.names)} | ` +
      `UAT (${uatSnapshot.names.length}): ${AU_formatAttachmentList(uatSnapshot.names)}. ` +
      "O conteúdo dos arquivos não foi aberto; a auditoria compara somente os títulos/nomes."
    ));
  }
}

// Compara duas listas de nomes de anexos e retorna as diferenças.
function AU_compareAttachmentNames(
  e2eNames: string[],
  uatNames: string[]
): {
  equal: boolean;
  onlyE2E: string[];
  onlyUAT: string[];
} {
  const e2eCounts = AU_attachmentNameCounts(e2eNames);
  const uatCounts = AU_attachmentNameCounts(uatNames);
  const onlyE2E: string[] = [];
  const onlyUAT: string[] = [];

  const allKeys = new Set<string>();

  for (const key of e2eCounts.keys()) {
    allKeys.add(key);
  }

  for (const key of uatCounts.keys()) {
    allKeys.add(key);
  }

  for (const key of allKeys) {
    const e2eCount = e2eCounts.get(key)?.count ?? 0;
    const uatCount = uatCounts.get(key)?.count ?? 0;

    if (e2eCount > uatCount) {
      const name = e2eCounts.get(key)?.original ?? key;

      for (let i = 0; i < e2eCount - uatCount; i++) {
        onlyE2E.push(name);
      }
    }

    if (uatCount > e2eCount) {
      const name = uatCounts.get(key)?.original ?? key;

      for (let i = 0; i < uatCount - e2eCount; i++) {
        onlyUAT.push(name);
      }
    }
  }

  return {
    equal: onlyE2E.length === 0 && onlyUAT.length === 0,
    onlyE2E,
    onlyUAT
  };
}

// Conta quantas vezes cada nome de anexo aparece na lista.
function AU_attachmentNameCounts(
  names: string[]
): Map<string, { count: number; original: string }> {
  const result = new Map<string, { count: number; original: string }>();

  for (const name of names) {
    const key = AU_normalizeAttachmentName(name);

    if (key === "") {
      continue;
    }

    const current = result.get(key);

    if (current) {
      current.count++;
    } else {
      result.set(key, {
        count: 1,
        original: name
      });
    }
  }

  return result;
}

// Normaliza o nome do anexo para permitir comparação consistente.
function AU_normalizeAttachmentName(value: string): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

// Formata a lista de anexos para exibição no achado.
function AU_formatAttachmentList(names: string[]): string {
  if (names.length === 0) {
    return "nenhum";
  }

  return names.join(" | ");
}

/* =========================================================
   MAPEAMENTO
   ========================================================= */

// Constrói os mapeamentos entre registros E2E e seus candidatos em UAT.
function AU_buildMappings(
  e2eRows: AU_ExecRecord[],
  knownFronts: string[],
  exactIndex: Map<string, AU_ExecRecord[]>,
  frontIndex: Map<string, AU_ExecRecord[]>
): AU_MappingRecord[] {
  const mappings: AU_MappingRecord[] = [];

  /*
   * O mapeamento é resolvido por GRUPO Atalho + Frente.
   * Isso evita o erro de mapear vários cenários E2E diferentes para o
   * mesmo único cenário UAT só porque o título estava parecido.
   */
  const groups = new Map<
    string,
    { e2e: AU_ExecRecord; front: string }[]
  >();

  for (const e2e of e2eRows) {
    const fronts = AU_extractFronts(e2e.frente, knownFronts);

    for (const front of fronts) {
      const key = AU_buildFrontKey(e2e.atalho, front);
      const bucket = groups.get(key) ?? [];
      bucket.push({ e2e, front });
      groups.set(key, bucket);
    }
  }

  for (const [frontKey, units] of groups) {
    if (units.length === 0) {
      continue;
    }

    const sample = units[0];
    const candidatesSameFront = frontIndex.get(frontKey) ?? [];

    /* =====================================================
       TODA A FRENTE JÁ ESTÁ TERMINAL
       ===================================================== */
    if (AU_allUatCandidatesTerminal(candidatesSameFront)) {
      for (const unit of units) {
        const exactKey = AU_buildExactKey(
          unit.e2e.atalho,
          unit.front,
          unit.e2e.title
        );

        const exactTerminal =
          (exactIndex.get(exactKey) ?? [])
            .filter((candidate) => AU_isUatTerminal(candidate));

        const exactHistorical =
          exactTerminal.length === 1
            ? exactTerminal[0]
            : undefined;

        const bestHistorical = exactHistorical
          ? { record: exactHistorical, similarity: 100 }
          : AU_findBestTitleSuggestion(unit.e2e.title, candidatesSameFront);

        mappings.push({
          e2e: unit.e2e,
          front: unit.front,
          exactCandidates: exactTerminal,
          matched: exactHistorical,
          suggestion: bestHistorical.record,
          suggestionSimilarity: bestHistorical.similarity,
          status: "ENCERRADO UAT",
          type: exactHistorical
            ? "Atalho + Frente + Título normalizado - histórico encerrado"
            : "Atalho + Frente encerrados - sem vínculo individual determinístico",
          observation: exactHistorical
            ? "Correspondente exato já está em combinação terminal válida. Mantido somente como histórico; NÃO entra na fila de correções."
            : `${candidatesSameFront.length} cenário(s) UAT do Atalho + Frente estão em combinações terminais válidas, mas este E2E não possui vínculo individual determinístico. ` +
              "A sugestão de título é apenas informativa; nenhum UAT é declarado como correspondente. O grupo continua fora da fila de correções por estar encerrado."
        });
      }

      continue;
    }

    const actionableCandidates =
      candidatesSameFront.filter(
        (candidate) => !AU_isUatTerminal(candidate)
      );

    const terminalCandidates =
      candidatesSameFront.filter(
        (candidate) => AU_isUatTerminal(candidate)
      );

    /*
     * Candidatos já utilizados ou reservados por uma ambiguidade exata
     * não podem ser reaproveitados por outro cenário do mesmo grupo.
     */
    const unavailable = new Set<string>();
    const unresolved: { e2e: AU_ExecRecord; front: string }[] = [];

    /* =====================================================
       PRIMEIRA PASSAGEM: TÍTULO EXATO
       ===================================================== */
    for (const unit of units) {
      const exactKey = AU_buildExactKey(
        unit.e2e.atalho,
        unit.front,
        unit.e2e.title
      );

      const exactAll = exactIndex.get(exactKey) ?? [];

      const exactActionable = exactAll.filter((candidate) => {
        return (
          !AU_isUatTerminal(candidate) &&
          !unavailable.has(AU_execIdentity(candidate))
        );
      });

      const exactTerminal = exactAll.filter(
        (candidate) => AU_isUatTerminal(candidate)
      );

      if (exactActionable.length === 1) {
        const matched = exactActionable[0];
        unavailable.add(AU_execIdentity(matched));

        mappings.push({
          e2e: unit.e2e,
          front: unit.front,
          exactCandidates: exactActionable,
          matched,
          suggestionSimilarity: 100,
          status: "OK",
          type: "Atalho + Frente + Título normalizado",
          observation:
            exactTerminal.length > 0
              ? `Correspondência acionável única. ${exactTerminal.length} candidato(s) terminal(is) homônimo(s) foram ignorados.`
              : "Correspondência exata após normalização de título."
        });

        continue;
      }

      if (exactActionable.length > 1) {
        for (const candidate of exactActionable) {
          unavailable.add(AU_execIdentity(candidate));
        }

        mappings.push({
          e2e: unit.e2e,
          front: unit.front,
          exactCandidates: exactActionable,
          suggestionSimilarity: 100,
          status: "AMBÍGUO",
          type: "Atalho + Frente + Título normalizado",
          observation:
            `Mais de um candidato ACIONÁVEL exato: ${exactActionable.map((x) => x.testCaseId).join(" | ")}. ` +
            "O motor não escolheu um deles automaticamente."
        });

        continue;
      }

      /*
       * Se o correspondente exato existe, mas já está terminal,
       * esse cenário específico é histórico mesmo que existam outros
       * cenários abertos no mesmo Atalho + Frente.
       */
      if (exactTerminal.length > 0) {
        const matched = exactTerminal[0];

        mappings.push({
          e2e: unit.e2e,
          front: unit.front,
          exactCandidates: exactTerminal,
          matched,
          suggestionSimilarity: 100,
          status: "ENCERRADO UAT",
          type: "Atalho + Frente + Título normalizado",
          observation:
            `${exactTerminal.length} correspondente(s) exato(s) encontrado(s), já em combinação terminal válida. ` +
            "Mantido apenas como histórico; NÃO entra na fila de correções."
        });

        continue;
      }

      unresolved.push(unit);
    }

    /* =====================================================
       SEGUNDA PASSAGEM: ELIMINAÇÃO 1 x 1

       Se sobrou exatamente um E2E sem par e exatamente um UAT
       acionável ainda não utilizado, a correspondência é determinística
       por exclusão. Nesse caso o título pode ser auditado separadamente.
       ===================================================== */
    const remainingActionable = actionableCandidates.filter(
      (candidate) => !unavailable.has(AU_execIdentity(candidate))
    );

    if (
      unresolved.length === 1 &&
      remainingActionable.length === 1
    ) {
      const unit = unresolved[0];
      const matched = remainingActionable[0];
      const similarity = AU_stringSimilarity(
        AU_normalizeTitle(unit.e2e.title),
        AU_normalizeTitle(matched.title)
      );

      mappings.push({
        e2e: unit.e2e,
        front: unit.front,
        exactCandidates: [],
        matched,
        suggestion: matched,
        suggestionSimilarity: similarity,
        status: "OK",
        type: "Atalho + Frente - correspondência única residual",
        observation:
          "Após retirar correspondências exatas e cenários terminais, restou exatamente 1 E2E e 1 UAT acionável. " +
          "O vínculo foi feito por exclusão determinística; diferenças de título são auditadas em regra própria."
      });

      continue;
    }

    /* =====================================================
       SEM CORRESPONDÊNCIA SEGURA
       ===================================================== */
    for (const unit of unresolved) {
      const best = AU_findBestTitleSuggestion(
        unit.e2e.title,
        remainingActionable
      );

      mappings.push({
        e2e: unit.e2e,
        front: unit.front,
        exactCandidates: [],
        suggestion: best.record,
        suggestionSimilarity: best.similarity,
        status: "SEM CORRESPONDÊNCIA",
        type: "Atalho + Frente sem vínculo determinístico",
        observation: best.record
          ? "Não existe vínculo determinístico único. A similaridade de título é mostrada apenas como sugestão e NÃO fecha o mapeamento."
          : terminalCandidates.length > 0
            ? "Não há candidato UAT acionável disponível para vínculo seguro; existem apenas outros cenários terminais no grupo."
            : "Não há candidato UAT acionável disponível para vínculo seguro nesta combinação Atalho + Frente."
      });
    }
  }

  return mappings;
}

// Monta uma identidade única para um registro de execução.
function AU_execIdentity(row: AU_ExecRecord): string {
  return [
    row.planId,
    row.testPointId,
    row.suiteId,
    row.testCaseId
  ].join("|");
}

/* =========================================================
   UAT ENCERRADO / AUDITORIA ACIONÁVEL
   ========================================================= */

// Verifica se um cenário UAT já está em estado terminal válido.
function AU_isUatTerminal(row: AU_ExecRecord): boolean {
  const status = AU_normalizeText(row.testCaseState);
  const outcome = AU_normalizeSimple(row.outcome);

  /*
   * FONTE ÚNICA DE VERDADE PARA ENCERRAMENTO UAT.
   *
   * Regra de negócio confirmada:
   * - Closed + Passed        => encerrado
   * - Closed + NotApplicable => encerrado
   * - Ressalva + Passed      => encerrado
   *
   * Não adicionar outras combinações sem regra explicitamente confirmada.
   */
  if (status === "closed") {
    return (
      outcome === "passed" ||
      outcome === "notapplicable" ||
      outcome === "not applicable"
    );
  }

  if (status === "ressalva") {
    return outcome === "passed";
  }

  return false;
}

/*
 * Identifica cenários encerrados como NotApplicable no EndToEnd ou Homologação.
 * Usado por MAP001 (supressão), PAR004 (coerência) e PAR001 (exclusão).
 */
function AU_isClosedNotApplicable(row: AU_ExecRecord): boolean {
  if (AU_normalizeText(row.testCaseState) !== "closed") {
    return false;
  }

  const outcome = AU_normalizeSimple(row.outcome);

  return outcome === "notapplicable" || outcome === "not applicable";
}

// Verifica se todos os candidatos UAT de um mapeamento já estão encerrados.
function AU_allUatCandidatesTerminal(
  candidates: AU_ExecRecord[]
): boolean {
  if (candidates.length === 0) {
    return false;
  }

  for (const candidate of candidates) {
    if (!AU_isUatTerminal(candidate)) {
      return false;
    }
  }

  return true;
}

// Define se um mapeamento ainda deve ser auditado entre os dois planos.
function AU_shouldAuditCrossPlan(
  mapping: AU_MappingRecord
): boolean {
  if (mapping.status === "ENCERRADO UAT") {
    return false;
  }

  if (mapping.matched && AU_isUatTerminal(mapping.matched)) {
    return false;
  }

  return true;
}

// Cria um índice de UAT para correspondência exata de cenários.
function AU_buildUatExactIndex(rows: AU_ExecRecord[]): Map<string, AU_ExecRecord[]> {
  const result = new Map<string, AU_ExecRecord[]>();

  for (const row of rows) {
    const key = AU_buildExactKey(row.atalho, row.frente, row.title);
    const bucket = result.get(key) ?? [];
    bucket.push(row);
    result.set(key, bucket);
  }

  return result;
}

// Cria um índice de UAT por atalho e frente para busca de candidatos.
function AU_buildUatFrontIndex(rows: AU_ExecRecord[]): Map<string, AU_ExecRecord[]> {
  const result = new Map<string, AU_ExecRecord[]>();

  for (const row of rows) {
    const key = AU_buildFrontKey(row.atalho, row.frente);
    const bucket = result.get(key) ?? [];
    bucket.push(row);
    result.set(key, bucket);
  }

  return result;
}

// Monta a chave usada no índice exato de mapeamento.
function AU_buildExactKey(atalho: string, front: string, title: string): string {
  return `${AU_normalizeAtalho(atalho)}||${AU_normalizeFront(front)}||${AU_normalizeTitle(title)}`;
}

// Monta a chave usada no índice de mapeamento por frente.
function AU_buildFrontKey(atalho: string, front: string): string {
  return `${AU_normalizeAtalho(atalho)}||${AU_normalizeFront(front)}`;
}

// Extrai e normaliza as frentes reconhecidas a partir de um texto.
function AU_extractFronts(source: string, knownFronts: string[]): string[] {
  const upper = String(source ?? "").toUpperCase();
  const found: string[] = [];

  for (const front of knownFronts) {
    const regex = new RegExp(`(^|[^A-Z0-9])${AU_escapeRegExp(front)}([^A-Z0-9]|$)`, "i");
    if (regex.test(upper)) {
      found.push(front);
    }
  }

  return found;
}

// Seleciona o melhor candidato UAT com base na similaridade do título.
function AU_findBestTitleSuggestion(
  sourceTitle: string,
  candidates: AU_ExecRecord[]
): { record?: AU_ExecRecord; similarity: number } {
  if (candidates.length === 0) {
    return { similarity: 0 };
  }

  const source = AU_normalizeTitle(sourceTitle);
  let bestRecord: AU_ExecRecord | undefined;
  let bestSimilarity = -1;

  for (const candidate of candidates) {
    const target = AU_normalizeTitle(candidate.title);
    const similarity = AU_stringSimilarity(source, target);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestRecord = candidate;
    }
  }

  return {
    record: bestRecord,
    similarity: Math.max(0, bestSimilarity)
  };
}

/* =========================================================
   LEITURA DAS CONFIGURAÇÕES
   ========================================================= */

// Lê as regras configuradas na tabela de auditoria.
function AU_readRules(table: ExcelScript.Table): AU_RuleDef[] {
  return AU_getTableRows(table)
    .map((row) => ({
      id: AU_textValue(row, "ID").toUpperCase(),
      category: AU_textValue(row, "Categoria"),
      name: AU_textValue(row, "Regra"),
      severity: AU_textValue(row, "Severidade"),
      active: AU_normalizeText(AU_textValue(row, "Ativa")) === "sim",
      implemented: AU_textValue(row, "Implementada_V1").toUpperCase(),
      scope: AU_textValue(row, "Escopo"),
      observation: AU_textValue(row, "Observacao")
    }))
    .filter((rule) => rule.id !== "");
}

// Retorna uma regra somente quando ela está ativa e implementada.
function AU_getEnabledRule(
  rules: Map<string, AU_RuleDef>,
  id: string
): AU_RuleDef | undefined {
  const rule = rules.get(id);

  if (!rule || !rule.active) {
    return undefined;
  }

  if (AU_normalizeText(rule.implemented) === "nao") {
    return undefined;
  }

  return rule;
}

// Retorna a regra configurada ou uma definição padrão quando aplicável.
function AU_getEnabledRuleOrDefault(
  rules: Map<string, AU_RuleDef>,
  id: string,
  fallback: AU_RuleDef
): AU_RuleDef | undefined {
  const existing = rules.get(id);

  /*
   * Quando esta função é chamada, a regra JÁ possui implementação no código.
   * Portanto, Implementada_V1 é metadado documental e não pode bloquear a
   * implementação real por estar desatualizado como NÃO/PARCIAL.
   *
   * A coluna Ativa continua sendo respeitada: se o usuário desligar a regra
   * na configuração, o motor não gera achados dela.
   */
  if (existing) {
    if (!existing.active) {
      return undefined;
    }

    return {
      id: fallback.id,
      category: existing.category || fallback.category,
      name: fallback.name,
      severity: existing.severity || fallback.severity,
      active: true,
      implemented: "SIM",
      scope: existing.scope || fallback.scope,
      observation: fallback.observation
    };
  }

  return fallback.active ? fallback : undefined;
}

// Sincroniza com segurança quais regras estão implementadas nesta versão.
function AU_syncImplementedRuleMetadataSafe(
  table: ExcelScript.Table
): void {
  try {
    AU_syncImplementedRuleMetadata(table);
  } catch (error) {
    console.log(
      `ATENÇÃO: não foi possível sincronizar os metadados das regras implementadas: ${AU_formatError(error)}`
    );
  }
}

// Atualiza na tabela o indicador de implementação das regras.
function AU_syncImplementedRuleMetadata(
  table: ExcelScript.Table
): void {
  const headers = table.getHeaderRowRange().getTexts()[0];

  const idIndex = headers.findIndex(
    (h) => AU_normalizeText(h) === AU_normalizeText("ID")
  );
  const ruleIndex = headers.findIndex(
    (h) => AU_normalizeText(h) === AU_normalizeText("Regra")
  );
  const implementedIndex = headers.findIndex(
    (h) => AU_normalizeText(h) === AU_normalizeText("Implementada_V1")
  );
  const observationIndex = headers.findIndex(
    (h) => AU_normalizeText(h) === AU_normalizeText("Observacao")
  );

  if (idIndex < 0 || implementedIndex < 0) {
    return;
  }

  const implementedByCode: {
    [key: string]: { rule: string; observation: string };
  } = {
    BUG001: {
      rule: "BUG de desenvolvimento no E2E deve possuir Bug associado",
      observation:
        "Implementado. Valida EndToEnd em Status BUG + Failed/Blocked e exige Bug associado ao Run/Result atual. Não exige reflexo no UAT para Bug de desenvolvimento."
    },
    BUG002: {
      rule: "Bug Closed não pode manter a execução atual Failed/Blocked",
      observation:
        "Implementado. Quando existe Bug associado ao resultado atual, só aponta reativação se TODOS os Bugs associados tiverem estado conhecido e estiverem Closed."
    },
    PAR003: {
      rule: "Bug de Massa/Infraestrutura deve refletir E2E e UAT",
      observation:
        "Implementado com chave causal pelo BugId. O mesmo Bug de Massa/Infraestrutura deve estar associado aos dois Run/Result atuais; ambos os cenários devem estar Pendências + Failed/Blocked; AssignedTo deve ser Edson Kiyoshi Sato ou Diego Garcia Africa."
    },
    CNT001: {
      rule: "Título E2E e UAT devem permanecer equivalentes",
      observation:
        "Implementado. Compara título normalizado somente quando o vínculo E2E↔UAT é determinístico e acionável."
    },
    PAR004: {
      rule: "E2E Closed + NotApplicable exige UAT Closed + NotApplicable quando existir correspondente",
      observation:
        "Implementado. A ausência de correspondente UAT é válida; quando existir, ambos devem estar Closed + NotApplicable."
    },
    EVD001: {
      rule: "Nomes dos anexos devem estar coerentes entre E2E e UAT",
      observation:
        "Implementado. Compara apenas os nomes/títulos dos anexos ativos do resultado atual via testlog; ignora evidências Deleted visíveis apenas por PAT elevado."
    }
  };

  const dataRange = table.getRangeBetweenHeaderAndTotal();
  const values = dataRange.getValues();
  let updated = 0;

  for (let r = 0; r < values.length; r++) {
    const id = String(values[r][idIndex] ?? "").trim().toUpperCase();
    const metadata = implementedByCode[id];

    if (!metadata) {
      continue;
    }

    if (
      AU_normalizeText(String(values[r][implementedIndex] ?? "")) !== "sim"
    ) {
      dataRange.getCell(r, implementedIndex).setValue("SIM");
      updated++;
    }

    if (ruleIndex >= 0) {
      dataRange.getCell(r, ruleIndex).setValue(metadata.rule);
    }

    if (observationIndex >= 0) {
      dataRange.getCell(r, observationIndex).setValue(metadata.observation);
    }
  }

  console.log(
    `Audit QA - regras implementadas sincronizadas. Metadados alterados: ${updated}. ` +
    "Ativa continua sendo respeitada como liga/desliga."
  );
}

// Remove achados exatamente duplicados antes da gravação.
function AU_deduplicateFindings(
  findings: AU_AuditFinding[]
): AU_AuditFinding[] {
  const unique = new Map<string, AU_AuditFinding>();

  for (const finding of findings) {
    /*
     * Unidade de apontamento:
     * Regra + Plano + Atalho + Frente + cenário E2E + cenário UAT + problema.
     *
     * BugId NÃO entra na chave. Quando existem vários Bugs no mesmo cenário,
     * eles devem ser listados dentro do próprio finding, e não multiplicar linhas.
     */
    const key = [
      AU_normalizeSimple(finding.rule),
      AU_normalizeSimple(finding.plan),
      AU_normalizeAtalho(finding.atalho),
      AU_normalizeFront(finding.front),
      String(finding.e2eId ?? ""),
      String(finding.uatId ?? ""),
      AU_normalizeText(finding.problem)
    ].join("||");

    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }

  return Array.from(unique.values());
}

// Registra no log a quantidade de achados por regra e severidade.
function AU_logFindingBreakdown(
  findings: AU_AuditFinding[]
): void {
  const counts = new Map<string, number>();

  for (const finding of findings) {
    const id = String(finding.rule ?? "SEM_REGRA").trim() || "SEM_REGRA";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const ids = Array.from(counts.keys()).sort();
  const parts: string[] = [];

  for (const id of ids) {
    parts.push(`${id}=${counts.get(id) ?? 0}`);
  }

  console.log(
    `Audit QA - achados por regra: ${parts.length > 0 ? parts.join("; ") : "nenhum"}`
  );
}

// Lê os parâmetros usados pelo motor de auditoria.
function AU_readParameters(table: ExcelScript.Table): Map<string, string> {
  const result = new Map<string, string>();

  for (const row of AU_getTableRows(table)) {
    const key = AU_textValue(row, "Parâmetro");
    const value = AU_textValue(row, "Valor");

    if (key !== "") {
      result.set(key, value);
    }
  }

  return result;
}

// Obtém um parâmetro da auditoria usando valor padrão quando necessário.
function AU_getParameter(
  parameters: Map<string, string>,
  key: string,
  fallback: string
): string {
  const value = parameters.get(key);
  return value && value.trim() !== "" ? value.trim() : fallback;
}

// Atualiza um parâmetro de status ou controle da auditoria.
function AU_updateParameter(
  table: ExcelScript.Table,
  parameterName: string,
  newValue: string
): void {
  const headers = table.getHeaderRowRange().getTexts()[0];
  const parameterIndex = headers.findIndex((h) => AU_normalizeText(h) === AU_normalizeText("Parâmetro"));
  const valueIndex = headers.findIndex((h) => AU_normalizeText(h) === AU_normalizeText("Valor"));

  if (parameterIndex < 0 || valueIndex < 0) {
    return;
  }

  const dataRange = table.getRangeBetweenHeaderAndTotal();
  const values = dataRange.getValues();

  for (let r = 0; r < values.length; r++) {
    if (AU_normalizeText(String(values[r][parameterIndex] ?? "")) === AU_normalizeText(parameterName)) {
      dataRange.getCell(r, valueIndex).setValue(newValue);
      return;
    }
  }
}

// Atualiza um parâmetro sem mascarar o erro original em caso de falha.
function AU_updateParameterSafe(
  table: ExcelScript.Table,
  parameterName: string,
  newValue: string
): void {
  try {
    AU_updateParameter(table, parameterName, newValue);
  } catch (error) {
    console.log(`Falha ao atualizar parâmetro ${parameterName}: ${AU_formatError(error)}`);
  }
}

/* =========================================================
   CONVERSÃO DOS DADOS
   ========================================================= */

// Converte uma linha da base de execuções em registro tipado da auditoria.
function AU_rowToExecRecord(row: AU_RowObject): AU_ExecRecord {
  return {
    planKey: AU_textValue(row, "PlanKey"),
    planId: AU_numberValue(row, "PlanId"),
    planName: AU_textValue(row, "PlanName"),
    frente: AU_textValue(row, "Frente"),
    onda: AU_textValue(row, "Onda"),
    atalho: AU_textValue(row, "Atalho"),
    suiteId: AU_numberValue(row, "SuiteId"),
    suiteName: AU_textValue(row, "SuiteName"),
    testPointId: AU_numberValue(row, "TestPointId"),
    testCaseId: AU_numberValue(row, "TestCaseId"),
    title: AU_textValue(row, "TestCaseTitle"),
    testCaseState: AU_textValue(row, "TestCaseState"),
    testPointState: AU_textValue(row, "TestPointState"),
    outcome: AU_textValue(row, "Outcome"),
    dateCompleted: AU_textValue(row, "DateCompleted"),
    runBy: AU_textValue(row, "RunBy"),
    lastUpdatedDate: AU_textValue(row, "LastUpdatedDate"),
    lastTestRunId: AU_numberValue(row, "LastTestRunId"),
    lastResultId: AU_numberValue(row, "LastResultId"),
    link: AU_textValue(row, "TestCaseLink"),
    tags: AU_textValue(row, "TestCaseTags")
  };
}

// Converte um mapeamento para a linha gravada em Auditoria_Mapeamento.
function AU_mappingToOutputRow(mapping: AU_MappingRecord): AU_Cell[] {
  const uat = mapping.matched;

  return [
    mapping.e2e.atalho,
    mapping.front,
    mapping.e2e.testCaseId,
    mapping.e2e.title,
    mapping.e2e.testCaseState,
    mapping.e2e.outcome,
    uat ? uat.testCaseId : "",
    uat ? uat.title : "",
    uat ? uat.testCaseState : "",
    uat ? uat.outcome : "",
    mapping.exactCandidates.length,
    mapping.status,
    mapping.type,
    AU_round1(mapping.suggestionSimilarity),
    mapping.suggestion ? mapping.suggestion.testCaseId : "",
    mapping.suggestion ? mapping.suggestion.title : "",
    mapping.observation,
    mapping.e2e.link,
    uat ? uat.link : ""
  ];
}

// Converte um achado para a linha gravada em Auditoria_Resultados.
function AU_findingToOutputRow(finding: AU_AuditFinding): AU_Cell[] {
  return [
    finding.severity,
    finding.rule,
    finding.category,
    finding.plan,
    finding.atalho,
    finding.front,
    finding.e2eId,
    finding.uatId,
    finding.e2eStatus,
    finding.e2eOutcome,
    finding.uatStatus,
    finding.uatOutcome,
    finding.problem,
    finding.expected,
    finding.found,
    finding.actionable,
    finding.e2eLink,
    finding.uatLink,
    finding.observation
  ];
}

// Monta um achado referente a apenas um dos planos.
function AU_singlePlanFinding(
  rule: AU_RuleDef,
  plan: string,
  row: AU_ExecRecord,
  isE2E: boolean,
  problem: string,
  expected: string,
  found: string,
  observation: string
): AU_AuditFinding {
  return {
    severity: rule.severity,
    rule: rule.id,
    category: rule.category,
    plan,
    atalho: row.atalho,
    front: isE2E ? "" : row.frente,
    e2eId: isE2E ? row.testCaseId : "",
    uatId: isE2E ? "" : row.testCaseId,
    e2eStatus: isE2E ? row.testCaseState : "",
    e2eOutcome: isE2E ? row.outcome : "",
    uatStatus: isE2E ? "" : row.testCaseState,
    uatOutcome: isE2E ? "" : row.outcome,
    problem,
    expected,
    found,
    actionable: "SIM",
    e2eLink: isE2E ? row.link : "",
    uatLink: isE2E ? "" : row.link,
    observation
  };
}

// Monta um achado referente ao relacionamento E2E ↔ UAT.
function AU_parallelFinding(
  rule: AU_RuleDef,
  mapping: AU_MappingRecord,
  problem: string,
  expected: string,
  found: string,
  observation: string
): AU_AuditFinding {
  const uat = mapping.matched!;

  return {
    severity: rule.severity,
    rule: rule.id,
    category: rule.category,
    plan: "E2E↔UAT",
    atalho: mapping.e2e.atalho,
    front: mapping.front,
    e2eId: mapping.e2e.testCaseId,
    uatId: uat.testCaseId,
    e2eStatus: mapping.e2e.testCaseState,
    e2eOutcome: mapping.e2e.outcome,
    uatStatus: uat.testCaseState,
    uatOutcome: uat.outcome,
    problem,
    expected,
    found,
    actionable: "SIM",
    e2eLink: mapping.e2e.link,
    uatLink: uat.link,
    observation
  };
}

/* =========================================================
   TABELAS / EXCEL
   ========================================================= */

// Obtém uma tabela obrigatória da auditoria e gera erro se ela não existir.
function AU_getRequiredTable(
  workbook: ExcelScript.Workbook,
  tableName: string
): ExcelScript.Table {
  const table = workbook.getTable(tableName);

  if (!table) {
    throw new Error(`Tabela obrigatória não encontrada: ${tableName}`);
  }

  return table;
}

// Converte as linhas de uma tabela da auditoria em objetos chave/valor.
function AU_getTableRows(table: ExcelScript.Table): AU_RowObject[] {
  const headers = table.getHeaderRowRange().getTexts()[0];
  const rowCount = table.getRowCount();

  if (rowCount === 0) {
    return [];
  }

  const values = table.getRangeBetweenHeaderAndTotal().getValues();
  const rows: AU_RowObject[] = [];

  for (const valueRow of values) {
    const row: AU_RowObject = {};

    for (let c = 0; c < headers.length; c++) {
      row[String(headers[c])] = AU_toCell(valueRow[c]);
    }

    rows.push(row);
  }

  return rows;
}

// Substitui os dados de uma tabela da auditoria em lotes.
function AU_replaceTableData(
  table: ExcelScript.Table,
  rows: AU_Cell[][],
  batchSize: number
): void {
  const header = table.getHeaderRowRange();
  const worksheet = table.getWorksheet();
  const headerRow = header.getRowIndex();
  const headerColumn = header.getColumnIndex();
  const columnCount = header.getColumnCount();

  if (rows.some((row) => row.length !== columnCount)) {
    throw new Error(
      `Quantidade de colunas incompatível ao atualizar ${table.getName()}. Esperado=${columnCount}.`
    );
  }

  const oldRowCount = table.getRowCount();
  if (oldRowCount > 0) {
    table.getRangeBetweenHeaderAndTotal().clear(ExcelScript.ClearApplyTo.contents);
  }

  const dataRowCount = Math.max(1, rows.length);
  const target = worksheet.getRangeByIndexes(
    headerRow,
    headerColumn,
    dataRowCount + 1,
    columnCount
  );

  table.resize(target);

  if (rows.length === 0) {
    worksheet
      .getRangeByIndexes(headerRow + 1, headerColumn, 1, columnCount)
      .setValues([new Array(columnCount).fill("") as AU_Cell[]]);
    return;
  }

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    worksheet
      .getRangeByIndexes(headerRow + 1 + start, headerColumn, batch.length, columnCount)
      .setValues(batch);
  }
}

// Limpa os filtros da tabela antes de operações estruturais.
function AU_clearTableFilters(table: ExcelScript.Table): void {
  try {
    table.getAutoFilter().clearCriteria();
  } catch (error) {
    console.log(`Aviso: não foi possível limpar filtro de ${table.getName()}: ${AU_formatError(error)}`);
  }
}

// Atualiza o resumo visual da aba de mapeamento.
function AU_updateMappingSummary(
  sheet: ExcelScript.Worksheet,
  mappings: AU_MappingRecord[]
): void {
  const total = mappings.length;
  const ok = mappings.filter((m) => m.status === "OK").length;
  const closed = mappings.filter((m) => m.status === "ENCERRADO UAT").length;
  const missing = mappings.filter((m) => m.status === "SEM CORRESPONDÊNCIA").length;
  const ambiguous = mappings.filter((m) => m.status === "AMBÍGUO").length;

  sheet.getRange("A4:J4").setValues([[
    "Total esperado", total,
    "OK", ok,
    "Encerrados UAT", closed,
    "Sem correspondência", missing,
    "Ambíguo", ambiguous
  ]]);
}

// Atualiza o resumo visual da aba de resultados.
function AU_updateResultsSummary(
  sheet: ExcelScript.Worksheet,
  findings: AU_AuditFinding[]
): void {
  const total = findings.length;
  const critical = findings.filter((f) => AU_normalizeText(f.severity) === "critica").length;
  const high = findings.filter((f) => AU_normalizeText(f.severity) === "alta").length;
  const mapping = findings.filter((f) => AU_normalizeText(f.category) === "mapeamento").length;
  const flowParallel = findings.filter((f) => {
    const category = AU_normalizeText(f.category);
    return category.indexOf("fluxo") >= 0 || category === "paralelismo";
  }).length;
  const liberation = findings.filter(
    (f) => AU_normalizeText(f.category) === "liberacao"
  ).length;

  sheet.getRange("A4:L4").setValues([[
    "Total", total,
    "Críticas", critical,
    "Altas", high,
    "Mapeamento", mapping,
    "Fluxo/Paralelismo", flowParallel,
    "Liberação", liberation
  ]]);
}

/* =========================================================
   PROTEÇÃO
   ========================================================= */

// Pausa a proteção de uma aba somente quando necessário.
function AU_pauseProtectionIfNeeded(
  worksheet: ExcelScript.Worksheet,
  password: string
): AU_ProtectionState {
  const protection = worksheet.getProtection();

  if (!protection.getProtected()) {
    return { protection, paused: false };
  }

  try {
    if (!protection.checkPassword(password)) {
      throw new Error(`Senha inválida para a aba protegida ${worksheet.getName()}.`);
    }

    protection.pauseProtection(password);
    return { protection, paused: true };
  } catch (error) {
    throw new Error(
      `Não foi possível pausar a proteção da aba ${worksheet.getName()}: ${AU_formatError(error)}`
    );
  }
}

// Retoma a proteção original da aba após a auditoria.
function AU_resumeProtection(state: AU_ProtectionState): void {
  if (!state.paused) {
    return;
  }

  try {
    state.protection.resumeProtection();
  } catch (error) {
    console.log(`Aviso: falha ao retomar proteção: ${AU_formatError(error)}`);
  }
}

/* =========================================================
   NORMALIZAÇÃO / SIMILARIDADE
   ========================================================= */

// Normaliza títulos para comparação entre cenários.
function AU_normalizeTitle(value: string): string {
  let text = AU_removeAccents(String(value ?? ""))
    .toLowerCase()
    .trim();

  text = text.replace(/^\s*\d+\s*[-–—.)]\s*/, "");
  text = text.replace(/[^a-z0-9]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// Normaliza texto removendo acentos, espaços extras e diferenças de caixa.
function AU_normalizeText(value: string): string {
  return AU_removeAccents(String(value ?? ""))
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Normaliza valores simples usados nas comparações de regras.
function AU_normalizeSimple(value: string): string {
  return AU_normalizeText(value).replace(/\s+/g, " ");
}

// Normaliza o nome da frente para comparação e indexação.
function AU_normalizeFront(value: string): string {
  return AU_removeAccents(String(value ?? ""))
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Normaliza o atalho para comparação e mapeamento.
function AU_normalizeAtalho(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

// Remove acentos de um texto.
function AU_removeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Escapa caracteres especiais antes de montar uma expressão regular.
function AU_escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Calcula a similaridade entre dois textos normalizados.
function AU_stringSimilarity(a: string, b: string): number {
  if (a === b) {
    return 100;
  }

  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const lcs = AU_longestCommonSubsequenceLength(a, b);
  return (2 * lcs * 100) / (a.length + b.length);
}

// Calcula a maior subsequência comum usada na similaridade de títulos.
function AU_longestCommonSubsequenceLength(a: string, b: string): number {
  const previous = new Array(b.length + 1).fill(0) as number[];

  for (let i = 1; i <= a.length; i++) {
    const current = new Array(b.length + 1).fill(0) as number[];

    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
      } else {
        current[j] = Math.max(previous[j], current[j - 1]);
      }
    }

    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

/* =========================================================
   HELPERS
   ========================================================= */

// Lê uma coluna textual de uma linha da auditoria.
function AU_textValue(row: AU_RowObject, column: string): string {
  const value = row[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

// Lê uma coluna numérica de uma linha da auditoria.
function AU_numberValue(row: AU_RowObject, column: string): number {
  const value = Number(row[column] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

// Converte um valor para um tipo compatível com célula do Excel.
function AU_toCell(value: string | number | boolean): AU_Cell {
  if (value === undefined || value === null) {
    return "";
  }
  return value;
}

// Arredonda um número para uma casa decimal.
function AU_round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Formata um número como percentual para exibição.
function AU_formatPercent(value: number): string {
  return `${AU_round1(value).toFixed(1)}%`;
}

// Formata data e hora no padrão local do Brasil.
function AU_formatDateTimeBrazil(date: Date): string {
  try {
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return date.toISOString();
  }
}

// Converte qualquer erro da auditoria em uma mensagem legível.
function AU_formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    try {
      const obj = error as {
        message?: string;
        code?: string;
        type?: string;
        method?: string;
        line?: number;
      };

      return [
        obj.message ? `message=${obj.message}` : "",
        obj.code ? `code=${obj.code}` : "",
        obj.type ? `type=${obj.type}` : "",
        obj.method ? `method=${obj.method}` : "",
        obj.line !== undefined ? `line=${obj.line}` : ""
      ].filter((x) => x !== "").join("; ") || String(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}


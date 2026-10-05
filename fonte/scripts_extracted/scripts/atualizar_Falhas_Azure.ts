// Ponto de entrada do Office Script; inicia a atualização do Controle de Falhas.
async function main(workbook: ExcelScript.Workbook): Promise<void> {
  console.log("=== ATUALIZAR CONTROLE DE FALHAS - AZURE ===");
  await runAtualizarFalhasAzure(workbook);
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

  testCase?: FL_ShallowReference;

  testPlan?: FL_ShallowReference;
  testSuite?: FL_ShallowReference;
  testPoint?: FL_ShallowReference;
  configuration?: FL_ShallowReference;

  associatedBugs?: FL_ShallowReference[];
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

// Orquestra todo o fluxo: configuração, validação, coleta, tratamento, consolidação e gravação.
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

    // Lê a configuração de acesso ao Azure na tabela obrigatória definida em TABLES.azure.
    const azure =
      FL_readAzureConfig(
        FL_getRequiredTable(
          workbook,
          TABLES.azure
        )
      );

    // Lê os Test Plans configurados na planilha.
    const allPlans =
      FL_readPlans(
        FL_getRequiredTable(
          workbook,
          TABLES.plans
        )
      );

    /* =====================================================
       CONTROLE DE FALHAS

       Este script NÃO filtra por fase da planilha.
       Ele mantém o comportamento consolidado e carrega TODOS
       os Test Plans ativos (EndToEnd + UAT/Homologação).
       ===================================================== */

    const plans = allPlans;

    console.log(
      `CARGA DE FALHAS: todos os Test Plans ativos (${plans.map(plan => plan.planKey).join(", ")}).`
    );

    // Lê o mapeamento de categorias para responsabilidades.
    const responsibilities =
      FL_readResponsibilities(
        workbook.getTable(
          TABLES.responsibilities
        )
      );

    // Lê onde e como a base de falhas será gravada no Excel.
    const destination =
      FL_readDestination(
        FL_getRequiredTable(
          workbook,
          TABLES.destination
        )
      );

    // Lê quais campos devem aparecer na saída final.
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

    // Monta a lista final de colunas usando os campos ativos.
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

    // Gera a autenticação usada nas chamadas à API do Azure.
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

    // Consulta no Azure a lista de campos disponíveis de Work Item.
    const fieldDefinitions =
      await FL_getWorkItemFieldDefinitions(
        azure,
        authorization
      );

    // Localiza o campo de Categoria da Falha entre os campos do Azure.
    const categoryField =
      FL_findFieldReference(
        fieldDefinitions,
        [
          "Categoria da Falha",
          "Categoria Falha"
        ]
      );

    // Localiza o campo de Ambiente entre os campos do Azure.
    const environmentField =
      FL_findFieldReference(
        fieldDefinitions,
        [
          "Ambiente",
          "Environment"
        ]
      );

    // Monta a lista de campos que serão buscados nos Bugs.
    const workItemFields =
      FL_buildBugWitFields(
        fieldConfigs,
        categoryField,
        environmentField
      );

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

    // Armazena em memória os impactos de Bugs coletados em cada Test Plan.
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

      // Executa a coleta completa de Runs, Results e Bugs do Test Plan atual.
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

    // Reúne todos os IDs únicos de Bugs encontrados nos Test Plans.
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

    // Busca no Azure os Work Items completos dos Bugs encontrados.
    const workItems =
      await FL_getWorkItemsBatch(
        azure,
        allBugIds,
        workItemFields,
        authorization
      );

    // Indexa os Work Items por ID para facilitar a montagem dos registros.
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

    FL_setStatus(
      statusContext,
      "Status",
      "MONTANDO REGISTROS"
    );

    /* =====================================================
       REGISTROS FINAIS
       ===================================================== */

    // Armazena os registros finais de Bugs montados para cada Test Plan.
    const planBugLoads:
      FL_PlanBugLoad[] = [];

    for (
      const planLoad of
      planImpactLoads
    ) {

      // Monta os registros finais de Bugs do Test Plan atual.
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

    // Junta os registros de todos os Test Plans em uma única estrutura.
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

    // Obtém a aba de destino antes de liberar temporariamente a escrita.
    protectedWorksheet =
      FL_getOrCreateWorksheet(
        workbook,
        destination.sheetName
      );

    // Pausa a proteção da aba somente se ela estiver protegida.
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

    // Grava a base consolidada na tabela Controle_Falhas.
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

    FL_setStatus(
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

  // Aplica filtro opcional de suítes quando configurado para o plano.
  const allowedSuiteIds =
    await FL_getAllowedSuiteIdsIfNeeded(
      azure,
      plan,
      authorization
    );

  // Busca todos os Runs do Test Plan atual.
  const runs =
    await FL_getRuns(
      azure,
      plan.planId,
      authorization
    );

  // Armazena os Bugs encontrados e os cenários impactados por cada um.
  const bugImpacts =
    new Map<number, FL_BugImpact>();

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
      Promise<FL_TestResult[]>[] = [];

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
          FL_getResultsWithBugs(
            azure,
            runId,
            authorization
          )
        );

      }

    }

    // Busca em paralelo os resultados dos Runs do lote atual.
    const resultBatches =
      await Promise.all(
        promises
      );

    for (
      const results of
      resultBatches
    ) {

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

        if (
          allowedSuiteIds
        ) {

          const suiteId =
            Number(
              result
                .testSuite
                ?.id ?? 0
            );

          if (
            !suiteId ||
            !allowedSuiteIds.has(
              suiteId
            )
          ) {

            continue;

          }

        }

        // Obtém os Bugs associados ao resultado atual.
        const bugs =
          Array.isArray(
            result.associatedBugs
          )
            ? result.associatedBugs
            : [];

        if (
          bugs.length === 0
        ) {

          continue;

        }

        // Monta uma chave única para representar o cenário impactado.
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
          const bug of
          bugs
        ) {

          const bugId =
            Number(
              bug.id ?? 0
            );

          if (
            !bugId
          ) {

            continue;

          }

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
    runCount:
      runs.length,
    resultCount
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

    // Resolve a Frente a partir das tags do Bug.
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

  // Armazena as linhas finais de Controle_Falhas do plano atual.
  const records:
    FL_DataRow[] = [];

  // Ordena os IDs dos Bugs para montar os registros de forma consistente.
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

    // Obtém os dados completos do Bug já carregados do Azure.
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

    // Resolve o Ambiente a partir do campo específico ou das tags do Bug.
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

    // Monta a linha final que será gravada na planilha de falhas.
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

    if (
      planIndex > 0
    ) {

      rows.push(
        outputFields.map(
          () => ""
        )
      );

      const visualHeader =
        outputFields.map(
          () =>
            "" as FL_CellValue
        );

      const planKeyIndex =
        FL_findNormalizedIndex(
          outputFields,
          "PlanKey"
        );

      if (
        planKeyIndex >= 0
      ) {

        visualHeader[
          planKeyIndex
        ] =
          `PLANO: ${load.plan.planKey}`;

      }

      rows.push(
        visualHeader
      );

      visualHeaderBodyIndexes.push(
        rows.length - 1
      );

    }

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

// Executa uma requisição GET ao Azure DevOps e valida a resposta.
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

// Executa uma requisição POST ao Azure DevOps e valida a resposta.
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

  if (
    error instanceof
    Error
  ) {

    return error.message;

  }

  return String(
    error
  );

}

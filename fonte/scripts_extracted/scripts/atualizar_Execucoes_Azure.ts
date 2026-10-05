// Ponto de entrada do Office Script; inicia a atualização de execuções.
async function main(workbook: ExcelScript.Workbook): Promise<void> {
  console.log("=== ATUALIZAR CONTROLE DE EXECUÇÕES - AZURE ===");
  await runAtualizarExecucoesAzure(workbook);
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

// Orquestra todo o fluxo: configuração, validação, coleta, tratamento, consolidação e gravação.
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

    // Lê a configuração de acesso ao Azure na tabela obrigatória definida em TABLES.azure.
    const azure =
      EX_readAzureConfig(
        EX_getRequiredTable(
          workbook,
          TABLES.azure
        )
      );

    // Lê os Test Plans configurados na planilha.
    const allPlans =
      EX_readPlans(
        EX_getRequiredTable(
          workbook,
          TABLES.plans
        )
      );

    /* =====================================================
       DETECÇÃO AUTOMÁTICA DA FASE DESTA PLANILHA

       A mesma configuração pode conter EndToEnd e UAT ativos.
       O script NÃO carrega mais os dois indiscriminadamente.

       A fase é identificada pelas fórmulas da aba Planejamento:
       - planilha EndToEnd -> fórmulas usam PlanKey = "EndToEnd"
       - planilha Homologação -> fórmulas usam PlanKey = "UAT"

       Se a identificação não for inequívoca, o script para em vez
       de escolher uma base errada.
       ===================================================== */

    /*
     * IMPORTANTE:
     * A detecção automática NÃO filtra a carga das bases.
     * Controle de Execuções continua trazendo TODOS os Test Plans ativos.
     * A fase detectada é usada SOMENTE para os KPIs da Home.
     */
    // Detecta qual fase da planilha será usada somente no cálculo dos KPIs da Home.
    const detectedKpiPlanKey =
      EX_detectWorkbookPlanKey(
        workbook,
        allPlans
      );

    const plans = allPlans;

    console.log(
      `FASE DOS KPIs DETECTADA AUTOMATICAMENTE: ${detectedKpiPlanKey}`
    );
    console.log(
      `CARGA DE EXECUÇÕES: todos os Test Plans ativos (${plans.map(plan => plan.planKey).join(", ")}).`
    );

    // Lê como os níveis das suítes devem virar Frente, Onda e demais colunas.
    const hierarchy =
      EX_readHierarchy(
        EX_getRequiredTable(
          workbook,
          TABLES.hierarchy
        )
      );

    // Lê onde e como a base de execuções será gravada no Excel.
    const destination =
      EX_readDestination(
        EX_getRequiredTable(
          workbook,
          TABLES.destination
        )
      );

    // Lê quais campos devem aparecer na saída final.
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

    // Monta a lista final de colunas usando campos ativos e hierarquia.
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

    // Gera a autenticação usada nas chamadas à API do Azure.
    const authorization =
      EX_buildAuthorization(
        azure.pat
      );

    /* =====================================================
       CARREGA TODOS OS PLANOS PRIMEIRO
       ===================================================== */

    // Armazena em memória os registros coletados de cada Test Plan.
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

      // Executa a coleta completa do Test Plan atual.
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

    // Junta os registros de todos os Test Plans em uma única estrutura.
    const baseOutput =
      EX_buildCombinedOutput(
        planLoads,
        outputFields
      );

    /* =====================================================
       KPI DA HOME

       IMPORTANTE:
       - NÃO adiciona colunas à tbControle_ExecucoesScript.
       - NÃO altera o Controle de Falhas.
       - Usa SOMENTE a fase detectada da planilha para calcular C14:E14.
       - A carga da tabela continua contendo EndToEnd + UAT.
       - C14 + D14 + E14 reconciliam com Failed + Blocked
         da fase correspondente à Home atual.
       ===================================================== */

    EX_setStatus(
      statusContext,
      "Status",
      `CALCULANDO KPIs DA HOME - ${detectedKpiPlanKey}`
    );

    // Calcula os KPIs da Home usando somente a fase detectada.
    const kpiResult =
      await EX_KPI_calculateHomeKpis(
        workbook,
        azure,
        authorization,
        planLoads,
        detectedKpiPlanKey
      );

    const output =
      baseOutput;

    EX_setStatus(
      statusContext,
      "Status",
      "PREPARANDO GRAVAÇÃO"
    );

    /* =====================================================
       PAUSA TEMPORARIAMENTE A PROTEÇÃO DA ABA DESTINO
       ===================================================== */

    // Obtém a aba de destino antes de liberar temporariamente a escrita.
    protectedWorksheet =
      EX_getOrCreateWorksheet(
        workbook,
        destination.sheetName
      );

    // Pausa a proteção da aba somente se ela estiver protegida.
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

    // Grava a base consolidada na tabela Controle_Execucoes.
    EX_replaceUnifiedOutput(
      workbook,
      destination,
      output
    );

    /* =====================================================
       ATUALIZA SOMENTE C14:E14 DA HOME
       ===================================================== */

    // Atualiza os KPIs calculados nas células da Home.
    EX_KPI_writeHomeKpis(
      workbook,
      kpiResult
    );

    console.log(
      `KPI ${detectedKpiPlanKey} - Impactados: ${kpiResult.total}; ` +
      `Foursys: ${kpiResult.foursys}; ` +
      `Cliente: ${kpiResult.cliente}; ` +
      `Reteste: ${kpiResult.reteste}; ` +
      `sem resultado mapeado: ${kpiResult.semResultadoMapeado}.`
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

    if (
      planIndex > 0
    ) {

      /*
       * Linha vazia entre planos.
       */
      rows.push(
        outputFields.map(
          () => ""
        )
      );

      /*
       * Cabeçalho visual.
       */
      const visualHeader =
        outputFields.map(
          field =>
            field as EX_CellValue
        );

      if (
        visualHeader.length > 0
      ) {

        visualHeader[0] =
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
   DETECÇÃO AUTOMÁTICA DA FASE SOMENTE PARA OS KPIs DA HOME
   ========================================================= */

// Identifica se os KPIs da planilha atual devem usar EndToEnd ou UAT.
function EX_detectWorkbookPlanKey(
  workbook: ExcelScript.Workbook,
  configuredPlans: EX_PlanConfig[]
): string {

  if (configuredPlans.length === 0) {
    throw new Error(
      'Nenhum Test Plan ativo encontrado em tbScriptTestPlans.'
    );
  }

  if (configuredPlans.length === 1) {
    return configuredPlans[0].planKey;
  }

  const planningCandidates = [
    "2) Planejamento",
    "Planejamento"
  ];

  let planning:
    ExcelScript.Worksheet | undefined;

  for (const sheetName of planningCandidates) {
    const sheet =
      workbook.getWorksheet(sheetName);

    if (sheet) {
      planning = sheet;
      break;
    }
  }

  if (!planning) {
    throw new Error(
      'Não foi possível detectar automaticamente a fase: aba "2) Planejamento" não encontrada.'
    );
  }

  const usedRange =
    planning.getUsedRange();

  if (!usedRange) {
    throw new Error(
      `Não foi possível detectar automaticamente a fase: a aba "${planning.getName()}" está vazia.`
    );
  }

  const formulas =
    usedRange.getFormulas();

  const scores =
    configuredPlans.map(
      plan => {

        const quotedKey =
          `"${plan.planKey.toUpperCase()}"`;

        let occurrences = 0;

        for (const row of formulas) {
          for (const cell of row) {

            if (typeof cell !== "string") {
              continue;
            }

            const formula =
              cell.toUpperCase();

            if (!formula.startsWith("=")) {
              continue;
            }

            let position = 0;

            while (true) {
              const found =
                formula.indexOf(
                  quotedKey,
                  position
                );

              if (found < 0) {
                break;
              }

              occurrences++;
              position =
                found + quotedKey.length;
            }

          }
        }

        return {
          plan,
          occurrences
        };

      }
    );

  scores.sort(
    (a, b) =>
      b.occurrences - a.occurrences
  );

  const best = scores[0];
  const second = scores[1];

  console.log(
    `Detecção de fase pela aba ${planning.getName()}: ` +
    scores
      .map(
        item =>
          `${item.plan.planKey}=${item.occurrences}`
      )
      .join("; ")
  );

  if (
    !best ||
    best.occurrences <= 0
  ) {
    throw new Error(
      'Não foi possível detectar automaticamente a fase da planilha pelas fórmulas de Planejamento. Nenhum PlanKey configurado foi encontrado.'
    );
  }

  if (
    second &&
    second.occurrences ===
    best.occurrences
  ) {
    throw new Error(
      `Detecção de fase ambígua: ${best.plan.planKey} e ${second.plan.planKey} aparecem ${best.occurrences} vezes nas fórmulas de Planejamento. O script foi interrompido para não carregar a base errada.`
    );
  }

  return best.plan.planKey;
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


/* ================= KPI HOME - CENÁRIOS IMPACTADOS ================ */

/*
 * Esta rotina pertence ao Atualizar_Execucoes_Azure.
 *
 * Ela NÃO cria colunas auxiliares e NÃO modifica a estrutura das
 * tabelas de Execuções ou Falhas.
 *
 * Regra aplicada aos cenários da fase da Home detectada automaticamente
 * (EndToEnd ou UAT) com Outcome Failed/Blocked:
 *
 * 1) Obtém os Bugs associados ao ÚLTIMO resultado do cenário no Azure.
 * 2) Se existir Bug New/Active, o Bug aberto mais recente define o bucket:
 *      - Responsável contendo "Foursys" => Foursys
 *      - Responsável contendo "Cliente" ou "CVP" => Cliente
 * 3) Sem Bug New/Active => Reteste.
 *    Isso inclui Resolved, Teste, Closed, outro status ou ausência de Bug.
 *
 * O resultado é gravado SOMENTE em:
 *   Home PORT.!C14 = Foursys
 *   Home PORT.!D14 = Cliente
 *   Home PORT.!E14 = Retestes
 *
 * A14 NÃO é alterada pelo script.
 */

interface EX_KPI_BugRecord {
  bugId: number;
  responsavel: string;
  status: string;
  criacaoMs: number;
}

interface EX_KPI_TestResult {
  id?: number;
  associatedBugs?: EX_ShallowReference[];
}

interface EX_KPI_Scenario {
  runId: number;
  resultId: number;
}

interface EX_KPI_Stats {
  total: number;
  foursys: number;
  cliente: number;
  reteste: number;
  semResultadoMapeado: number;
}

const EX_KPI_BUG_TABLE = "tbControle_FalhasScript";
const EX_KPI_RUN_CONCURRENCY = 4;
const EX_KPI_RESULT_PAGE_SIZE = 200;
const EX_KPI_HOME_CANDIDATES = [
  "Home PORT.",
  "Home PORT",
  "Home"
];

// Calcula os cenários impactados da Home e classifica Foursys, Cliente ou Reteste.
async function EX_KPI_calculateHomeKpis(
  workbook: ExcelScript.Workbook,
  azure: EX_AzureConfig,
  authorization: string,
  planLoads: EX_PlanExecutionLoad[],
  kpiPlanKey: string
): Promise<EX_KPI_Stats> {

  const scenarios: EX_KPI_Scenario[] = [];

  for (const load of planLoads) {

    if (
      EX_normalize(load.plan.planKey) !==
      EX_normalize(kpiPlanKey)
    ) {
      continue;
    }

    for (const row of load.rows) {

      const outcome =
        EX_normalize(
          String(
            EX_getRecordValue(
              row,
              "Outcome"
            ) ?? ""
          )
        );

      if (
        outcome !== "failed" &&
        outcome !== "blocked"
      ) {
        continue;
      }

      const runId =
        EX_KPI_toPositiveInteger(
          EX_getRecordValue(
            row,
            "LastTestRunId"
          )
        );

      const resultId =
        EX_KPI_toPositiveInteger(
          EX_getRecordValue(
            row,
            "LastResultId"
          )
        );

      scenarios.push({
        runId,
        resultId
      });
    }
  }

  const stats: EX_KPI_Stats = {
    total: scenarios.length,
    foursys: 0,
    cliente: 0,
    reteste: 0,
    semResultadoMapeado: 0
  };

  if (scenarios.length === 0) {
    return stats;
  }

  const bugById =
    EX_KPI_readBugMetadata(
      workbook,
      kpiPlanKey
    );

  const runIds =
    Array.from(
      new Set(
        scenarios
          .map(item => item.runId)
          .filter(id => id > 0)
      )
    );

  const bugsByResult =
    await EX_KPI_loadBugsByResult(
      azure,
      authorization,
      runIds
    );

  for (const scenario of scenarios) {

    if (
      scenario.runId <= 0 ||
      scenario.resultId <= 0
    ) {
      stats.reteste++;
      stats.semResultadoMapeado++;
      continue;
    }

    const resultKey =
      EX_KPI_resultKey(
        scenario.runId,
        scenario.resultId
      );

    const bugIds =
      bugsByResult.get(
        resultKey
      );

    if (!bugIds) {
      stats.reteste++;
      stats.semResultadoMapeado++;
      continue;
    }

    const bugs: EX_KPI_BugRecord[] = [];

    for (const bugId of bugIds) {
      const bug =
        bugById.get(
          bugId
        );

      if (bug) {
        bugs.push(bug);
      }
    }

    const bucket =
      EX_KPI_classifyBugs(
        bugs
      );

    if (bucket === "Foursys") {
      stats.foursys++;
    }
    else if (bucket === "Cliente") {
      stats.cliente++;
    }
    else {
      stats.reteste++;
    }
  }

  const reconciled =
    stats.foursys +
    stats.cliente +
    stats.reteste;

  if (reconciled !== stats.total) {
    throw new Error(
      `Falha na reconciliação dos KPIs da Home: ` +
      `${stats.total} cenários Failed/Blocked, mas ` +
      `Foursys + Cliente + Reteste = ${reconciled}.`
    );
  }

  return stats;
}

// Lê da base de falhas os dados necessários para classificar os Bugs dos KPIs.
function EX_KPI_readBugMetadata(
  workbook: ExcelScript.Workbook,
  kpiPlanKey: string
): Map<number, EX_KPI_BugRecord> {

  const table =
    workbook.getTable(
      EX_KPI_BUG_TABLE
    );

  if (!table) {
    throw new Error(
      `Tabela obrigatória não encontrada: ${EX_KPI_BUG_TABLE}. ` +
      `Execute Atualizar_Falhas_Azure antes de Atualizar_Execucoes_Azure.`
    );
  }

  const headers =
    table
      .getHeaderRowRange()
      .getTexts()[0]
      .map(value => String(value ?? "").trim());

  const planIndex =
    EX_KPI_findHeaderIndex(
      headers,
      ["PlanKey"]
    );

  const idIndex =
    EX_KPI_findHeaderIndex(
      headers,
      ["ID", "BugId", "Bug ID"]
    );

  const responsavelIndex =
    EX_KPI_findHeaderIndex(
      headers,
      [
        "Responsavel",
        "Responsável",
        "Responsabilidade"
      ]
    );

  const statusIndex =
    EX_KPI_findHeaderIndex(
      headers,
      ["Status", "State"]
    );

  const criacaoIndex =
    EX_KPI_findHeaderIndex(
      headers,
      ["Criação", "Criacao", "CreatedDate"]
    );

  if (
    idIndex < 0 ||
    responsavelIndex < 0 ||
    statusIndex < 0
  ) {
    throw new Error(
      `A tabela ${EX_KPI_BUG_TABLE} precisa conter ` +
      `ID, Responsavel e Status.`
    );
  }

  const values =
    table
      .getRangeBetweenHeaderAndTotal()
      .getValues();

  const map =
    new Map<number, EX_KPI_BugRecord>();

  for (const row of values) {

    if (planIndex >= 0) {
      const planKey =
        String(
          row[planIndex] ?? ""
        ).trim();

      if (
        planKey &&
        EX_normalize(planKey) !==
        EX_normalize(kpiPlanKey)
      ) {
        continue;
      }
    }

    const bugId =
      EX_KPI_toPositiveInteger(
        row[idIndex]
      );

    if (bugId <= 0) {
      continue;
    }

    map.set(
      bugId,
      {
        bugId,
        responsavel:
          String(
            row[responsavelIndex] ?? ""
          ).trim(),
        status:
          String(
            row[statusIndex] ?? ""
          ).trim(),
        criacaoMs:
          criacaoIndex >= 0
            ? EX_KPI_parseDateMs(
              row[criacaoIndex]
            )
            : 0
      }
    );
  }

  return map;
}

// Relaciona os Bugs encontrados ao último Run/Result de cada cenário.
async function EX_KPI_loadBugsByResult(
  azure: EX_AzureConfig,
  authorization: string,
  runIds: number[]
): Promise<Map<string, number[]>> {

  const map =
    new Map<string, number[]>();

  let processedRuns = 0;

  for (
    let start = 0;
    start < runIds.length;
    start += EX_KPI_RUN_CONCURRENCY
  ) {

    const batch =
      runIds.slice(
        start,
        Math.min(
          start + EX_KPI_RUN_CONCURRENCY,
          runIds.length
        )
      );

    const resultBatches =
      await Promise.all(
        batch.map(
          runId =>
            EX_KPI_getRunResultsWithBugs(
              azure,
              runId,
              authorization
            )
        )
      );

    for (
      let index = 0;
      index < batch.length;
      index++
    ) {

      const runId =
        batch[index];

      const results =
        resultBatches[index];

      for (const result of results) {

        const resultId =
          Number(
            result.id ?? 0
          );

        if (resultId <= 0) {
          continue;
        }

        const bugIds =
          Array.isArray(
            result.associatedBugs
          )
            ? Array.from(
              new Set(
                result.associatedBugs
                  .map(
                    bug =>
                      Number(
                        bug.id ?? 0
                      )
                  )
                  .filter(
                    id => id > 0
                  )
              )
            )
            : [];

        map.set(
          EX_KPI_resultKey(
            runId,
            resultId
          ),
          bugIds
        );
      }
    }

    processedRuns +=
      batch.length;

    console.log(
      `KPI Home: ${processedRuns}/${runIds.length} Runs analisados.`
    );
  }

  return map;
}

// Consulta os resultados de um Run e retorna os Bugs associados.
async function EX_KPI_getRunResultsWithBugs(
  azure: EX_AzureConfig,
  runId: number,
  authorization: string
): Promise<EX_KPI_TestResult[]> {

  const all: EX_KPI_TestResult[] = [];

  let skip = 0;

  while (true) {

    const details =
      encodeURIComponent(
        "WorkItems,Point"
      );

    const url =
      `${EX_projectBaseUrl(azure)}` +
      `/_apis/test/Runs/${runId}/results` +
      `?detailsToInclude=${details}` +
      `&$top=${EX_KPI_RESULT_PAGE_SIZE}` +
      `&$skip=${skip}` +
      `&api-version=` +
      `${encodeURIComponent(azure.apiVersion)}`;

    const data =
      await EX_azureGet<
        EX_AzureListResponse<EX_KPI_TestResult>
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
      EX_KPI_RESULT_PAGE_SIZE
    ) {
      break;
    }

    skip +=
      EX_KPI_RESULT_PAGE_SIZE;
  }

  return all;
}

// Classifica um conjunto de Bugs em Foursys, Cliente ou Reteste.
function EX_KPI_classifyBugs(
  bugs: EX_KPI_BugRecord[]
): "Foursys" | "Cliente" | "Reteste" {

  const openBugs =
    bugs
      .filter(
        bug => {
          const status =
            EX_normalize(
              bug.status
            );

          return (
            status === "new" ||
            status === "active"
          );
        }
      )
      .sort(
        (a, b) => {
          if (
            a.criacaoMs !==
            b.criacaoMs
          ) {
            return (
              b.criacaoMs -
              a.criacaoMs
            );
          }

          return (
            b.bugId -
            a.bugId
          );
        }
      );

  if (openBugs.length === 0) {
    return "Reteste";
  }

  const responsavel =
    EX_normalize(
      openBugs[0].responsavel
    );

  if (
    responsavel.includes(
      "foursys"
    )
  ) {
    return "Foursys";
  }

  if (
    responsavel.includes(
      "cliente"
    ) ||
    responsavel.includes(
      "cvp"
    )
  ) {
    return "Cliente";
  }

  return "Reteste";
}

// Grava os valores calculados dos KPIs nas células da Home.
function EX_KPI_writeHomeKpis(
  workbook: ExcelScript.Workbook,
  stats: EX_KPI_Stats
): void {

  let home:
    ExcelScript.Worksheet |
    undefined;

  for (
    const candidate of
    EX_KPI_HOME_CANDIDATES
  ) {

    const found =
      workbook.getWorksheet(
        candidate
      );

    if (found) {
      home = found;
      break;
    }
  }

  if (!home) {
    throw new Error(
      `A aba Home não foi encontrada. Procurado: ` +
      `${EX_KPI_HOME_CANDIDATES.join(", ")}.`
    );
  }

  let protectionWasPaused =
    false;

  try {

    // Pausa a proteção da aba somente se ela estiver protegida.
    protectionWasPaused =
      EX_pauseWorksheetProtection(
        home,
        EX_SHEET_PROTECTION_PASSWORD
      );

    /*
     * SOMENTE estes três KPIs são gravados.
     * A14 continua sendo responsabilidade da fórmula existente.
     */
    home
      .getRange(
        "C14:E14"
      )
      .setValues([[
        stats.foursys,
        stats.cliente,
        stats.reteste
      ]]);

    workbook
      .getApplication()
      .calculate(
        ExcelScript.CalculationType.full
      );

  }
  finally {

    if (
      protectionWasPaused &&
      home
    ) {

      try {
        EX_resumeWorksheetProtection(
          home
        );
      }
      catch (protectionError) {
        console.log(
          `ATENÇÃO: não foi possível retomar a proteção da Home: ` +
          `${EX_formatError(protectionError)}`
        );
      }
    }
  }
}

// Localiza uma coluna pelo nome dentro do cabeçalho da tabela.
function EX_KPI_findHeaderIndex(
  headers: string[],
  aliases: string[]
): number {

  for (const alias of aliases) {

    const index =
      EX_findNormalizedIndex(
        headers,
        alias
      );

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

// Cria uma chave única para identificar a combinação Run + Result.
function EX_KPI_resultKey(
  runId: number,
  resultId: number
): string {
  return `${runId}|${resultId}`;
}

// Converte um valor para inteiro positivo ou retorna zero.
function EX_KPI_toPositiveInteger(
  value: unknown
): number {

  const numeric =
    Number(
      String(
        value ?? ""
      )
        .trim()
        .replace(
          ",",
          "."
        )
    );

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return 0;
  }

  return Math.trunc(
    numeric
  );
}

// Converte uma data em milissegundos para permitir comparação cronológica.
function EX_KPI_parseDateMs(
  value: unknown
): number {

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return (
      value - 25569
    ) * 86400000;
  }

  const text =
    String(
      value ?? ""
    ).trim();

  if (!text) {
    return 0;
  }

  const br =
    text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );

  if (br) {
    return new Date(
      Number(br[3]),
      Number(br[2]) - 1,
      Number(br[1]),
      Number(br[4]),
      Number(br[5]),
      Number(br[6] ?? "0")
    ).getTime();
  }

  const parsed =
    Date.parse(
      text
    );

  return Number.isNaN(parsed)
    ? 0
    : parsed;
}


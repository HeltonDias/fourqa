package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.azure.AzureTestDataSource;
import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.connector.TestDataSource;
import com.fourqa.api.connector.TestDataSources;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.services.SyncService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** ADR 009, etapa E1: o sync consome a porta {@link TestDataSource} e o Azure continua sendo o padrão. */
class SyncServiceConnectorTest extends ApiTestSupport {
  private static final String PLAN_KEY = "Org/Proj/42";

  @AfterEach
  void resetFactory() {
    TestDataSources.reset();
  }

  private static Map<String, Object> cfg() {
    Map<String, Object> azure = new LinkedHashMap<>();
    azure.put("organization", "Org");
    azure.put("project", "Proj");
    azure.put("apiVersion", "7.1");
    azure.put("pat", "segredo-de-teste");
    Map<String, Object> cfg = new LinkedHashMap<>();
    cfg.put("azure", azure);
    return cfg;
  }

  private static Map<String, Object> execRow() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("plan_key", PLAN_KEY);
    row.put("plan_id", 42L);
    row.put("plan_name", "Plano");
    row.put("suite_id", 10L);
    row.put("suite_name", "Login");
    row.put("test_point_id", 100L);
    row.put("test_case_id", 1000L);
    row.put("test_case_title", "Entrar");
    row.put("outcome", "passed");
    return row;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object>[] fixedDraft() {
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("planKey", PLAN_KEY);
    plan.put("execucoes", new ArrayList<>(List.of(execRow())));
    plan.put("falhas", new ArrayList<>());
    plan.put("dimensions", new ArrayList<>());
    plan.put("kpi", null);
    Map<String, Object> draft = new LinkedHashMap<>();
    draft.put("kpiPlanKey", PLAN_KEY);
    draft.put("plans", new ArrayList<>(List.of(plan)));
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("ultima_sincronizacao_azure", "2026-11-24T00:00:00+00:00");
    Map<String, Object> artifacts = new LinkedHashMap<>();
    artifacts.put("fetchedAt", "2026-11-24T00:00:00+00:00");
    artifacts.put("workbookMeta", meta);
    artifacts.put("summary", new LinkedHashMap<>(Map.of("planos", 1L)));
    return new Map[] {draft, artifacts};
  }

  @Test
  void defaultFactoryResolvesAzureAdapter() {
    TestDataSource source = TestDataSources.forConfig(cfg());
    assertInstanceOf(AzureTestDataSource.class, source);
  }

  @Test
  void resetRestoresAzureFactoryAfterOverride() {
    TestDataSource fake = (c, r) -> fixedDraft();
    TestDataSources.setFactoryForTesting(c -> fake);
    assertSame(fake, TestDataSources.forConfig(cfg()));
    TestDataSources.reset();
    assertInstanceOf(AzureTestDataSource.class, TestDataSources.forConfig(cfg()));
  }

  @Test
  void syncPersistsSnapshotAndCacheFromFakeSource() {
    List<String> steps = new ArrayList<>();
    Map<String, Object>[] seenCfg = new Map[1];
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> {
      seenCfg[0] = cfg;
      report.step("Etapa fake", null, null);
      steps.add("refresh");
      return fixedDraft();
    });
    Map<String, Object> cfg = cfg();

    SyncService.runSync(cfg, PyTime.nowUtc(), null);

    assertSame(cfg, seenCfg[0]);
    assertEquals(List.of("refresh"), steps);
    List<Map<String, Object>> rows = Stores.get().durableSnapshot.listExecucoes(PLAN_KEY);
    assertEquals(1, rows.size());
    assertEquals("passed", rows.get(0).get("outcome"));
    assertEquals(100L, ((Number) rows.get(0).get("test_point_id")).longValue());
    Map<String, Object> cached = InMemoryAzureCache.get().getPlan(PLAN_KEY);
    assertEquals("loaded", cached.get("state"));
    assertEquals(1, ((List<?>) cached.get("execucoes")).size());
    assertEquals("success", SyncService.getSyncState().get("status"));
    assertEquals("Concluído", SyncService.getSyncState().get("step"));
    assertNotNull(Stores.get().meta.get("ultima_sincronizacao_azure"));
  }

  /**
   * O ramo durável (publishSyncIfOwner com jobId) só roda com PostgreSQL ({@code SyncJob.isDurableSyncRuntime}); não há
   * PostgreSQL isolado neste ambiente de teste. Aqui se prova que, em SQLite, um jobId é ignorado e a porta alimenta o
   * mesmo caminho de gravação não durável.
   */
  @Test
  void jobIdIsIgnoredOnNonDurableRuntimeAndSnapshotIsPublished() {
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> fixedDraft());

    SyncService.runSync(cfg(), PyTime.nowUtc(), "job-sem-efeito-em-sqlite");

    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).size());
    assertEquals("success", SyncService.getSyncState().get("status"));
  }

  @Test
  void azureHttpErrorFromSourcePropagatesWithSameMessage() {
    String message = "PAT recusado.";
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> {
      throw new AzureHttpError(message, 401);
    });

    AzureHttpError thrown =
        assertThrows(AzureHttpError.class, () -> SyncService.runSync(cfg(), PyTime.nowUtc(), null));

    assertEquals(message, thrown.getMessage());
    assertEquals(message, SyncService.userMessage(thrown));
    assertTrue(Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).isEmpty());
    assertFalse(InMemoryAzureCache.get().isRefreshing(), "refresh deve ser liberado após a falha");
  }

  @Test
  void sourceIsCreatedBeforeRefreshLikeLegacyClientConstruction() {
    boolean[] created = {false};
    TestDataSources.setFactoryForTesting(c -> {
      created[0] = true;
      throw new IllegalStateException("config inválida");
    });
    assertThrows(IllegalStateException.class, () -> SyncService.runSync(cfg(), PyTime.nowUtc(), null));
    assertTrue(created[0]);
    assertFalse(InMemoryAzureCache.get().isRefreshing(), "falha na criação não pode deixar o cache travado");
  }
}

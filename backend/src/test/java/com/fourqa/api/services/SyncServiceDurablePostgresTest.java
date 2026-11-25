package com.fourqa.api.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.config.Env;
import com.fourqa.api.connector.TestDataSources;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.Stores;
import java.net.URI;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * ADR 009, etapa E1: caminho durável do sync (jobId, publishSyncIfOwner) pela porta {@code TestDataSource}, num
 * PostgreSQL local e descartável.
 *
 * <p>Só roda quando {@code FOURQA_TEST_POSTGRES_URL} está definida (sem ela o teste é ignorado por premissa; o
 * {@code mvnw verify} padrão não depende de PostgreSQL). Guardas: o host precisa ser loopback e o banco precisa se chamar
 * {@code fourqa_test*}; o schema {@code public} é recriado antes de cada teste.
 */
class SyncServiceDurablePostgresTest {
  private static final String URL_VAR = "FOURQA_TEST_POSTGRES_URL";
  private static final String PLAN_KEY = "Org/Proj/42";
  private static final String OTHER_PLAN_KEY = "Org/Proj/99";

  private String url;

  @BeforeEach
  void isolatedPostgres() throws Exception {
    url = System.getenv(URL_VAR);
    assumeTrue(url != null && !url.isBlank(), URL_VAR + " não definida: teste de PostgreSQL descartável ignorado");
    URI uri = URI.create(url.replaceFirst("^postgres(ql)?://", "http://"));
    String host = uri.getHost();
    String db = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");
    if (!("localhost".equals(host) || "127.0.0.1".equals(host)) || !db.startsWith("fourqa_test")) {
      throw new IllegalStateException("Recusado: o teste só aceita PostgreSQL loopback com banco fourqa_test*");
    }
    String[] userInfo = uri.getUserInfo() == null ? new String[0] : uri.getUserInfo().split(":", 2);
    Properties props = new Properties();
    if (userInfo.length > 0) props.setProperty("user", userInfo[0]);
    if (userInfo.length > 1) props.setProperty("password", userInfo[1]);
    props.setProperty("sslmode", "disable");
    try (Connection c = DriverManager.getConnection("jdbc:postgresql://" + host + ":" + uri.getPort() + "/" + db, props);
        Statement st = c.createStatement()) {
      try (java.sql.ResultSet rs = st.executeQuery("SELECT current_database()")) {
        assertTrue(rs.next() && rs.getString(1).startsWith("fourqa_test"), "banco conectado precisa ser fourqa_test*");
      }
      st.execute("DROP SCHEMA public CASCADE");
      st.execute("CREATE SCHEMA public");
    }

    Env.clearOverrides();
    for (String name : List.of("VERCEL", "FOURQA_HOSTED", "FOURQA_ALLOW_OPEN_WRITES", "FOURQA_PROTECT_READS",
        "AZURE_CACHE_READ", "AZURE_CACHE_MIRROR", "FOURQA_LOCAL_SQLITE", "DATABASE_SSL_CA", "DATABASE_SSL_CA_FILE")) {
      Env.override(name, null);
    }
    Env.override("DB_PROVIDER", "postgres");
    Env.override("DATABASE_URL", url);
    Stores.reset();
    SyncService.resetForTests();
    TestDataSources.reset();
  }

  @AfterEach
  void cleanup() {
    TestDataSources.reset();
    SyncService.resetForTests();
    Stores.reset();
    Env.clearOverrides();
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

  private static Map<String, Object> execRow(String planKey) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("plan_key", planKey);
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
  private static Map<String, Object>[] draft(String planKey) {
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("planKey", planKey);
    plan.put("execucoes", new ArrayList<>(List.of(execRow(planKey))));
    plan.put("falhas", new ArrayList<>());
    plan.put("dimensions", new ArrayList<>());
    plan.put("kpi", null);
    Map<String, Object> draft = new LinkedHashMap<>();
    draft.put("kpiPlanKey", planKey);
    draft.put("plans", new ArrayList<>(List.of(plan)));
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("ultima_sincronizacao_azure", "2026-11-24T00:00:00+00:00");
    Map<String, Object> artifacts = new LinkedHashMap<>();
    artifacts.put("fetchedAt", "2026-11-24T00:00:00+00:00");
    artifacts.put("workbookMeta", meta);
    artifacts.put("summary", new LinkedHashMap<>(Map.of("planos", 1L)));
    return new Map[] {draft, artifacts};
  }

  /** Reivindica o job como em {@code startDurableSync} e devolve o jobId. */
  @SuppressWarnings("unchecked")
  private static String claim(OffsetDateTime startedAt) {
    Map<String, Object> claimed = SyncJob.claimSyncJob(startedAt);
    assertEquals(Boolean.TRUE, claimed.get("started"));
    SyncService.setState((Map<String, Object>) claimed.get("state"));
    return (String) claimed.get("jobId");
  }

  @Test
  void runtimeIsDurable() {
    assertTrue(SyncJob.isDurableSyncRuntime());
  }

  @Test
  void ownerJobPublishesSnapshotAndMetaThroughPort() {
    List<String> calls = new ArrayList<>();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> {
      calls.add("refresh");
      report.step("Etapa fake", null, null);
      return draft(PLAN_KEY);
    });
    OffsetDateTime startedAt = PyTime.nowUtc();
    String jobId = claim(startedAt);

    SyncService.runSync(cfg(), startedAt, jobId);

    assertEquals(List.of("refresh"), calls);
    List<Map<String, Object>> rows = Stores.get().durableSnapshot.listExecucoes(PLAN_KEY);
    assertEquals(1, rows.size());
    assertEquals("passed", rows.get(0).get("outcome"));
    assertEquals(100L, ((Number) rows.get(0).get("test_point_id")).longValue());
    assertEquals("2026-11-24T00:00:00+00:00", Stores.get().meta.get("ultima_sincronizacao_azure"));
    Map<String, Object> job = SyncJob.readSyncJob();
    assertEquals("success", job.get("status"));
    assertEquals("Concluído", job.get("step"));
    assertEquals("success", SyncService.getSyncState().get("status"));
  }

  @Test
  void nonOwnerJobDoesNotPublishNorOverwriteTheOwnersJob() {
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(PLAN_KEY));
    OffsetDateTime startedAt = PyTime.nowUtc();
    String ownerJobId = claim(startedAt);

    SyncService.runSync(cfg(), startedAt, "outro-job-id-sem-posse");

    assertTrue(Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).isEmpty(), "não-dono não pode publicar");
    assertNull(Stores.get().meta.get("ultima_sincronizacao_azure"));
    Map<String, Object> job = SyncJob.readSyncJob();
    assertEquals("running", job.get("status"), "job do dono segue intacto");
    assertFalse("success".equals(job.get("status")));
    assertNotNull(ownerJobId);
  }

  @Test
  void expiredHeartbeatJobDoesNotPublishSnapshot() {
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(PLAN_KEY));
    OffsetDateTime longAgo = PyTime.nowUtc().minusMinutes(10);
    String jobId = claim(longAgo);

    SyncService.runSync(cfg(), longAgo, jobId);

    assertTrue(Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).isEmpty(), "job vencido não pode publicar no banco");
    assertFalse("success".equals(SyncJob.readSyncJob().get("status")));
  }

  @Test
  void publishReplacesOnlyTheSyncedPlanKey() {
    OffsetDateTime startedAt = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(OTHER_PLAN_KEY));
    SyncService.runSync(cfg(), startedAt, claim(startedAt));
    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(OTHER_PLAN_KEY).size());

    SyncService.resetForTests();
    OffsetDateTime second = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(PLAN_KEY));
    SyncService.runSync(cfg(), second, claim(second));

    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).size());
    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(OTHER_PLAN_KEY).size(), "outro plan_key é preservado");
  }

  @Test
  void sourceFailureMarksOwnerJobAsErrorAndKeepsSnapshot() {
    OffsetDateTime first = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(PLAN_KEY));
    SyncService.runSync(cfg(), first, claim(first));
    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).size());

    SyncService.resetForTests();
    OffsetDateTime second = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> {
      throw new AzureHttpError("PAT recusado.", 401);
    });
    String jobId = claim(second);

    SyncService.runSync(cfg(), second, jobId);

    Map<String, Object> job = SyncJob.readSyncJob();
    assertEquals("error", job.get("status"));
    assertEquals("PAT recusado.", job.get("error"));
    assertEquals(1, Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).size(), "snapshot anterior permanece");
    assertEquals("2026-11-24T00:00:00+00:00", Stores.get().meta.get("ultima_sincronizacao_azure"),
        "meta anterior permanece");
  }

  @Test
  void resyncOfSamePlanKeyReplacesRowContent() {
    OffsetDateTime first = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> draft(PLAN_KEY));
    SyncService.runSync(cfg(), first, claim(first));
    assertEquals("passed", Stores.get().durableSnapshot.listExecucoes(PLAN_KEY).get(0).get("outcome"));

    SyncService.resetForTests();
    OffsetDateTime second = PyTime.nowUtc();
    TestDataSources.setFactoryForTesting(c -> (cfg, report) -> {
      Map<String, Object>[] out = draft(PLAN_KEY);
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> plans = (List<Map<String, Object>>) out[0].get("plans");
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> rows = (List<Map<String, Object>>) plans.get(0).get("execucoes");
      rows.get(0).put("outcome", "failed");
      return out;
    });
    SyncService.runSync(cfg(), second, claim(second));

    List<Map<String, Object>> rows = Stores.get().durableSnapshot.listExecucoes(PLAN_KEY);
    assertEquals(1, rows.size(), "snapshot é substituído, não acumulado");
    assertEquals("failed", rows.get(0).get("outcome"));
  }
}

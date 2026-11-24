package com.fourqa.api.persistence;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.config.Env;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Ports of {@code test_plan_key.py}, {@code test_operational_provider.py} and {@code test_pg_pool.py}. */
class PersistencePortsTest {

  @AfterEach
  void clear() {
    Env.clearOverrides();
  }

  @Test
  void planKeyFromRawFallback() {
    assertEquals("PlanTeste", PlanKeys.planKeyFromRaw(null, "PlanTeste"));
    assertEquals("PlanTeste", PlanKeys.planKeyFromRaw("", "PlanTeste"));
    assertEquals("PlanTeste", PlanKeys.planKeyFromRaw("   ", "PlanTeste"));
    assertEquals("EndToEnd", PlanKeys.planKeyFromRaw(" EndToEnd ", "PlanTeste"));
  }

  @Test
  void explicitPlanKeyForWrites() {
    assertNull(PlanKeys.explicitPlanKeyFromQuery(null));
    assertNull(PlanKeys.explicitPlanKeyFromQuery(List.of("")));
    assertNull(PlanKeys.explicitPlanKeyFromQuery(List.of("A", "B")));
    assertEquals("EndToEnd", PlanKeys.explicitPlanKeyFromQuery(List.of(" EndToEnd ")));
    assertEquals("Informe o planKey.", PlanKeys.planKeyWriteError(null));
    assertEquals("planKey ambíguo.", PlanKeys.planKeyWriteError(List.of("A", "B")));
  }

  @Test
  void requiredPlanKey() {
    assertTrue(assertThrows(IllegalArgumentException.class, () -> PlanKeys.requiredPlanKey(null)).getMessage().contains("planKey obrigatório"));
    assertTrue(assertThrows(IllegalArgumentException.class, () -> PlanKeys.planKeyFromRaw("", "  ")).getMessage().contains("planKey obrigatório"));
  }

  @Test
  void postgresIsAlwaysAllowed() {
    Env.override("FOURQA_LOCAL_SQLITE", "");
    assertDoesNotThrow(() -> OperationalProvider.assertOperationalProvider("postgres"));
  }

  @Test
  void sqliteRequiresLocalOptIn() {
    Env.override("FOURQA_LOCAL_SQLITE", "");
    Env.override("VERCEL", null);
    Env.override("FOURQA_HOSTED", null);
    assertThrows(RuntimeException.class, () -> OperationalProvider.assertOperationalProvider("sqlite"));
    Env.override("FOURQA_LOCAL_SQLITE", "1");
    assertDoesNotThrow(() -> OperationalProvider.assertOperationalProvider("sqlite"));
  }

  @Test
  void sqliteOptInIsRefusedWhenHosted() {
    Env.override("FOURQA_LOCAL_SQLITE", "1");
    Env.override("FOURQA_HOSTED", "1");
    assertThrows(RuntimeException.class, () -> OperationalProvider.assertOperationalProvider("sqlite"));
  }

  static final String PEM = "-----BEGIN CERTIFICATE-----\nTESTE\n-----END CERTIFICATE-----\n";

  @Test
  void inlineCaIsWrittenToTempDir() throws Exception {
    Env.override("DATABASE_SSL_CA", PEM);
    Path path = Path.of(Database.PostgresUrl.caFile(Map.of()));
    assertEquals(Path.of(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize(), path.getParent().toAbsolutePath().normalize());
    assertEquals(PEM.strip(), Files.readString(path));
  }

  @Test
  void inlineCaMustBePem() {
    Env.override("DATABASE_SSL_CA", "not a certificate");
    assertThrows(RuntimeException.class, () -> Database.PostgresUrl.caFile(Map.of()));
  }

  @Test
  void migrationLedgerTimestampMatchesNodeFormat() {
    assertTrue(PyTime.nowMillisZ().matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"));
  }

  @Test
  void singleSqlTree() throws Exception {
    String[] names = Arrays.stream(new org.springframework.core.io.support.PathMatchingResourcePatternResolver()
            .getResources("classpath*:db/**/*.sql"))
        .map(r -> r.getFilename())
        .sorted()
        .toArray(String[]::new);
    assertEquals(List.of(
        "001_baseline.sql", "002_plan_item_identity.sql", "003_plan_suite_fill.sql", "004_planning_change_log.sql",
        "005_users_connections.sql", "006_connection_invite.sql"), Arrays.asList(names));
  }
}

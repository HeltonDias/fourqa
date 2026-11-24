package com.fourqa.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** Vercel deploy shape (SPA + external /api rewrite to the Java host) and the single SQL tree. */
class DeployShapeTest {
  static final Path ROOT = TestPaths.find("vercel.json").getParent();

  @SuppressWarnings("unchecked")
  @Test
  void vercelServesSpaAndProxiesApiToJavaHost() throws Exception {
    Map<String, Object> vercel = (Map<String, Object>) PyJson.loads(Files.readString(ROOT.resolve("vercel.json")));
    assertEquals("frontend/dist", vercel.get("outputDirectory"));
    List<Map<String, Object>> rewrites = Py.rows(vercel.get("rewrites"));
    assertTrue(rewrites.stream().anyMatch(r -> Py.str(r.get("source")).contains("(?!api/)")));
    Map<String, Object> api = rewrites.stream()
        .filter(r -> "/api/:path*".equals(r.get("source")))
        .findFirst()
        .orElseThrow();
    String destination = Py.str(api.get("destination"));
    assertTrue(destination.startsWith("https://"), destination);
    assertTrue(destination.endsWith("/api/:path*"), destination);
    assertFalse(vercel.containsKey("functions"));
    assertFalse(Py.str(vercel.get("installCommand")).contains("requirements.txt"));
    assertFalse(Files.exists(ROOT.resolve("api").resolve("index.py")));
    assertFalse(Files.exists(ROOT.resolve("requirements.txt")));
  }

  @Test
  void vercelignoreExcludesLocalData() throws Exception {
    Set<String> lines = Files.readAllLines(ROOT.resolve(".vercelignore")).stream()
        .map(String::strip)
        .filter(l -> !l.isEmpty() && !l.startsWith("#"))
        .collect(Collectors.toSet());
    for (String pattern : List.of(
        "data/", "*.db", "*.db-wal", "*.db-shm", "*.sqlite", "*.sqlite3", "fonte/**/*.xlsx", "fonte/scripts.zip"))
      assertTrue(lines.contains(pattern), pattern);
  }

  @Test
  void singleSqlTree() throws Exception {
    Path live = ROOT.resolve("backend/src/main/resources/db/postgres");
    try (var files = Files.list(live)) {
      String[] names = files.map(p -> p.getFileName().toString()).filter(n -> n.endsWith(".sql")).sorted().toArray(String[]::new);
      assertEquals(List.of(
          "001_baseline.sql", "002_plan_item_identity.sql", "003_plan_suite_fill.sql", "004_planning_change_log.sql",
          "005_users_connections.sql", "006_connection_invite.sql"), Arrays.asList(names));
    }
    assertFalse(Files.exists(ROOT.resolve("backend/src/db")));
  }

  @Test
  void snapshotReplaceKeepsPlanningAndMeta() throws Exception {
    String store = Files.readString(
        ROOT.resolve("backend/src/main/java/com/fourqa/api/persistence/JdbcAzureSnapshotStore.java"));
    assertTrue(store.contains("DELETE FROM execucoes"));
    assertTrue(store.contains("DELETE FROM falhas"));
    assertFalse(store.contains("DELETE FROM workbook_meta"));
    assertFalse(store.contains("planning_item"));
  }
}

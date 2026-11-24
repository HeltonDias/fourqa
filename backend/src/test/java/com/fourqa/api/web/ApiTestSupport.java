package com.fourqa.api.web;

import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.services.SyncService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/** Fresh SQLite database and clean env per test, like the pytest {@code client} fixtures. */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class ApiTestSupport {
  static final List<String> HIDDEN = List.of(
      "VERCEL", "FOURQA_HOSTED", "FOURQA_ALLOW_OPEN_WRITES", "FOURQA_PROTECT_READS", "DATABASE_URL", "FRONTEND_ORIGIN",
      "FOURQA_ENTRA_TENANT_ID", "FOURQA_ENTRA_CLIENT_ID", "FOURQA_ENTRA_CLIENT_SECRET", "FOURQA_ENTRA_REDIRECT_URI",
      "FOURQA_PAT_LOGIN", "FOURQA_BOOTSTRAP_HEADS", "AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT",
      "SYNC_TEST_PLANS", "SYNC_KPI_PLAN_KEY", "KPI_PLAN_KEY", "AZURE_CACHE_MIRROR");

  @Autowired protected MockMvc mvc;
  protected Path dbDir;

  @BeforeEach
  void freshEnvironment() throws IOException {
    Env.clearOverrides();
    for (String name : HIDDEN) Env.override(name, null);
    dbDir = Files.createTempDirectory("fourqa-test");
    Env.override("FOURQA_DB", dbDir.resolve("fourqa.db").toString());
    Env.override("DB_PROVIDER", "sqlite");
    Env.override("FOURQA_LOCAL_SQLITE", "1");
    Env.override("AZURE_CACHE_READ", "1");
    Env.override("FOURQA_API_TOKEN", "");
    Env.override("FOURQA_SESSION_SECRET", "");
    Env.override("FOURQA_PAT_ENCRYPTION_KEY", "");
    resetState();
  }

  @AfterEach
  void cleanup() {
    resetState();
    Env.clearOverrides();
  }

  static void resetState() {
    Stores.reset();
    InMemoryAzureCache.reset();
    SyncService.resetForTests();
  }

  protected TestClient client() {
    return new TestClient(mvc);
  }
}

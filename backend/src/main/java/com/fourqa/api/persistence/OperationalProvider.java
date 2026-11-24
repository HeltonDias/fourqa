package com.fourqa.api.persistence;

import com.fourqa.api.config.Env;

/** Port of {@code fourqa.persistence.operational_provider} (DEC-T01). */
public final class OperationalProvider {
  private OperationalProvider() {}

  public static boolean localSqliteAllowed() {
    return "1".equals(Env.value("FOURQA_LOCAL_SQLITE")) && !Env.hosted();
  }

  public static void assertOperationalProvider(String value) {
    String provider = value == null ? "" : value.strip().toLowerCase();
    if (provider.equals("postgres")) return;
    if (provider.equals("sqlite") && localSqliteAllowed()) return;
    throw new IllegalStateException(
        "A API exige DB_PROVIDER=postgres. SQLite fica restrito aos testes, ao backup e ao dev local com FOURQA_LOCAL_SQLITE=1.");
  }
}

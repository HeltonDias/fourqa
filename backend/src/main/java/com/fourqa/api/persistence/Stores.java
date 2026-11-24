package com.fourqa.api.persistence;

import com.fourqa.api.azure.AzureCacheRead;

/** Port of {@code fourqa.persistence.provider}: one cached set of stores per process. */
public final class Stores {
  public final MetaStore meta;
  public final AzureSnapshotStore azureSnapshot;
  public final LegacyPlanStore legacyPlan;
  public final PlanningStore planning;
  public final IdentityStore identity;
  public final AzureSnapshotStore durableSnapshot;
  private final boolean readCache;
  private final Database db;

  private static volatile Stores cached;

  private Stores(Database db, boolean readCache) {
    this.db = db;
    this.readCache = readCache;
    MetaStore baseMeta = new JdbcMetaStore(db);
    AzureSnapshotStore baseSnapshot = new JdbcAzureSnapshotStore(db);
    this.durableSnapshot = baseSnapshot;
    this.legacyPlan = new LegacyPlanStore(db);
    this.planning = new PlanningStore(db);
    this.identity = new IdentityStore(db);
    if (readCache) {
      this.meta = AzureCacheRead.wrapMeta(baseMeta);
      this.azureSnapshot = AzureCacheRead.wrapAzure(baseSnapshot);
    } else {
      this.meta = baseMeta;
      this.azureSnapshot = baseSnapshot;
    }
  }

  public static Stores get() {
    Database db = Database.get();
    boolean readCache = AzureCacheRead.isEnabled();
    Stores s = cached;
    if (s != null && s.db == db && s.readCache == readCache) return s;
    synchronized (Stores.class) {
      Migrations.ensure(db);
      cached = new Stores(db, readCache);
      return cached;
    }
  }

  public static void reset() {
    cached = null;
    Database.reset();
  }

  public Database database() {
    return db;
  }

  public static boolean persistenceReady() {
    try {
      Stores s = get();
      if (s.db.isPostgres()) {
        s.db.one("SELECT 1 AS ok");
        return true;
      }
      return Migrations.sqliteSchemaVersion(s.db) >= Migrations.SQLITE_SCHEMA_VERSION;
    } catch (RuntimeException e) {
      org.slf4j.LoggerFactory.getLogger(Stores.class)
          .warn("persistence not ready: {}: {}", e.getClass().getSimpleName(), Database.publicDbError(e));
      return false;
    }
  }
}

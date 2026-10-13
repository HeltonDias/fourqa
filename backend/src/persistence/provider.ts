import { envValue } from "../azure/config.js";
import type { PersistenceStores } from "./contracts.js";

export class PersistenceProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceProviderError";
  }
}

export function publicDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : "erro de banco";
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/password[=:]\s*\S+/gi, "password=***");
}

/** Vazio e sqlite usam o SQLite atual. postgres usa o PostgreSQL. Outro valor falha. */
export function resolveDbProvider(value: string): "sqlite" | "postgres" {
  const name = value.trim().toLowerCase();
  if (name === "" || name === "sqlite") return "sqlite";
  if (name === "postgres") return "postgres";
  throw new PersistenceProviderError(`DB_PROVIDER "${value.trim()}" is not supported.`);
}

type Cached = { provider: "sqlite" | "postgres"; stores: PersistenceStores };
let cached: Cached | null = null;

async function sqliteStores(): Promise<PersistenceStores> {
  const [meta, azure, legacy, planning] = await Promise.all([
    import("../db/sqliteMetaStore.js"),
    import("../db/sqliteAzureSnapshotStore.js"),
    import("../db/sqliteLegacyPlanStore.js"),
    import("../db/sqlitePlanningStore.js"),
  ]);
  return {
    meta: meta.sqliteMetaStore,
    azureSnapshot: azure.sqliteAzureSnapshotStore,
    legacyPlan: legacy.sqliteLegacyPlanStore,
    planning: planning.sqlitePlanningStore,
  };
}

async function postgresStores(): Promise<PersistenceStores> {
  let url = "";
  try {
    url = envValue("DATABASE_URL");
  } catch (err) {
    throw new PersistenceProviderError(publicDbError(err));
  }
  if (!url) throw new PersistenceProviderError("DATABASE_URL is required when DB_PROVIDER=postgres");
  const [{ migratePostgres }, meta, azure, legacy, planning] = await Promise.all([
    import("../db/postgres/migrate.js"),
    import("../db/postgres/postgresMetaStore.js"),
    import("../db/postgres/postgresAzureSnapshotStore.js"),
    import("../db/postgres/postgresLegacyPlanStore.js"),
    import("../db/postgres/postgresPlanningStore.js"),
  ]);
  try {
    await migratePostgres();
  } catch (err) {
    throw new PersistenceProviderError(publicDbError(err));
  }
  return {
    meta: meta.postgresMetaStore,
    azureSnapshot: azure.postgresAzureSnapshotStore,
    legacyPlan: legacy.postgresLegacyPlanStore,
    planning: planning.postgresPlanningStore,
  };
}

export async function getStores(): Promise<PersistenceStores> {
  const provider = resolveDbProvider(envValue("DB_PROVIDER"));
  if (cached?.provider === provider) return cached.stores;
  const stores = provider === "sqlite" ? await sqliteStores() : await postgresStores();
  cached = { provider, stores };
  return stores;
}

export async function persistenceReady(): Promise<boolean> {
  const provider = resolveDbProvider(envValue("DB_PROVIDER"));
  if (provider === "sqlite") {
    const { dbReady } = await import("../db.js");
    return dbReady();
  }
  try {
    await getStores();
    const { getPool } = await import("../db/postgres/pool.js");
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

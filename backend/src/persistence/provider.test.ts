import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { sqliteAzureSnapshotStore } from "../db/sqliteAzureSnapshotStore.js";
import { sqliteLegacyPlanStore } from "../db/sqliteLegacyPlanStore.js";
import { sqliteMetaStore } from "../db/sqliteMetaStore.js";
import { sqlitePlanningStore } from "../db/sqlitePlanningStore.js";
import { getStores, PersistenceProviderError, resolveDbProvider } from "./provider.js";

const previous = process.env.DB_PROVIDER;

afterEach(() => {
  if (previous === undefined) delete process.env.DB_PROVIDER;
  else process.env.DB_PROVIDER = previous;
});

function useProvider(value: string | undefined): void {
  if (value === undefined) delete process.env.DB_PROVIDER;
  else process.env.DB_PROVIDER = value;
}

describe("DB_PROVIDER", () => {
  it("sem DB_PROVIDER usa SQLite", async () => {
    assert.equal(resolveDbProvider(""), "sqlite");
    assert.equal(resolveDbProvider("   "), "sqlite");
    useProvider("");
    const stores = await getStores();
    assert.equal(stores.meta, sqliteMetaStore);
    assert.equal(stores.azureSnapshot, sqliteAzureSnapshotStore);
    assert.equal(stores.legacyPlan, sqliteLegacyPlanStore);
    assert.equal(stores.planning, sqlitePlanningStore);
  });

  it("DB_PROVIDER=sqlite usa SQLite", async () => {
    assert.equal(resolveDbProvider("sqlite"), "sqlite");
    useProvider("sqlite");
    assert.equal((await getStores()).planning, sqlitePlanningStore);
  });

  it("aceita caixa e espaços", async () => {
    assert.equal(resolveDbProvider(" SQLite "), "sqlite");
    assert.equal(resolveDbProvider("SQLITE"), "sqlite");
    useProvider(" SQLite ");
    assert.equal((await getStores()).meta, sqliteMetaStore);
  });

  it("DB_PROVIDER=postgres sem DATABASE_URL falha sem cair no SQLite", async () => {
    assert.equal(resolveDbProvider("postgres"), "postgres");
    assert.equal(resolveDbProvider(" Postgres "), "postgres");
    useProvider("postgres");
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      await assert.rejects(
        () => getStores(),
        (err: unknown) => err instanceof PersistenceProviderError && err.message === "DATABASE_URL is required when DB_PROVIDER=postgres",
      );
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });

  it("valor desconhecido falha sem fallback", async () => {
    assert.throws(
      () => resolveDbProvider("mysql"),
      (err: unknown) => err instanceof PersistenceProviderError && err.message === 'DB_PROVIDER "mysql" is not supported.',
    );
    useProvider("oracle");
    await assert.rejects(
      () => getStores(),
      (err: unknown) => err instanceof PersistenceProviderError && err.message === 'DB_PROVIDER "oracle" is not supported.',
    );
  });
});

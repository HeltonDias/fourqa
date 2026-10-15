import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertVercelCacheMode, isAzureCacheReadEnabled } from "../azure/azureCacheReadSource.js";
import { assertOperationalProvider } from "./operationalProvider.js";

describe("provider operacional", { concurrency: 1 }, () => {
  it("a API recusa SQLite e provider vazio", () => {
    assert.throws(() => assertOperationalProvider(""), /DB_PROVIDER=postgres/);
    assert.throws(() => assertOperationalProvider("sqlite"), /DB_PROVIDER=postgres/);
    assert.doesNotThrow(() => assertOperationalProvider(" postgres "));
  });

  it("PostgreSQL sem flag usa cache e o modo legado continua explícito", () => {
    const previousProvider = process.env.DB_PROVIDER;
    const previousFlag = process.env.AZURE_CACHE_READ;
    process.env.DB_PROVIDER = "postgres";
    delete process.env.AZURE_CACHE_READ;
    try {
      assert.equal(isAzureCacheReadEnabled(), true);
      process.env.AZURE_CACHE_READ = "0";
      assert.equal(isAzureCacheReadEnabled(), false);
    } finally {
      if (previousProvider === undefined) delete process.env.DB_PROVIDER;
      else process.env.DB_PROVIDER = previousProvider;
      if (previousFlag === undefined) delete process.env.AZURE_CACHE_READ;
      else process.env.AZURE_CACHE_READ = previousFlag;
    }
  });

  it("na Vercel o padrão é o snapshot SQL", () => {
    const previousProvider = process.env.DB_PROVIDER;
    const previousFlag = process.env.AZURE_CACHE_READ;
    const previousVercel = process.env.VERCEL;
    process.env.DB_PROVIDER = "postgres";
    process.env.VERCEL = "1";
    process.env.AZURE_CACHE_READ = "";
    try {
      assert.equal(isAzureCacheReadEnabled(), false);
      process.env.AZURE_CACHE_READ = "0";
      assert.equal(isAzureCacheReadEnabled(), false);
      process.env.AZURE_CACHE_READ = "1";
      assert.equal(isAzureCacheReadEnabled(), true);
      assert.throws(() => assertVercelCacheMode(), /não é permitido na Vercel/);
    } finally {
      if (previousProvider === undefined) delete process.env.DB_PROVIDER;
      else process.env.DB_PROVIDER = previousProvider;
      if (previousFlag === undefined) delete process.env.AZURE_CACHE_READ;
      else process.env.AZURE_CACHE_READ = previousFlag;
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });

  it("a migração 002 entra só no CLI e não apaga snapshots", () => {
    const migrate = readFileSync(new URL("../db/postgres/migrate.ts", import.meta.url), "utf8");
    const provider = readFileSync(new URL("./provider.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const identity = readFileSync(new URL("../db/postgres/migrations/002_plan_item_identity.sql", import.meta.url), "utf8");
    assert.match(migrate, /002_plan_item_identity/);
    assert.equal(provider.includes("migratePostgres"), false);
    assert.equal(server.includes("migratePostgres"), false);
    assert.equal(identity.includes("DROP TABLE"), false);
    assert.equal(identity.includes("responsavel"), false);
    assert.equal(identity.includes("prioridade"), false);
    assert.match(identity, /uq_plan_item_suite/);
    assert.match(identity, /uq_plan_item_point/);
  });
});

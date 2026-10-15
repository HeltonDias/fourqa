import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { PoolConfig } from "pg";
import { postgresCaPem, postgresConnectionConfig, readPostgresCaPem } from "./pool.js";

const require = createRequire(import.meta.url);
const parse = require("pg-connection-string").parse as (value: string) => { ssl?: PoolConfig["ssl"] };

const pooler = "postgresql://user:p%40ss@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const local = "postgresql://user:p%40ss@127.0.0.1:5432/postgres";

function sslSeenByPg(config: PoolConfig): PoolConfig["ssl"] {
  return Object.assign({}, config, parse(String(config.connectionString))).ssl;
}

function rejectsUnauthorized(ssl: PoolConfig["ssl"]): boolean {
  return typeof ssl === "object" && ssl !== null && ssl.rejectUnauthorized === true;
}

describe("postgres TLS", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("Session Pooler sem sslmode verifica o certificado", () => {
    const config = postgresConnectionConfig(pooler);
    assert.equal(rejectsUnauthorized(config.ssl), true);
    assert.equal(rejectsUnauthorized(sslSeenByPg(config)), true);
    assert.equal(String(config.connectionString).includes("sslmode"), false);
  });

  it("require, verify-ca e verify-full sobrevivem ao parser do pg", () => {
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      const config = postgresConnectionConfig(`${pooler}?sslmode=${mode}&uselibpqcompat=true`);
      assert.equal(rejectsUnauthorized(sslSeenByPg(config)), true);
      assert.equal(typeof config.ssl === "object" && config.ssl !== null && config.ssl.checkServerIdentity, undefined);
      const stored = String(config.connectionString);
      assert.equal(stored.includes("sslmode"), false);
      assert.equal(stored.includes("uselibpqcompat"), false);
      assert.equal(stored.includes("p%40ss@"), true);
    }
  });

  it("sslmode=disable não abre TLS", () => {
    const config = postgresConnectionConfig(`${pooler}?sslmode=disable`);
    assert.equal(config.ssl, false);
    assert.equal(sslSeenByPg(config), false);
  });

  it("sslmode=no-verify é o único opt-out explícito", () => {
    const config = postgresConnectionConfig(`${local}?sslmode=no-verify`);
    if (typeof config.ssl !== "object" || config.ssl === null) assert.fail("ssl ausente");
    assert.equal(config.ssl.rejectUnauthorized, false);
    const seen = sslSeenByPg(config);
    if (typeof seen !== "object" || seen === null) assert.fail("ssl ausente depois do pg");
    assert.equal(seen.rejectUnauthorized, false);
    assert.equal(String(config.connectionString).includes("sslmode"), false);
  });

  it("host comum sem sslmode não força TLS", () => {
    const config = postgresConnectionConfig(local);
    assert.equal(config.ssl, undefined);
    assert.equal(sslSeenByPg(config), undefined);
  });

  it("URL inválida não ecoa a credencial", () => {
    assert.throws(
      () => postgresConnectionConfig("postgresql://user:super-secret@"),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        assert.equal(message, "DATABASE_URL inválida");
        assert.equal(message.includes("super-secret"), false);
        return true;
      },
    );
    assert.throws(() => postgresConnectionConfig("postgresql:///postgres"), /DATABASE_URL inválida/);
  });

  it("sslmode desconhecido não ecoa a credencial", () => {
    assert.throws(
      () => postgresConnectionConfig(`${local}?sslmode=super-secret`),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        assert.equal(message, "sslmode da DATABASE_URL não é suportado");
        assert.equal(message.includes("super-secret"), false);
        return true;
      },
    );
  });

  it("CA em PEM entra no ssl verificado e o caminho ausente não vaza", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fourqa-ca-"));
    tempDirs.push(dir);
    const pem = "-----BEGIN CERTIFICATE-----\nQUM=\n-----END CERTIFICATE-----\n";
    const file = path.join(dir, "ca.pem");
    fs.writeFileSync(file, pem);
    const config = postgresConnectionConfig(`${pooler}?sslrootcert=${encodeURIComponent(file)}`, readPostgresCaPem(file));
    assert.equal(rejectsUnauthorized(config.ssl), true);
    assert.equal(typeof config.ssl === "object" && config.ssl !== null && config.ssl.ca, pem);
    assert.equal(String(config.connectionString).includes("sslrootcert"), false);

    const previousCa = process.env.DATABASE_SSL_CA_FILE;
    process.env.DATABASE_SSL_CA_FILE = "";
    try {
      assert.equal(postgresCaPem(`${local}?sslrootcert=${encodeURIComponent(file)}`), pem);
      process.env.DATABASE_SSL_CA_FILE = file;
      assert.equal(postgresCaPem(local), pem);
    } finally {
      if (previousCa === undefined) delete process.env.DATABASE_SSL_CA_FILE;
      else process.env.DATABASE_SSL_CA_FILE = previousCa;
    }

    const missing = path.join(dir, "fourqa-ca-missing-marker.pem");
    assert.throws(
      () => readPostgresCaPem(missing),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        assert.equal(message, "Certificado CA do PostgreSQL não pôde ser lido");
        assert.equal(message.includes("fourqa-ca-missing-marker"), false);
        return true;
      },
    );
  });
});

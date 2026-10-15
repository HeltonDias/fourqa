import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { getDb } from "../db.js";
import { getInMemoryAzureCache } from "../azure/inMemoryAzureCache.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-write-http-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");
process.env.DB_PROVIDER = "sqlite";
process.env.AZURE_CACHE_READ = "1";
delete process.env.FOURQA_API_TOKEN;
delete process.env.FOURQA_ALLOW_OPEN_WRITES;

const { apiRouter } = await import("./api.js");

const app = express();
app.use(express.json());
app.use("/api", apiRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: { error?: string; unavailable?: boolean; total?: number } }> {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json() as { error?: string; unavailable?: boolean; total?: number };
  return { status: res.status, body };
}

describe("rotas de escrita e cache vazio", { concurrency: 1 }, () => {
  before(() => {
    delete process.env.FOURQA_API_TOKEN;
    delete process.env.FOURQA_ALLOW_OPEN_WRITES;
  });

  after(() => {
    server.close();
    delete process.env.AZURE_CACHE_READ;
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("fecha PUT e POST quando o servidor não tem token", async () => {
    const cabecalho = await call("/api/cabecalho", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
    const periodo = await call("/api/periodo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
    const revisao = await call("/api/planejamento/revisao", { method: "POST" });
    const celula = await call("/api/planejamento/celula", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
    const sync = await call("/api/sync", { method: "POST" });
    for (const res of [cabecalho, periodo, revisao, celula, sync]) {
      assert.equal(res.status, 503);
      assert.match(res.body.error ?? "", /Escrita desabilitada/);
    }
  });

  it("nega bearer ausente ou errado e aceita o token certo", async () => {
    process.env.FOURQA_API_TOKEN = "segredo-local";
    const missing = await call("/api/sync", { method: "POST" });
    const wrong = await call("/api/sync", { method: "POST", headers: { Authorization: "Bearer outro" } });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    const opened = await call("/api/cabecalho", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer segredo-local" },
      body: JSON.stringify({ title: "", subtitle: "" }),
    });
    assert.equal(opened.status, 400);
    delete process.env.FOURQA_API_TOKEN;
  });

  it("opt-in local libera a escrita sem token", async () => {
    process.env.FOURQA_ALLOW_OPEN_WRITES = "1";
    const res = await call("/api/cabecalho", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", subtitle: "" }),
    });
    assert.equal(res.status, 400);
    delete process.env.FOURQA_ALLOW_OPEN_WRITES;
  });

  it("cache nunca publicado responde 503 e plano vazio responde 200", async () => {
    const closed = await call("/api/execucoes?planKey=Vazio");
    assert.equal(closed.status, 503);
    assert.equal(closed.body.unavailable, true);
    assert.match(closed.body.error ?? "", /Atualizar/);

    getInMemoryAzureCache().commitSuccessfulRefresh(
      {
        kpiPlanKey: "Vazio",
        plans: [{ planKey: "Vazio", execucoes: [], falhas: [], dimensions: [], kpi: null }],
        suiteRefs: [],
      },
      {
        fetchedAt: "2026-10-15T00:00:00.000Z",
        dimensoesMeta: {},
        workbookMeta: { kpi_plan_key: "Vazio" },
        summary: { execucoes: 0, falhas: 0, suites: 0, runs: 0, kpi: null },
      },
    );
    const empty = await call("/api/execucoes?planKey=Vazio");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.total, 0);
    const other = await call("/api/falhas?planKey=Outro");
    assert.equal(other.status, 200);
    assert.equal(other.body.total, 0);
  });
});

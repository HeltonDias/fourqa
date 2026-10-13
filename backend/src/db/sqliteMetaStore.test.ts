import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqliteMetaStore } from "./sqliteMetaStore.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-meta-store-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

describe("sqliteMetaStore", { concurrency: 1 }, () => {
  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("get de chave inexistente retorna null", () => {
    assert.equal(sqliteMetaStore.get("chave-ausente"), null);
  });

  it("set cria a chave", () => {
    sqliteMetaStore.set("periodo", "2026-10-12");
    assert.equal(sqliteMetaStore.get("periodo"), "2026-10-12");
  });

  it("set da mesma chave atualiza o valor", () => {
    sqliteMetaStore.set("periodo", "2026-11-12");
    assert.equal(sqliteMetaStore.get("periodo"), "2026-11-12");
  });

  it("uma chave não interfere em outra", () => {
    sqliteMetaStore.set("outra", "valor");
    assert.equal(sqliteMetaStore.get("periodo"), "2026-11-12");
    assert.equal(sqliteMetaStore.get("outra"), "valor");
  });

  it("string JSON é preservada exatamente", () => {
    const json = JSON.stringify({ foursys: 1, cliente: 2, texto: "a\"b" });
    sqliteMetaStore.set("blob", json);
    assert.equal(sqliteMetaStore.get("blob"), json);
  });

  it("string vazia é preservada", () => {
    sqliteMetaStore.set("vazio", "");
    assert.equal(sqliteMetaStore.get("vazio"), "");
  });

  it("caracteres especiais são preservados", () => {
    const value = "100%_ok \\ aspas \" linha\n\ttab ç ã";
    sqliteMetaStore.set("especial", value);
    assert.equal(sqliteMetaStore.get("especial"), value);
  });
});

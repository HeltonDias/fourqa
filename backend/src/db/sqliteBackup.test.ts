import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { assertBackupDestination, backupSqlite, inventorySqlite, invokedAsCli } from "./sqliteBackup.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fourqa-backup-"));
  tempDirs.push(dir);
  return dir;
}

describe("backup SQLite", () => {
  it("copia o WAL por API e confere integrity_check sem alterar o original", async () => {
    const dir = tempDir();
    const root = path.join(dir, "repo");
    fs.mkdirSync(root);
    const source = path.join(dir, "source.db");
    const dest = path.join(dir, "backups", "copy.db");
    const db = new DatabaseSync(source);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA wal_autocheckpoint = 0");
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, label TEXT)");
    db.exec("INSERT INTO sample (label) VALUES ('registro')");
    const walBefore = fs.statSync(`${source}-wal`).size;
    assert.ok(walBefore > 0);
    const before = fs.statSync(source).size;
    const report = await backupSqlite(source, dest, root);
    assert.equal(fs.statSync(source).size, before);
    assert.equal(fs.statSync(`${source}-wal`).size, walBefore);
    db.close();
    assert.equal(report.integrity, "ok");
    assert.deepEqual(report.counts, [{ table: "sample", n: 1 }]);
    const copy = new DatabaseSync(dest, { readOnly: true });
    try {
      const row = copy.prepare("SELECT COUNT(*) AS n FROM sample").get() as { n: number };
      assert.equal(Number(row.n), 1);
    } finally {
      copy.close();
    }
  });

  it("recusa destino dentro do repositório ou arquivo existente", async () => {
    const blocked = path.join(repoRoot, "fourqa-backup-nao-criar.db");
    assert.throws(() => assertBackupDestination(blocked, repoRoot), /fora do repositório/);
    assert.equal(fs.existsSync(blocked), false);
    const dir = tempDir();
    const root = path.join(dir, "repo");
    fs.mkdirSync(root);
    const source = path.join(dir, "source.db");
    const dest = path.join(dir, "backups", "copy.db");
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
    db.close();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "");
    await assert.rejects(() => backupSqlite(source, dest, root), /já existe/);
    assert.equal(fs.readFileSync(dest, "utf8"), "");
  });

  it("inventaria só contagens e não dispara o CLI ao ser importado", () => {
    const dir = tempDir();
    const source = path.join(dir, "source.db");
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, secret TEXT)");
    db.exec("INSERT INTO sample (secret) VALUES ('nao-imprimir')");
    db.close();
    const report = inventorySqlite(source);
    assert.equal(report.integrity, "ok");
    assert.deepEqual(report.counts, [{ table: "sample", n: 1 }]);
    assert.equal(JSON.stringify(report).includes("nao-imprimir"), false);
    const sourceText = fs.readFileSync(new URL("./sqliteBackup.ts", import.meta.url), "utf8");
    assert.equal(/\bgetStores\b/.test(sourceText), false);
    assert.equal(/\bmigratePostgres\b/.test(sourceText), false);
    assert.equal(/\bgetDb\(/.test(sourceText), false);
    assert.equal(invokedAsCli(), false);
  });
});

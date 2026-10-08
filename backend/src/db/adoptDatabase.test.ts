import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { adoptRenamedDatabase } from "../db.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-db-"));

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("adoção do arquivo de banco", () => {
  it("renomeia o arquivo antigo e os sidecars quando o novo ainda não existe", () => {
    const legacy = path.join(dir, "legado.db");
    const target = path.join(dir, "novo.db");
    writeFileSync(legacy, "db");
    writeFileSync(`${legacy}-wal`, "wal");
    writeFileSync(`${legacy}-shm`, "shm");

    const chosen = adoptRenamedDatabase(target, legacy, false);

    assert.equal(chosen, target);
    assert.equal(readFileSync(target, "utf8"), "db");
    assert.equal(readFileSync(`${target}-wal`, "utf8"), "wal");
    assert.equal(readFileSync(`${target}-shm`, "utf8"), "shm");
    assert.equal(existsSync(legacy), false);
  });

  it("preserva o arquivo novo quando os dois existem", () => {
    const legacy = path.join(dir, "outro-legado.db");
    const target = path.join(dir, "outro-novo.db");
    writeFileSync(legacy, "antigo");
    writeFileSync(target, "atual");

    const chosen = adoptRenamedDatabase(target, legacy, false);

    assert.equal(chosen, target);
    assert.equal(readFileSync(target, "utf8"), "atual");
    assert.equal(readFileSync(legacy, "utf8"), "antigo");
  });

  it("não move o arquivo quando o caminho foi definido explicitamente", () => {
    const legacy = path.join(dir, "explicito-legado.db");
    const target = path.join(dir, "explicito-novo.db");
    writeFileSync(legacy, "ficar");

    const chosen = adoptRenamedDatabase(target, legacy, true);

    assert.equal(chosen, target);
    assert.equal(readFileSync(legacy, "utf8"), "ficar");
    assert.equal(existsSync(target), false);
  });
});

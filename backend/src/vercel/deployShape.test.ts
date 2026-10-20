import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("formato de deploy Vercel", () => {
  it("estático e API ficam separados e o snapshot não apaga planejamento", () => {
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      outputDirectory: string;
      rewrites: { source: string; destination: string }[];
      functions: Record<string, { maxDuration: number }>;
    };
    assert.equal(vercel.outputDirectory, "frontend/dist");
    assert.equal(vercel.rewrites.some((rule) => rule.source.includes("(?!api/)")), true);
    assert.equal(vercel.rewrites.some((rule) => rule.source === "/api/:path*" && rule.destination === "/api/index?rest=:path*"), true);
    assert.equal(vercel.rewrites.some((rule) => rule.destination === "/api"), false);
    assert.equal(vercel.functions["api/[...path].mjs"]?.maxDuration, 300);
    assert.match(JSON.stringify(vercel.functions["api/[...path].mjs"]), /\.env/);

    const entry = readFileSync(path.join(root, "api", "[...path].mjs"), "utf8");
    assert.match(entry, /backend\/dist\/app\.js/);
    assert.match(entry, /export default app/);

    const app = readFileSync(path.join(root, "backend", "src", "app.ts"), "utf8");
    const server = readFileSync(path.join(root, "backend", "src", "server.ts"), "utf8");
    assert.equal(app.includes(".listen"), false);
    assert.match(server, /\.listen\(/);
    assert.equal(app.includes("migratePostgres"), false);

    const snapshot = readFileSync(path.join(root, "backend", "src", "db", "postgres", "postgresAzureSnapshotStore.ts"), "utf8");
    assert.match(snapshot, /DELETE FROM execucoes/);
    assert.match(snapshot, /DELETE FROM falhas/);
    assert.equal(snapshot.includes("DELETE FROM workbook_meta"), false);
    assert.equal(snapshot.includes("planning_item"), false);

    const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^\.vercel\/?$/m);
  });

  it("o upload da CLI deixa de fora banco, planilha e análise local", () => {
    const ignore = readFileSync(path.join(root, ".vercelignore"), "utf8");
    const lines = new Set(
      ignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    );
    const required = [
      "data/",
      "*.db",
      "*.db-wal",
      "*.db-shm",
      "*.sqlite",
      "*.sqlite3",
      "fonte/**/*.xlsx",
      "fonte/**/*.xlsm",
      "fonte/**/*.xls",
      "fonte/**/*.csv",
      "fonte/scripts.zip",
      "fonte/scripts_extracted/",
      "fonte/_analysis_fase3.json",
      "fourqa-supabase-*.sql",
    ];
    for (const pattern of required) {
      assert.equal(lines.has(pattern), true, pattern);
    }
    assert.equal(lines.has("fonte/"), false);
    assert.equal(lines.has("fonte/util/"), false);
    assert.equal(lines.has("fonte/util/**"), false);
  });
});

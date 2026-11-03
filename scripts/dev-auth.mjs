#!/usr/bin/env node
// Sobe `npm run dev` com login por PAT habilitado, em SQLite local separado.
// Nunca usa o Postgres do .env: a migração 005 não pode ser aplicada por acidente no banco remoto.
// Uso: npm run dev:auth -- --head=seu.email@empresa.com
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const secretsFile = join(dataDir, ".dev-auth-secrets.json");
const dbFile = join(dataDir, "fourqa-auth-dev.db");

mkdirSync(dataDir, { recursive: true });

let secrets;
if (existsSync(secretsFile)) {
  secrets = JSON.parse(readFileSync(secretsFile, "utf8"));
} else {
  secrets = {
    sessionSecret: randomBytes(48).toString("base64url"),
    patKey: randomBytes(48).toString("base64url"),
  };
  writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { encoding: "utf8", mode: 0o600 });
}

const headArg = process.argv.find((arg) => arg.startsWith("--head="));
const heads = headArg ? headArg.slice("--head=".length).trim() : (process.env.FOURQA_BOOTSTRAP_HEADS ?? "").trim();

const env = {
  ...process.env,
  DB_PROVIDER: "sqlite",
  FOURQA_LOCAL_SQLITE: "1",
  FOURQA_DB: dbFile,
  FOURQA_SESSION_SECRET: secrets.sessionSecret,
  FOURQA_PAT_ENCRYPTION_KEY: secrets.patKey,
  FOURQA_BOOTSTRAP_HEADS: heads,
  FOURQA_PAT_LOGIN: "1",
};

console.log("[dev:auth] Login por PAT habilitado.");
console.log(`[dev:auth] Banco local: ${dbFile} (Postgres do .env ignorado)`);
console.log(
  heads
    ? `[dev:auth] Head inicial: ${heads}`
    : "[dev:auth] Sem Head inicial. Use: npm run dev:auth -- --head=seu.email@empresa.com",
);

const child = spawn("npm run dev", { cwd: root, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));

import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { PING_SQL, invokedAsCli, runPostgresPing, safePingMessage } from "./ping.js";

describe("postgres ping", () => {
  it("executa só SELECT 1 e encerra o pool mesmo se a consulta falhar", async () => {
    let sql = "";
    let ended = 0;
    await assert.rejects(
      () =>
        runPostgresPing({
          query: async (value) => {
            sql = value;
            throw Object.assign(new Error("connect ENOTFOUND aws-0-sa-east-1.pooler.supabase.com"), { code: "ENOTFOUND" });
          },
          end: async () => {
            ended += 1;
          },
        }),
      (err: unknown) => errorCode(err) === "ENOTFOUND",
    );
    assert.equal(sql, PING_SQL);
    assert.equal(PING_SQL, "SELECT 1 AS connected");
    assert.equal(ended, 1);
  });

  it("aceita connected = 1 e propaga falha ao encerrar", async () => {
    await runPostgresPing({
      query: async () => ({ rows: [{ connected: "1" }] }),
      end: async () => {},
    });
    await assert.rejects(
      () =>
        runPostgresPing({
          query: async () => ({ rows: [{ connected: 1 }] }),
          end: async () => {
            throw new Error("encerrar");
          },
        }),
      (err: unknown) => err instanceof Error && err.message === "encerrar",
    );
  });

  it("não ecoa URI, usuário, hostname, senha ou token", () => {
    const leaked = 'password authentication failed for user "postgres.project" postgresql://user:s3cret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres token=abc';
    const cases = [
      safePingMessage(Object.assign(new Error(`getaddrinfo ENOTFOUND aws-0-sa-east-1.pooler.supabase.com ${leaked}`), { code: "ENOTFOUND" })),
      safePingMessage(new Error(leaked)),
      safePingMessage(Object.assign(new Error("unable to verify the first certificate at db.example.supabase.co"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" })),
      safePingMessage(new Error("resultado inesperado do ping")),
    ];
    assert.deepEqual(cases, [
      "não foi possível conectar ao PostgreSQL",
      "falha de autenticação",
      "falha ao verificar o certificado TLS",
      "resultado inesperado do ping",
    ]);
    const joined = cases.join("\n");
    for (const secret of ["s3cret", "pooler.supabase.com", "postgres.project", "postgresql://", "token=abc"]) {
      assert.equal(joined.includes(secret), false);
    }
  });

  it("não importa migração nem getStores e não dispara o CLI ao ser importado", () => {
    const source = fs.readFileSync(new URL("./ping.ts", import.meta.url), "utf8");
    assert.equal(/\bgetStores\b/.test(source), false);
    assert.equal(/\bmigratePostgres\b/.test(source), false);
    assert.equal(/\bimportFromSqlite\b/.test(source), false);
    assert.equal(invokedAsCli(), false);
    assert.equal(invokedAsCli("C:\\outro\\arquivo.ts", "file:///C:/projeto/ping.ts"), false);
  });
});

function errorCode(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  return typeof err.code === "string" ? err.code : "";
}

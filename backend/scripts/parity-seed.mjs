import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
const parsed = new URL(url);
const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (parsed.hostname !== "127.0.0.1" || parsed.port !== "54329") {
  throw new Error("seed recusado: host ou porta");
}
if (/supabase/i.test(url) || !["fourqa_java", "fourqa_mig"].includes(name)) {
  throw new Error("seed recusado: banco");
}

const client = new pg.Client({ connectionString: url, ssl: false });
await client.connect();
const identity = await client.query("SELECT current_database() AS db, inet_server_addr()::text AS addr");
if (identity.rows[0].db !== name) throw new Error("seed recusado: database");
if (String(identity.rows[0].addr ?? "").includes("supabase")) throw new Error("seed recusado: endereco");

await client.query("BEGIN");
await client.query("DELETE FROM planning_allocation");
await client.query("DELETE FROM planning_item");
await client.query("DELETE FROM planning_scope_item");
await client.query("DELETE FROM planning_change_log");
await client.query("DELETE FROM planning_revision");
await client.query("DELETE FROM planning");
await client.query("DELETE FROM execucoes");
await client.query("DELETE FROM falhas");
await client.query("DELETE FROM planejamento_linhas");
await client.query("DELETE FROM workbook_meta");

await client.query(`INSERT INTO workbook_meta (key, value) VALUES
  ('data_inicio','2026-10-01'),
  ('data_fim','2026-10-31'),
  ('titulo','Paridade'),
  ('subtitulo','Marco 4'),
  ('planejamento_legado_plan_key','PlanoA'),
  ('dimensoes_catalog:PlanoA',$1)`, [
  JSON.stringify([
    { key: "front", label: "Frente", level: 1, values: ["Login"], role: "front", confidence: 0.9, visible: true },
    { key: "process", label: "Processo", level: 2, values: ["SuiteA"], role: "process", confidence: 0.9, visible: true },
  ]),
]);

await client.query(`INSERT INTO planejamento_linhas
  (row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados)
  VALUES (1,'Ana','Alta','Login','SuiteA','2026-10-01','2026-10-31',0,2,1,3)`);

const execSql = `INSERT INTO execucoes
  (plan_key, plan_id, plan_name, frente, atalho, processo, suite_id, suite_name, parent_suite_id, suite_depth, suite_path,
   test_point_id, test_case_id, test_case_title, responsabilidade, test_case_state, test_point_state, outcome,
   date_completed, run_by, last_updated_date, last_test_run_id, last_result_id, test_case_link, test_case_tags, dimensions_json)
  VALUES ($1,$2,'Plano',$3,'login',$4,$5,$4,NULL,1,$4,$6,$7,$8,'QA',$9,$10,$11,'2026-10-20','Ana','2026-10-20',40,41,'link','tag',$12)`;
const rows = [
  ["PlanoA", 1, "Login", "SuiteA", 1, 10, 900, "Caso A", "Closed", "Completed", "Passed", null],
  ["PlanoA", 1, "Login", "SuiteA", 1, 11, 901, "Caso B", "Closed", "Completed", "NotApplicable", null],
  ["PlanoA", 1, "Login", "SuiteA", 1, 12, 902, "Caso C", "BUG", "Completed", "Failed", null],
  ["PlanoB", 2, "Outra", "Outra", 2, 20, 903, "Caso D", "Closed", "Completed", "Passed", null],
];
for (const row of rows) await client.query(execSql, row);
await client.query(`INSERT INTO falhas
  (plan_key, responsavel, ambiente, categoria, bug_id, impacto, frente, titulo, status, criacao, fechamento, links, tags)
  VALUES ('PlanoA','Desenvolvimento Foursys','HML','funcional',5,1,'Login','falha','Active','2026-10-02',NULL,'http://bug','qa')`);
await client.query("COMMIT");
await client.end();
console.log(`seed ${name}`);

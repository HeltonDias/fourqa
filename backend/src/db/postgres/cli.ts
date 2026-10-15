import { publicDbError } from "../../persistence/provider.js";
import { closePool } from "./pool.js";
import { importSqliteIntoPostgres } from "./importFromSqlite.js";
import { migratePostgres } from "./migrate.js";
import { formatPreflight, formatVerify, runPreflight, runVerify } from "./schemaAudit.js";
import { validateSqliteAgainstPostgres } from "./validateEquivalence.js";

function sourceArg(argv: string[]): string | undefined {
  const index = argv.indexOf("--source");
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("informe o arquivo SQLite em --source");
  return value;
}

const command = process.argv[2];

try {
  const source = sourceArg(process.argv);
  if (command === "migrate") {
    await migratePostgres();
    console.log("schema PostgreSQL aplicado");
  } else if (command === "preflight") {
    const report = await runPreflight();
    console.log(formatPreflight(report));
    if (report.precheck === "FAIL") process.exitCode = 1;
  } else if (command === "verify") {
    const report = await runVerify();
    console.log(formatVerify(report));
    if (report.verify === "FAIL") process.exitCode = 1;
  } else if (command === "import-sqlite") {
    const result = await importSqliteIntoPostgres(source);
    console.log(JSON.stringify({ status: result.status, counts: result.counts, sequences: result.sequences }));
  } else if (command === "validate") {
    await validateSqliteAgainstPostgres(source);
    console.log("SQLite e PostgreSQL equivalentes");
  } else {
    console.error("uso: preflight | migrate | verify | import-sqlite [--source arquivo] | validate [--source arquivo]");
    process.exitCode = 2;
  }
} catch (err) {
  console.error(publicDbError(err));
  process.exitCode = 1;
} finally {
  await closePool();
}

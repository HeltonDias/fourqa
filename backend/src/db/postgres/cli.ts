import { publicDbError } from "../../persistence/provider.js";
import { importSqliteIntoPostgres } from "./importFromSqlite.js";
import { migratePostgres } from "./migrate.js";
import { validateSqliteAgainstPostgres } from "./validateEquivalence.js";

const command = process.argv[2];

try {
  if (command === "migrate") {
    await migratePostgres();
    console.log("schema PostgreSQL aplicado");
  } else if (command === "import-sqlite") {
    const result = await importSqliteIntoPostgres();
    console.log(JSON.stringify({ status: result.status, counts: result.counts, sequences: result.sequences }));
  } else if (command === "validate") {
    await validateSqliteAgainstPostgres();
    console.log("SQLite e PostgreSQL equivalentes");
  } else {
    console.error("uso: migrate | import-sqlite | validate");
    process.exitCode = 2;
  }
} catch (err) {
  console.error(publicDbError(err));
  process.exitCode = 1;
}

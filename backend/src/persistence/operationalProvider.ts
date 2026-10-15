/** A API operacional não abre SQLite. Testes e o backup continuam podendo usar o arquivo. */
export function assertOperationalProvider(value: string): void {
  if (value.trim().toLowerCase() !== "postgres") {
    throw new Error("A API exige DB_PROVIDER=postgres. SQLite fica restrito aos testes e ao backup.");
  }
}

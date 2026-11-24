export function foldField(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function chosenColumns<T extends { campo: string }>(columns: T[], selected: string[] | null): T[] {
  if (!selected) return columns;
  const wanted = new Set(selected.map(foldField));
  const next = columns.filter((column) => wanted.has(foldField(column.campo)));
  return next.length > 0 ? next : columns;
}

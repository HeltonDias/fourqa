import { readLedger } from "./ledger.mjs";

/** Consulta seletiva — não carregar ledger inteiro no contexto do agente. */
export function ledgerTail(root, { limit = 5, id = null, idPrefix = null } = {}) {
  const entries = readLedger(root).filter((e) => !e.error);
  let filtered = entries;
  if (id) filtered = filtered.filter((e) => e.data?.id === id);
  else if (idPrefix) filtered = filtered.filter((e) => String(e.data?.id ?? "").startsWith(idPrefix));
  const slice = filtered.slice(-limit);
  return slice.map((e) => ({
    line: e.line,
    id: e.data.id,
    description: e.data.description,
    status: e.data.status,
    recorded_at: e.data.recorded_at,
    files: Array.isArray(e.data.files) ? e.data.files.slice(0, 8) : [],
  }));
}

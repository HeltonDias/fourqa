const PAGE_MIN = 1;
const PAGE_MAX = 200;

export function parsePageQuery(query: {
  limit?: unknown;
  offset?: unknown;
  q?: unknown;
}): { limit: number; offset: number; q: string } {
  const limit = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.trunc(Number(query.limit) || 50)));
  const offset = Math.max(0, Math.trunc(Number(query.offset) || 0));
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  return { limit, offset, q };
}

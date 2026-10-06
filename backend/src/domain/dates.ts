/**
 * Persistência de data/hora. Data sem horário permanece YYYY-MM-DD (não vira timestamp UTC).
 * Instante com horário vira ISO. A formatação pt-BR fica na UI.
 */
export function persistTimestamp(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return s;
  return parsed.toISOString();
}

import { parseCalendarDay } from "./planPeriod.js";

/**
 * Persistência de data/hora. Data sem horário permanece YYYY-MM-DD (não vira timestamp UTC).
 * Instante com horário vira ISO. A formatação pt-BR fica na UI.
 */
export function persistTimestamp(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!s) return "";

  const isoHead = s.match(/^(\d{4}-\d{2}-\d{2})/)?.[0];
  if (isoHead) {
    const cal = parseCalendarDay(isoHead);
    if (cal) return cal;
    return "";
  }

  const br = parseCalendarDay(s);
  if (br) return br;

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return s;
  return parsed.toISOString();
}

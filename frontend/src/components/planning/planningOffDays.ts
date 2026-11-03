import Holidays from "date-holidays";

const brHolidays = new Holidays("BR");

function atNoon(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

const holidayCache = new Map<string, string | null>();

/** Nome do feriado público nacional (date-holidays, país BR). */
export function holidayName(iso: string): string | null {
  const cached = holidayCache.get(iso);
  if (cached !== undefined) return cached;
  const date = atNoon(iso);
  const hits = date ? brHolidays.isHoliday(date) : false;
  const name = hits ? (hits.find((row) => row.type === "public")?.name ?? null) : null;
  holidayCache.set(iso, name);
  return name;
}

export function isHolidayDate(iso: string): boolean {
  return holidayName(iso) != null;
}

export function isOffDay(iso: string, weekend: boolean): boolean {
  return weekend || isHolidayDate(iso);
}

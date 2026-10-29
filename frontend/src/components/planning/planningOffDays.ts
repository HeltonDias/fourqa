import Holidays from "date-holidays";

const brHolidays = new Holidays("BR");

function atNoon(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

/** Nome do feriado público nacional (date-holidays, país BR). */
export function holidayName(iso: string): string | null {
  const date = atNoon(iso);
  if (!date) return null;
  const hits = brHolidays.isHoliday(date);
  if (!hits) return null;
  const holiday = hits.find((row) => row.type === "public");
  return holiday?.name ?? null;
}

export function isHolidayDate(iso: string): boolean {
  return holidayName(iso) != null;
}

export function isOffDay(iso: string, weekend: boolean): boolean {
  return weekend || isHolidayDate(iso);
}

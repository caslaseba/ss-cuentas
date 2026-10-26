export type DateQuery = {
  day: number;
  month: number;
  year: number | null;
};

const MONTHS: [string, number][] = [
  ["enero", 1],
  ["ene", 1],
  ["febrero", 2],
  ["feb", 2],
  ["marzo", 3],
  ["mar", 3],
  ["abril", 4],
  ["abr", 4],
  ["mayo", 5],
  ["may", 5],
  ["junio", 6],
  ["jun", 6],
  ["julio", 7],
  ["jul", 7],
  ["agosto", 8],
  ["ago", 8],
  ["septiembre", 9],
  ["setiembre", 9],
  ["sep", 9],
  ["octubre", 10],
  ["oct", 10],
  ["noviembre", 11],
  ["nov", 11],
  ["diciembre", 12],
  ["dic", 12],
];

function fold(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function yearOf(raw: string) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (raw.length === 4) return n >= 1900 && n <= 2100 ? n : null;
  if (raw.length === 2) return n >= 70 ? 1900 + n : 2000 + n;
  return null;
}

function daysInMonth(month: number, year: number | null) {
  if (month === 2) {
    if (year == null) return 29;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function monthNumber(token: string) {
  return MONTHS.find(([name]) => name === token)?.[1] ?? null;
}

function build(day: number, month: number, yearRaw: string | undefined): DateQuery | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const year = yearRaw ? yearOf(yearRaw) : null;
  if (yearRaw && year == null) return null;
  if (day > daysInMonth(month, year)) return null;
  return { day, month, year };
}

/** 19/10, 19-10, 19/10/2026 o "19 de octubre". */
export function parseDateQuery(query: string): DateQuery | null {
  const q = fold(query);
  if (!q) return null;

  const numeric = q.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?$/);
  if (numeric) return build(Number(numeric[1]), Number(numeric[2]), numeric[3]);

  const spoken = q.match(/^(\d{1,2}) de ([a-z]+)(?: de (\d{2,4}))?$/);
  if (spoken) {
    const month = monthNumber(spoken[2]);
    if (!month) return null;
    return build(Number(spoken[1]), month, spoken[3]);
  }

  const short = q.match(/^(\d{1,2}) ([a-z]+)$/);
  if (short) {
    const month = monthNumber(short[2]);
    if (!month) return null;
    return build(Number(short[1]), month, undefined);
  }

  return null;
}

export function occurredOnMatches(iso: string, query: DateQuery) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (day !== query.day || month !== query.month) return false;
  if (query.year != null && year !== query.year) return false;
  return true;
}

import { cycleSourceCard } from "@/lib/finance/settlement";
import { isoDate, monthKey } from "@/lib/utils";
import type { CreditCard, Transaction } from "@/lib/types";

export type CardMonthClose = {
  cardId: string;
  month: string;
  closingOn: string;
};

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function monthStart(month: Date) {
  return new Date(month.getFullYear(), month.getMonth(), 1);
}

export function shiftMonthStart(month: Date, delta: number) {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

export function shortMonth(month: Date) {
  return SHORT_MONTHS[month.getMonth()] ?? "";
}

export function defaultCloseOn(month: Date, closingDay: number) {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const day = Math.min(last, Math.max(1, Math.round(closingDay) || 1));
  return isoDate(new Date(month.getFullYear(), month.getMonth(), day));
}

export function parseCloseOn(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (date.getFullYear() !== year || date.getMonth() !== (month || 1) - 1 || date.getDate() !== day) return null;
  return isoDate(date);
}

export function closeOnForMonth(
  month: Date,
  closingDay: number,
  closes: CardMonthClose[],
  cardId: string,
) {
  const key = monthKey(month);
  const custom = closes.find((item) => item.cardId === cardId && item.month === key);
  const parsed = custom ? parseCloseOn(custom.closingOn) : null;
  if (parsed) return parsed;
  return defaultCloseOn(month, closingDay);
}

export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return isoDate(new Date(year, (month || 1) - 1, (day || 1) + days));
}

function monthFromIso(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function sameYearMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Período del mes M: desde el cierre del mes anterior hasta el cierre de M.
 * Ese período descuenta el sueldo de M+1.
 * Si los dos cierres caen en el mismo mes calendario, el día del cierre anterior
 * abre este período (01/10 al 28/10 descuenta en noviembre).
 * Si el cierre anterior quedó en otro mes, ese día cierra el período viejo
 * y este arranca al día siguiente. Después del cierre de M, el consumo
 * pasa al período que descuenta en M+2.
 */
export function windowMonthOf(date: string, closeOf: (month: Date) => string) {
  const anchor = monthFromIso(date);
  const matches: Date[] = [];
  for (let delta = -16; delta <= 16; delta += 1) {
    const month = shiftMonthStart(anchor, delta);
    const start = closeOf(shiftMonthStart(month, -1));
    const end = closeOf(month);
    if (!start || !end || start > end) continue;
    if (date >= start && date <= end) matches.push(month);
  }
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const later = matches[matches.length - 1];
  const earlier = matches[matches.length - 2];
  const laterEnd = closeOf(later);
  if (sameYearMonth(date, laterEnd)) return later;
  return earlier;
}

export function salaryMonthOf(date: string, closeOf: (month: Date) => string) {
  const windowMonth = windowMonthOf(date, closeOf);
  if (!windowMonth) return null;
  return shiftMonthStart(windowMonth, 1);
}

export function describedPeriod(month: Date, closeOf: (month: Date) => string) {
  const rawStart = closeOf(shiftMonthStart(month, -1));
  const rawEnd = closeOf(month);
  const owns = (iso: string) => {
    const found = windowMonthOf(iso, closeOf);
    return Boolean(found && monthKey(found) === monthKey(month));
  };
  const start = owns(rawStart) ? rawStart : addIsoDays(rawStart, 1);
  const end = owns(rawEnd) ? rawEnd : addIsoDays(rawEnd, -1);
  return { start, end, rawStart, rawEnd };
}

export function impactNote(date: string, closeOf: (month: Date) => string) {
  const salary = salaryMonthOf(date, closeOf);
  if (!salary) return null;
  return `Descuenta en ${shortMonth(salary)}`;
}

export function sumNoteForCharge(tx: Transaction, cards: CreditCard[], closes: CardMonthClose[]) {
  if (tx.type !== "egreso" || tx.payment_method !== "tarjeta_credito") return null;
  const own = cards.find((card) => card.id === tx.credit_card_id) ?? null;
  const source = own ? cycleSourceCard(own, cards) : (cards.find((card) => card.kind === "principal") ?? null);
  if (!source) return null;
  const closeOf = (month: Date) => closeOnForMonth(month, source.closing_day, closes, source.id);
  return impactNote(tx.occurred_on, closeOf);
}

export function upsertMonthClose(list: CardMonthClose[], next: CardMonthClose) {
  return [...list.filter((item) => !(item.cardId === next.cardId && item.month === next.month)), next];
}

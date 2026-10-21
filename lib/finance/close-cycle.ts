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

export function closeOnForMonth(
  month: Date,
  closingDay: number,
  closes: CardMonthClose[],
  cardId: string,
) {
  const key = monthKey(month);
  const custom = closes.find((item) => item.cardId === cardId && item.month === key);
  if (custom && custom.closingOn.startsWith(`${key}-`)) return custom.closingOn;
  return defaultCloseOn(month, closingDay);
}

export function clampCloseOn(month: Date, value: string) {
  const key = monthKey(month);
  if (!value.startsWith(`${key}-`)) return defaultCloseOn(month, 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const day = Math.min(last, Math.max(1, Number(value.slice(8, 10)) || 1));
  return isoDate(new Date(month.getFullYear(), month.getMonth(), day));
}

/** Hasta el cierre suma el mes siguiente y se paga dos meses después. Lo posterior corre un mes más. */
export function chargeRoll(occurredOn: string, closeOn: string) {
  return occurredOn <= closeOn ? ("next" as const) : ("later" as const);
}

export function sumMonthFor(occurredOn: string, closeOn: string) {
  const [year, month] = occurredOn.split("-").map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  return shiftMonthStart(start, chargeRoll(occurredOn, closeOn) === "next" ? 1 : 2);
}

export function payMonthFor(occurredOn: string, closeOn: string) {
  const [year, month] = occurredOn.split("-").map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  return shiftMonthStart(start, chargeRoll(occurredOn, closeOn) === "next" ? 2 : 3);
}

export function cardSumNote(occurredOn: string, closeOn: string) {
  const sums = sumMonthFor(occurredOn, closeOn);
  const pays = payMonthFor(occurredOn, closeOn);
  return `Suma en ${shortMonth(sums)} · pago ${shortMonth(pays)}`;
}

export function sumNoteForCharge(tx: Transaction, cards: CreditCard[], closes: CardMonthClose[]) {
  if (tx.type !== "egreso" || tx.payment_method !== "tarjeta_credito") return null;
  const own = cards.find((card) => card.id === tx.credit_card_id) ?? null;
  const source = own ? cycleSourceCard(own, cards) : (cards.find((card) => card.kind === "principal") ?? null);
  if (!source) return null;
  const [year, month] = tx.occurred_on.split("-").map(Number);
  const cursor = new Date(year, (month || 1) - 1, 1);
  const closeOn = closeOnForMonth(cursor, source.closing_day, closes, source.id);
  return cardSumNote(tx.occurred_on, closeOn);
}

export function upsertMonthClose(list: CardMonthClose[], next: CardMonthClose) {
  return [...list.filter((item) => !(item.cardId === next.cardId && item.month === next.month)), next];
}

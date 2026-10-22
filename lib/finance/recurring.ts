import type { CurrencyCode, RecurringPayment, RecurringPricePoint, Transaction } from "@/lib/types";
import { inCurrentMonth } from "@/lib/finance/wallet";
import { monthKey } from "@/lib/utils";

/** Primer mes del libro. No se muestra nada anterior. */
export const BOOKS_START_MONTH = "2026-10";
export const BOOKS_START_ISO = "2026-10-01";

const VIA_PREFIX = "via:";
const SUB_PREFIX = "sub:";

function notesLines(notes: string | null | undefined) {
  return (notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function recurringVia(item: Pick<RecurringPayment, "notes">) {
  const line = notesLines(item.notes).find((l) => l.startsWith(VIA_PREFIX)) ?? "";
  const rest = line.slice(VIA_PREFIX.length);
  if (rest.startsWith("tarjeta")) {
    const cardId = rest.includes(":") ? rest.slice(rest.indexOf(":") + 1) || null : null;
    return { onCard: true as const, cardId };
  }
  return { onCard: false as const, cardId: null };
}

export function isCardRecurring(item: Pick<RecurringPayment, "notes">) {
  return recurringVia(item).onCard;
}

export function cleanConceptName(name: string) {
  return name.replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim();
}

export function findRecurringByName(list: RecurringPayment[], name: string) {
  const needle = norm(cleanConceptName(name));
  return list.find((r) => norm(r.name) === needle) ?? null;
}

export function withRecurringVia(notes: string | null | undefined, onCard: boolean, cardId?: string | null) {
  const extra = notesLines(notes).filter(
    (l) => !l.startsWith(VIA_PREFIX) && !l.toLowerCase().startsWith(SUB_PREFIX),
  );
  if (onCard) extra.unshift(cardId ? `via:tarjeta:${cardId}` : "via:tarjeta");
  return extra.length ? extra.join("\n") : null;
}

function norm(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function chargeMatchesRecurring(
  item: Pick<RecurringPayment, "name">,
  tx: Pick<Transaction, "concept" | "type" | "payment_method">,
) {
  if (tx.type !== "egreso" || tx.payment_method !== "tarjeta_credito") return false;
  const needle = norm(cleanConceptName(item.name));
  const concept = norm(cleanConceptName(tx.concept));
  if (!needle || !concept) return false;
  if (concept === needle || concept.includes(needle) || needle.includes(concept)) return true;
  const words = needle.split(" ").filter((w) => w.length >= 4);
  return words.length > 0 && words.every((w) => concept.includes(w));
}

export function baMonthKey(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return formatted.slice(0, 7);
}

export function nextMonthKey(month: string) {
  const [year, raw] = month.split("-").map(Number);
  return monthKey(new Date(year, (raw || 1) - 1 + 1, 1));
}

export function monthOfValue(value: string | null | undefined) {
  if (!value) return null;
  const month = value.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

export function normalizePriceLog(value: unknown): RecurringPricePoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { from?: string; amount?: number; currency?: string };
      const from = monthOfValue(row.from);
      const amount = Number(row.amount);
      if (!from || !Number.isFinite(amount)) return [];
      const currency: CurrencyCode = row.currency === "USD" ? "USD" : "ARS";
      return [{ from, amount, currency }];
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function priceLogOf(item: Pick<RecurringPayment, "amount" | "currency" | "price_log">) {
  const stored = normalizePriceLog(item.price_log);
  if (stored.length) return stored;
  return [{ from: BOOKS_START_MONTH, amount: Number(item.amount), currency: item.currency }];
}

export function firstMonthOf(item: Pick<RecurringPayment, "amount" | "currency" | "price_log">) {
  const stored = normalizePriceLog(item.price_log);
  return stored[0]?.from ?? BOOKS_START_MONTH;
}

export function recurringApplies(item: RecurringPayment, month: string) {
  return month >= BOOKS_START_MONTH && month >= firstMonthOf(item);
}

export function isVoidInMonth(item: Pick<RecurringPayment, "void_from">, month: string) {
  const from = monthOfValue(item.void_from);
  return Boolean(from && month >= from);
}

export function amountForMonth(item: RecurringPayment, month: string) {
  const log = priceLogOf(item).filter((point) => point.from <= month);
  const snap = log[log.length - 1] ?? priceLogOf(item)[0];
  return {
    amount: snap?.amount ?? Number(item.amount),
    currency: snap?.currency ?? item.currency,
    voided: isVoidInMonth(item, month),
  };
}

export function paymentInMonth(item: RecurringPayment, month: string, transactions: Transaction[]) {
  return (
    transactions.find((tx) => {
      if (tx.type !== "egreso" || tx.occurred_on.slice(0, 7) !== month) return false;
      if (tx.source === "recurrente" && tx.concept === item.name && tx.payment_method !== "tarjeta_credito") return true;
      return isCardRecurring(item) && chargeMatchesRecurring(item, tx);
    }) ?? null
  );
}

/** El pago ya registrado gana. Si no hay pago, vale el precio de ese mes. */
export function shownRecurring(item: RecurringPayment, month: string, transactions: Transaction[]) {
  if (!recurringApplies(item, month)) return null;
  const paid = paymentInMonth(item, month, transactions);
  if (paid) {
    return { amount: Number(paid.amount), currency: paid.currency, voided: false as const, paid: true as const };
  }
  const priced = amountForMonth(item, month);
  return { ...priced, paid: false as const };
}

/** El cambio de precio corre desde el mes que estás viendo, nunca hacia atrás. */
export function priceChangeMonth(viewed: string | undefined, today = baMonthKey()) {
  const month = monthOfValue(viewed) ?? today;
  const from = month < today ? today : month;
  return from < BOOKS_START_MONTH ? BOOKS_START_MONTH : from;
}

export function applyPriceChange(
  item: RecurringPayment,
  amount: number,
  currency: CurrencyCode,
  fromMonth: string,
) {
  const from = fromMonth < BOOKS_START_MONTH ? BOOKS_START_MONTH : fromMonth;
  if (Number(item.amount) === amount && item.currency === currency && normalizePriceLog(item.price_log).length === 0) {
    return priceLogOf(item);
  }
  const kept = priceLogOf(item).filter((point) => point.from < from);
  if (!kept.length || kept[kept.length - 1]?.from !== from) kept.push({ from, amount, currency });
  else kept[kept.length - 1] = { from, amount, currency };
  return kept;
}

/** Borrar anula los meses que vienen. El mes en curso y los anteriores quedan. */
export function voidStartMonth(viewed: string | undefined, today = baMonthKey()) {
  const month = monthOfValue(viewed) ?? today;
  if (month > today) return month;
  return nextMonthKey(today);
}

export function cardCoversRecurring(
  item: RecurringPayment,
  transactions: Transaction[],
  ref = new Date(),
) {
  const via = recurringVia(item);
  if (!via.onCard) return false;
  return transactions.some((t) => {
    if (!chargeMatchesRecurring(item, t)) return false;
    if (!inCurrentMonth(t.occurred_on, ref)) return false;
    if (via.cardId && t.credit_card_id && t.credit_card_id !== via.cardId) return false;
    return true;
  });
}

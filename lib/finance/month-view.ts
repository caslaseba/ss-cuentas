import { isCashMethod } from "@/lib/finance/match";
import { amountForMonth, chargeMatchesRecurring, isCardRecurring, recurringApplies, recurringVia } from "@/lib/finance/recurring";
import type { BillingCycle } from "@/lib/finance/settlement";
import { groupCategory } from "@/lib/finance/style";
import { inCurrentMonth, monthWallet, shiftMonth } from "@/lib/finance/wallet";
import { isoDate, monthKey, startOfMonth } from "@/lib/utils";
import type { Category, CreditCard, Installment, RecurringPayment, Transaction } from "@/lib/types";

export type OriginKind = "plata" | "tarjeta" | "visa" | "papa";

export function uniqueById(list: Transaction[]) {
  const map = new Map<string, Transaction>();
  for (const t of list) map.set(t.id, t);
  return [...map.values()];
}

export function cashMonthSpend(monthTx: Transaction[]) {
  return monthTx.filter((t) => t.type === "egreso" && isCashMethod(t.payment_method));
}

export function cashMonthMoves(monthTx: Transaction[]) {
  return monthTx.filter((t) => t.payment_method !== "tarjeta_credito");
}

export function originLabel(kind: OriginKind) {
  if (kind === "plata") return "Tu sueldo";
  if (kind === "visa") return "Tu Visa";
  if (kind === "papa") return "Visa de papá";
  return "Tarjeta";
}

export function categorySlug(name: string) {
  return encodeURIComponent(name);
}

export function cursorFromMes(mes: string | null | undefined) {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return undefined;
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function categoryFromSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export type CategoryOriginRow = {
  name: string;
  sueldo: number;
  ingreso: number;
  visa: number;
  papa: number;
  total: number;
};

export function categoryOriginSplit(
  cashTx: Transaction[],
  cardTx: Transaction[],
  categories: Category[],
  mineId: string | null,
  papaId: string | null,
  toArs: (amount: number, currency: Transaction["currency"]) => number,
): CategoryOriginRow[] {
  const buckets: Record<string, CategoryOriginRow> = {};

  function row(name: string) {
    buckets[name] ??= { name, sueldo: 0, ingreso: 0, visa: 0, papa: 0, total: 0 };
    return buckets[name];
  }

  function catName(t: Transaction) {
    const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    return groupCategory(raw);
  }

  for (const t of cashTx) {
    const r = row(catName(t));
    const amount = toArs(Number(t.amount), t.currency);
    if (t.type === "ingreso") r.ingreso += amount;
    else r.sueldo += amount;
  }
  for (const t of cardTx.filter((x) => x.type === "egreso")) {
    const r = row(catName(t));
    const amount = toArs(Number(t.amount), t.currency);
    if (papaId && t.credit_card_id === papaId) r.papa += amount;
    else r.visa += amount;
  }
  return Object.values(buckets)
    .map((r) => ({ ...r, total: r.sueldo + r.visa + r.papa }))
    .sort((a, b) => Math.max(b.total, b.ingreso) - Math.max(a.total, a.ingreso));
}

export function txsForCategory(
  name: string,
  cashTx: Transaction[],
  cardTx: Transaction[],
  categories: Category[],
  papaId: string | null = null,
) {
  const match = (t: Transaction) => {
    const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    return groupCategory(raw) === name;
  };
  const cards = cardTx.filter((t) => t.type === "egreso" && match(t));
  return {
    ingreso: cashTx.filter((t) => t.type === "ingreso" && match(t)),
    sueldo: cashTx.filter((t) => t.type === "egreso" && match(t)),
    visa: cards.filter((t) => t.credit_card_id !== papaId),
    papa: cards.filter((t) => Boolean(papaId) && t.credit_card_id === papaId),
  };
}

export function txsForOrigin(
  kind: OriginKind,
  cashMoves: Transaction[],
  cardTx: Transaction[],
  papaId: string | null,
) {
  if (kind === "plata") return cashMoves;
  const cards = cardTx.filter((t) => t.type === "egreso");
  if (kind === "visa") return cards.filter((t) => t.credit_card_id !== papaId);
  if (kind === "papa") return cards.filter((t) => t.credit_card_id === papaId);
  return cards;
}

export function cardOfTx(t: Transaction, cards: CreditCard[]) {
  return cards.find((c) => c.id === t.credit_card_id) ?? null;
}

export const PROJECTED_CUOTA_PREFIX = "cuota-";
export const PROJECTED_FIJO_PREFIX = "fijo-";

export function isProjectedTx(tx: Pick<Transaction, "id">) {
  return tx.id.startsWith(PROJECTED_CUOTA_PREFIX) || tx.id.startsWith(PROJECTED_FIJO_PREFIX);
}

/** Ciclo de tarjeta visto desde ese mes: el actual usa hoy; el resto, el último día del mes. */
export function cardRefForMonth(cursor: Date, now: Date) {
  if (startOfMonth(cursor).getTime() === startOfMonth(now).getTime()) return now;
  return new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12, 0, 0);
}

export function typicalMonthlySalary(
  transactions: Transaction[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
  ref = new Date(),
) {
  const amounts: number[] = [];
  for (let i = 0; i < 6 && amounts.length < 3; i++) {
    const cobrado = monthWallet(transactions, toArs, shiftMonth(ref, -i)).cobrado;
    if (cobrado > 0) amounts.push(cobrado);
  }
  if (!amounts.length) return 0;
  return amounts.reduce((sum, n) => sum + n, 0) / amounts.length;
}

export function cashRecurringPaid(
  item: RecurringPayment,
  transactions: Transaction[],
  cursor: Date,
  isCurrent: boolean,
) {
  const linked = transactions.some(
    (t) =>
      t.source === "recurrente" &&
      t.concept === item.name &&
      t.type === "egreso" &&
      t.payment_method !== "tarjeta_credito" &&
      inCurrentMonth(t.occurred_on, cursor),
  );
  if (linked) return true;
  return isCurrent && item.is_paid;
}

export function cashBillsSettled(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  cursor: Date,
) {
  const cash = recurring.filter((r) => !isCardRecurring(r));
  if (!cash.length) return true;
  return cash.every((r) => cashRecurringPaid(r, transactions, cursor, false));
}

export function projectedInstallmentTxs(
  plans: Installment[],
  cycle: BillingCycle,
  existing: Transaction[],
  allTx: Transaction[],
  cardIds: Set<string>,
  monthsAhead = 0,
): Transaction[] {
  const extra: Transaction[] = [];
  for (const plan of plans) {
    if (!cardIds.has(plan.credit_card_id)) continue;
    const recordedNums = allTx
      .filter((t) => t.installment_id === plan.id)
      .map((t) => Number(t.installment_number) || 0);
    const maxTx = recordedNums.length ? Math.max(...recordedNums) : 0;
    const known = Math.max(Number(plan.current_installment) || 0, maxTx);
    const start = new Date(`${plan.start_date}T12:00:00`);
    const elapsed =
      (cycle.end.getFullYear() - start.getFullYear()) * 12 + (cycle.end.getMonth() - start.getMonth());
    const byDate = elapsed + 1;
    const fromKnown = known + monthsAhead;
    const hasProgress = known > 1 || maxTx > 0;
    const number = hasProgress ? fromKnown : byDate;
    if (!Number.isFinite(number) || number < 1 || number > plan.installment_count) continue;
    if (existing.some((t) => t.installment_id === plan.id && t.installment_number === number)) continue;
    if (monthsAhead === 0 && existing.some((t) => t.installment_id === plan.id)) continue;

    const prior = [...allTx].reverse().find((t) => t.installment_id === plan.id);
    extra.push({
      id: `${PROJECTED_CUOTA_PREFIX}${plan.id}-${number}`,
      user_id: plan.user_id,
      type: "egreso",
      amount: Number(plan.installment_amount),
      currency: plan.currency,
      category_id: prior?.category_id ?? null,
      account_id: null,
      credit_card_id: plan.credit_card_id,
      installment_id: plan.id,
      installment_number: number,
      concept: `${plan.concept} (cuota ${number}/${plan.installment_count})`,
      payment_method: "tarjeta_credito",
      occurred_on: isoDate(cycle.end),
      notes: "proyectado",
      source: "cuota",
    });
  }
  return extra;
}

export function projectedCashTxs(
  recurring: RecurringPayment[],
  cursor: Date,
  existing: Transaction[],
  userId: string,
): Transaction[] {
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const month = monthKey(cursor);
  return recurring
    .filter((r) => !isCardRecurring(r))
    .filter((r) => recurringApplies(r, month) && !amountForMonth(r, month).voided)
    .filter(
      (r) =>
        !existing.some(
          (t) =>
            t.source === "recurrente" &&
            t.concept === r.name &&
            t.type === "egreso" &&
            t.payment_method !== "tarjeta_credito",
        ),
    )
    .map((r) => {
      const day = Math.min(Math.max(1, r.due_day), lastDay);
      const priced = amountForMonth(r, month);
      return {
        id: `${PROJECTED_FIJO_PREFIX}${r.id}-${monthKey(cursor)}`,
        user_id: userId,
        type: "egreso" as const,
        amount: priced.amount,
        currency: priced.currency,
        category_id: r.category_id,
        account_id: r.account_id,
        credit_card_id: null,
        installment_id: null,
        installment_number: null,
        concept: r.name,
        payment_method: "transferencia" as const,
        occurred_on: isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)),
        notes: "proyectado",
        source: "recurrente" as const,
      };
    });
}

function occurrenceDays(frequency: RecurringPayment["frequency"], dueDay: number, lastDay: number) {
  const anchor = Math.min(28, Math.max(1, dueDay || 1));
  if (frequency === "semanal") {
    const days: number[] = [];
    for (let day = ((anchor - 1) % 7) + 1; day <= lastDay; day += 7) days.push(day);
    return days;
  }
  if (frequency === "anual") return [];
  return [Math.min(anchor, lastDay)];
}

/**
 * Un fijo semanal o mensual que se debita de una tarjeta entra en esa tarjeta
 * aunque no haya un consumo cargado. Si el consumo ya está, no se duplica.
 */
export function projectedCardRecurringTxs(
  recurring: RecurringPayment[],
  existing: Transaction[],
  cards: CreditCard[],
  cursor: Date,
  userId: string,
  fallbackCardId: string | null,
): Transaction[] {
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const month = monthKey(cursor);
  const extra: Transaction[] = [];
  for (const item of recurring) {
    if (!isCardRecurring(item)) continue;
    if (item.frequency === "anual") continue;
    if (!recurringApplies(item, month) || amountForMonth(item, month).voided) continue;
    const via = recurringVia(item);
    const cardId =
      (via.cardId && cards.some((card) => card.id === via.cardId) ? via.cardId : null) ?? fallbackCardId;
    if (!cardId) continue;
    const days = occurrenceDays(item.frequency, item.due_day, lastDay);
    const matches = existing.filter(
      (tx) =>
        tx.credit_card_id === cardId &&
        inCurrentMonth(tx.occurred_on, cursor) &&
        chargeMatchesRecurring(item, tx),
    );
    const covered = new Set<number>();
    const slack = item.frequency === "semanal" ? 3 : 31;
    for (const tx of matches) {
      const day = chargeDay(tx.occurred_on);
      let best = 0;
      let bestDist = 99;
      for (const candidate of days) {
        if (covered.has(candidate)) continue;
        const dist = Math.abs(candidate - day);
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }
      if (best && bestDist <= slack) covered.add(best);
    }
    for (const day of days) {
      if (covered.has(day)) continue;
      const priced = amountForMonth(item, month);
      extra.push({
        id: `${PROJECTED_FIJO_PREFIX}${item.id}-${monthKey(cursor)}-${day}`,
        user_id: userId,
        type: "egreso",
        amount: priced.amount,
        currency: priced.currency,
        category_id: item.category_id,
        account_id: null,
        credit_card_id: cardId,
        installment_id: null,
        installment_number: null,
        concept: item.name,
        payment_method: "tarjeta_credito",
        occurred_on: isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)),
        notes: "proyectado",
        source: "recurrente",
      });
    }
  }
  return extra;
}

export function spendOnCard(
  txs: Transaction[],
  cardId: string | null | undefined,
  toArs: (amount: number, currency: Transaction["currency"]) => number,
) {
  if (!cardId) return 0;
  return txs
    .filter((t) => t.type === "egreso" && t.credit_card_id === cardId)
    .reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
}

export function chargeDay(dateStr: string) {
  const day = Number(dateStr.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/** El día de cierre entra en el resumen. Lo posterior queda para el cierre que sigue. */
export function isOnOrBeforeClose(dateStr: string, closingDay: number) {
  return chargeDay(dateStr) <= closingDay;
}

export function cardChargesInMonth(txs: Transaction[], month: Date, cardIds: Set<string>) {
  return txs.filter(
    (t) =>
      t.type === "egreso" &&
      t.payment_method === "tarjeta_credito" &&
      Boolean(t.credit_card_id) &&
      cardIds.has(t.credit_card_id as string) &&
      inCurrentMonth(t.occurred_on, month),
  );
}

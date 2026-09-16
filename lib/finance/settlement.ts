import type { CreditCard, Installment, Transaction } from "@/lib/types";

export type BillingCycle = {
  start: Date;
  end: Date;
  label: string;
};

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateWithDay(year: number, monthIndex: number, day: number) {
  const capped = Math.min(day, lastDayOfMonth(year, monthIndex));
  return new Date(year, monthIndex, capped);
}

/**
 * Ciclo de liquidación argentino típico:
 * si el cierre es el día C, el período vigente va del (C+1) del mes anterior
 * hasta el día C del mes actual.
 */
export function getBillingCycle(card: Pick<CreditCard, "closing_day">, ref = new Date()): BillingCycle {
  const closing = card.closing_day;
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();

  let end: Date;
  let start: Date;

  if (day <= closing) {
    end = dateWithDay(y, m, closing);
    start = dateWithDay(y, m - 1, closing);
    start.setDate(start.getDate() + 1);
  } else {
    end = dateWithDay(y, m + 1, closing);
    start = dateWithDay(y, m, closing);
    start.setDate(start.getDate() + 1);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    label: `${start.toLocaleDateString("es-AR")} → ${end.toLocaleDateString("es-AR")}`,
  };
}

export function inCycle(dateStr: string, cycle: BillingCycle) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d >= cycle.start && d <= cycle.end;
}

export function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function installmentDueDates(plan: Installment) {
  const start = new Date(`${plan.start_date}T12:00:00`);
  return Array.from({ length: plan.installment_count }, (_, i) => ({
    number: i + 1,
    date: addMonths(start, i),
    amount: Number(plan.installment_amount),
    isCurrent: i + 1 === plan.current_installment,
    isPaid: i + 1 < plan.current_installment,
  }));
}

export function currentInstallmentForCycle(plan: Installment, cycle: BillingCycle) {
  return installmentDueDates(plan).find((item) => {
    const iso = item.date.toISOString().slice(0, 10);
    return inCycle(iso, cycle);
  });
}

export function usdToLocal(
  amountUsd: number,
  exchangeRate: number,
  taxPct = 0,
) {
  return amountUsd * exchangeRate * (1 + taxPct / 100);
}

export function familyCardIds(card: CreditCard, all: CreditCard[]) {
  if (card.kind === "extension") return [card.id];
  return [card.id, ...all.filter((c) => c.parent_card_id === card.id).map((c) => c.id)];
}

export function cycleSourceCard(card: CreditCard, all: CreditCard[]) {
  if (card.kind === "extension" && card.parent_card_id) {
    return all.find((c) => c.id === card.parent_card_id) ?? card;
  }
  return card;
}

export function calendarDaysUntil(target: Date, ref = new Date()) {
  const a = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function lastClosingDate(card: Pick<CreditCard, "closing_day">, ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (ref.getDate() >= card.closing_day) return dateWithDay(y, m, card.closing_day);
  return dateWithDay(y, m - 1, card.closing_day);
}

export function nextClosingDate(card: Pick<CreditCard, "closing_day">, ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (ref.getDate() <= card.closing_day) return dateWithDay(y, m, card.closing_day);
  return dateWithDay(y, m + 1, card.closing_day);
}

export function dueAfterClosing(
  card: Pick<CreditCard, "closing_day" | "due_day">,
  closing: Date,
) {
  if (card.due_day > card.closing_day) {
    return dateWithDay(closing.getFullYear(), closing.getMonth(), card.due_day);
  }
  return dateWithDay(closing.getFullYear(), closing.getMonth() + 1, card.due_day);
}

export function cardSchedule(card: Pick<CreditCard, "closing_day" | "due_day">, ref = new Date()) {
  const nextClose = nextClosingDate(card, ref);
  const lastClose = lastClosingDate(card, ref);
  const dueFromLast = dueAfterClosing(card, lastClose);
  const dueFromNext = dueAfterClosing(card, nextClose);
  const nextDue = dueFromLast.getTime() >= dateWithDay(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime()
    ? dueFromLast
    : dueFromNext;
  const daysToClose = calendarDaysUntil(nextClose, ref);
  const daysToDue = calendarDaysUntil(nextDue, ref);

  return {
    nextClose,
    nextDue,
    lastClose,
    daysToClose,
    daysToDue,
    closesToday: daysToClose === 0,
    dueToday: daysToDue === 0,
  };
}

export function closeMessage(schedule: ReturnType<typeof cardSchedule>) {
  if (schedule.closesToday) return "Cierra hoy";
  if (schedule.daysToClose === 1) return "Cierra mañana";
  if (schedule.daysToClose <= 5) return `Cierra en ${schedule.daysToClose} días`;
  return `Cierra el ${schedule.nextClose.toLocaleDateString("es-AR")}`;
}

export function dueMessage(schedule: ReturnType<typeof cardSchedule>) {
  if (schedule.dueToday) return "Vence hoy";
  if (schedule.daysToDue === 1) return "Vence mañana";
  if (schedule.daysToDue <= 7) return `Vence en ${schedule.daysToDue} días`;
  return `Vence el ${schedule.nextDue.toLocaleDateString("es-AR")}`;
}

export function planProgress(plan: Installment, ref = new Date()) {
  const start = new Date(`${plan.start_date}T12:00:00`);
  const elapsed =
    (ref.getFullYear() - start.getFullYear()) * 12 + (ref.getMonth() - start.getMonth());
  const current = Math.min(Math.max(elapsed + 1, 1), plan.installment_count);
  const remainingAfterThis = Math.max(0, plan.installment_count - current);
  return {
    current,
    remainingAfterThis,
    isLast: current >= plan.installment_count,
    total: plan.installment_count,
  };
}

export function summarizeCard(
  card: CreditCard,
  transactions: Transaction[],
  installments: Installment[],
  profile: { usd_exchange_rate: number; tax_surcharge_pct: number },
  allCards: CreditCard[] = [],
  ref = new Date(),
) {
  const cycleCard = cycleSourceCard(card, allCards);
  const cycle = getBillingCycle(cycleCard, ref);
  const ids = familyCardIds(card, allCards);
  const tx = transactions.filter(
    (t) => t.credit_card_id && ids.includes(t.credit_card_id) && t.type === "egreso" && inCycle(t.occurred_on, cycle),
  );

  let ars = tx
    .filter((t) => t.currency === "ARS")
    .reduce((s, t) => s + Number(t.amount), 0);

  let usd = tx
    .filter((t) => t.currency === "USD")
    .reduce((s, t) => s + Number(t.amount), 0);

  const relatedPlans = installments.filter((i) => ids.includes(i.credit_card_id));
  for (const plan of relatedPlans) {
    const slot = currentInstallmentForCycle(plan, cycle);
    if (!slot) continue;
    const already = tx.some(
      (t) => t.installment_id === plan.id && t.installment_number === slot.number,
    );
    if (already) continue;
    if (plan.currency === "USD") usd += slot.amount;
    else ars += slot.amount;
  }

  const taxPct = Number(cycleCard.usd_tax_pct) || Number(profile.tax_surcharge_pct) || 0;
  const usdLocal = usdToLocal(usd, Number(profile.usd_exchange_rate), taxPct);

  const projected = relatedPlans
    .flatMap((plan) =>
      installmentDueDates(plan).filter((item) => {
        const progress = planProgress(plan, ref);
        return item.number > progress.current && item.date > cycle.end;
      }),
    )
    .reduce((s, i) => s + i.amount, 0);

  const byCard = ids.map((id) => {
    const found = allCards.find((c) => c.id === id) ?? (id === card.id ? card : null);
    const amount = tx.filter((t) => t.credit_card_id === id).reduce((s, t) => {
      if (t.currency === "USD") {
        return s + usdToLocal(Number(t.amount), Number(profile.usd_exchange_rate), taxPct);
      }
      return s + Number(t.amount);
    }, 0);
    return { id, name: found?.name ?? "Tarjeta", kind: found?.kind ?? card.kind, amount };
  });

  const schedule = cardSchedule(cycleCard, ref);

  return {
    cycle,
    schedule,
    ars,
    usd,
    usdLocal,
    totalLocal: ars + usdLocal,
    available: Number(cycleCard.available_limit),
    projected,
    tx,
    byCard,
  };
}

export function budgetTone(spent: number, limit: number | null) {
  if (!limit || limit <= 0) return "neutral" as const;
  const ratio = spent / limit;
  if (ratio < 0.7) return "ok" as const;
  if (ratio < 0.9) return "warn" as const;
  return "danger" as const;
}

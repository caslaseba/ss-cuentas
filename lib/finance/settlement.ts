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

export function summarizeCard(
  card: CreditCard,
  transactions: Transaction[],
  installments: Installment[],
  profile: { usd_exchange_rate: number; tax_surcharge_pct: number },
  ref = new Date(),
) {
  const cycle = getBillingCycle(card, ref);
  const tx = transactions.filter(
    (t) => t.credit_card_id === card.id && inCycle(t.occurred_on, cycle),
  );

  const ars = tx
    .filter((t) => t.currency === "ARS" && t.type === "egreso")
    .reduce((s, t) => s + Number(t.amount), 0);

  const usd = tx
    .filter((t) => t.currency === "USD" && t.type === "egreso")
    .reduce((s, t) => s + Number(t.amount), 0);

  const taxPct = Number(card.usd_tax_pct) || Number(profile.tax_surcharge_pct) || 0;
  const usdLocal = usdToLocal(usd, Number(profile.usd_exchange_rate), taxPct);

  const futureInstallments = installments
    .filter((i) => i.credit_card_id === card.id)
    .flatMap((plan) =>
      installmentDueDates(plan).filter((item) => !item.isPaid && item.date > cycle.end),
    );

  const projected = futureInstallments.reduce((s, i) => s + i.amount, 0);

  return {
    cycle,
    ars,
    usd,
    usdLocal,
    totalLocal: ars + usdLocal,
    available: Number(card.available_limit),
    projected,
    tx,
  };
}

export function budgetTone(spent: number, limit: number | null) {
  if (!limit || limit <= 0) return "neutral" as const;
  const ratio = spent / limit;
  if (ratio < 0.7) return "ok" as const;
  if (ratio < 0.9) return "warn" as const;
  return "danger" as const;
}

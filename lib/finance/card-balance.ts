import { nextMonthKey } from "@/lib/finance/recurring";

export function cardCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type CardLedger = {
  /** Lo que no se liquidó en el mes anterior y entra en esta tarjeta. */
  saldoAnterior: number;
  charges: number;
  paid: number;
  pending: number;
};

function monthsThrough(start: string, end: string) {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < 36) {
    months.push(cursor);
    cursor = nextMonthKey(cursor);
  }
  return months;
}

/**
 * El saldo de la tarjeta viaja al mes siguiente.
 * `settledByCarry` cubre pagos viejos anotados como cuenta impaga, para no pedirlos otra vez.
 */
export function walkCardLedger(input: {
  viewedMonth: string;
  booksStart: string;
  charges: (month: string) => number;
  paid: (month: string) => number;
  settledByCarry?: (sourceMonth: string) => number;
}): CardLedger {
  const empty: CardLedger = { saldoAnterior: 0, charges: 0, paid: 0, pending: 0 };
  if (input.viewedMonth < input.booksStart) return empty;
  let pending = 0;
  for (const month of monthsThrough(input.booksStart, input.viewedMonth)) {
    const saldoAnterior = pending;
    const charges = cardCents(Math.max(0, input.charges(month)));
    const paid = cardCents(Math.max(0, input.paid(month)));
    let left = cardCents(Math.max(0, charges + saldoAnterior - paid));
    const carry = cardCents(Math.max(0, input.settledByCarry?.(month) ?? 0));
    if (carry > 0) left = cardCents(Math.max(0, left - carry));
    if (month === input.viewedMonth) return { saldoAnterior, charges, paid, pending: left };
    pending = left;
  }
  return empty;
}

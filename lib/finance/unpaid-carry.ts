import { nextMonthKey } from "@/lib/finance/recurring";

/** Una deuda que no se cubrió y viaja al mes siguiente. */
export type UnpaidPart = {
  kind: "tarjeta" | "servicio";
  month: string;
  name: string;
  amount: number;
};

export type UnpaidCarry = {
  /** Mes del que llega la deuda. Null si este mes es el primero del libro. */
  sourceMonth: string | null;
  due: number;
  paid: number;
  left: number;
  parts: UnpaidPart[];
};

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function previousMonth(month: string) {
  const [year, raw] = month.split("-").map(Number);
  const date = new Date(year, (raw || 1) - 2, 1);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return key;
}

function monthsThrough(start: string, end: string) {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < 36) {
    months.push(cursor);
    cursor = nextMonthKey(cursor);
  }
  return months;
}

function sumParts(parts: UnpaidPart[]) {
  return cents(parts.reduce((sum, part) => sum + part.amount, 0));
}

/** El pago cubre primero lo más viejo. */
export function applyUnpaidPayment(parts: UnpaidPart[], paid: number) {
  let rest = cents(Math.max(0, paid));
  const next: UnpaidPart[] = [];
  for (const part of parts) {
    if (rest <= 0) {
      next.push(part);
      continue;
    }
    if (part.amount <= rest + 0.001) {
      rest = cents(rest - part.amount);
      continue;
    }
    next.push({ ...part, amount: cents(part.amount - rest) });
    rest = 0;
  }
  return next;
}

/**
 * Lo que no se pagó en un mes entra en el siguiente.
 * `born` es la deuda nueva de ese mes: tarjeta sin cubrir y servicios sin pagar.
 * Un mes futuro no genera deuda nueva. La que ya existe sigue hasta que se pague.
 */
export function walkUnpaidCarry(input: {
  viewedMonth: string;
  nowMonth: string;
  booksStart: string;
  born: (month: string) => UnpaidPart[];
  paidIn: (month: string, sourceMonth: string) => number;
}): UnpaidCarry {
  const empty: UnpaidCarry = { sourceMonth: null, due: 0, paid: 0, left: 0, parts: [] };
  if (input.viewedMonth < input.booksStart) return empty;
  let parts: UnpaidPart[] = [];
  for (const month of monthsThrough(input.booksStart, input.viewedMonth)) {
    const source = previousMonth(month);
    const carries = source >= input.booksStart;
    const paid = carries ? cents(Math.max(0, input.paidIn(month, source))) : 0;
    const due = sumParts(parts);
    if (month === input.viewedMonth) {
      const leftParts = applyUnpaidPayment(parts, paid);
      return {
        sourceMonth: carries ? source : null,
        due,
        paid: Math.min(paid, due),
        left: sumParts(leftParts),
        parts: leftParts,
      };
    }
    const leftParts = applyUnpaidPayment(parts, paid);
    const extra = month > input.nowMonth ? [] : input.born(month).filter((part) => part.amount > 0.004);
    parts = [...leftParts, ...extra.map((part) => ({ ...part, amount: cents(part.amount) }))];
  }
  return empty;
}

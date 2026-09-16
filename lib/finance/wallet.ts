import { parseISO } from "date-fns";
import { isCashMethod } from "@/lib/finance/match";
import { notesHasLine } from "@/lib/finance/tx-notes";
import { monthKey } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export function inCurrentMonth(dateStr: string, ref = new Date()) {
  const d = parseISO(dateStr);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export function monthWallet(transactions: Transaction[], toArs: (amount: number, currency: Transaction["currency"]) => number, ref = new Date()) {
  const monthTx = transactions.filter((t) => inCurrentMonth(t.occurred_on, ref));
  const cobrado = monthTx
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0);
  const gastadoContado = monthTx
    .filter((t) => t.type === "egreso" && isCashMethod(t.payment_method))
    .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0);
  const gastadoTarjeta = monthTx
    .filter((t) => t.type === "egreso" && t.payment_method === "tarjeta_credito")
    .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0);

  return {
    cobrado,
    gastadoContado,
    gastadoTarjeta,
    queda: cobrado - gastadoContado,
    monthTx,
  };
}

export function methodBreakdown(
  transactions: Transaction[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
) {
  const buckets: Record<string, number> = {};
  for (const t of transactions.filter((x) => x.type === "egreso")) {
    const key =
      t.payment_method === "billetera"
        ? "Mercado Pago"
        : t.payment_method === "tarjeta_credito"
          ? "Tarjeta"
          : t.payment_method === "efectivo"
            ? "Efectivo"
            : t.payment_method === "debito"
              ? "Débito"
              : "Transferencia";
    buckets[key] = (buckets[key] ?? 0) + toArs(Number(t.amount), t.currency);
  }
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));
}

export function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function carryOverNote(fromMonth: Date) {
  return `sobra:${monthKey(fromMonth)}`;
}

export function hasCarryOver(transactions: Transaction[], intoMonth: Date) {
  const note = carryOverNote(shiftMonth(intoMonth, -1));
  return transactions.some(
    (t) => t.type === "ingreso" && notesHasLine(t.notes, note) && inCurrentMonth(t.occurred_on, intoMonth),
  );
}

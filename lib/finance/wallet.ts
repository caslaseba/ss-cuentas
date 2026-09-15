import { parseISO } from "date-fns";
import { isCashMethod } from "@/lib/finance/match";
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

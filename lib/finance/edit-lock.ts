import { isCycleClosed, type BillingCycle } from "@/lib/finance/settlement";
import { cashBillsSettled } from "@/lib/finance/month-view";
import { startOfMonth } from "@/lib/utils";
import type { RecurringPayment, Transaction } from "@/lib/types";

export const EDIT_PIN = "1234";
export const EDIT_UNLOCK_KEY = "ss-cuentas-edit-ok";

export function monthIsPast(cursor: Date, now: Date) {
  return startOfMonth(cursor).getTime() < startOfMonth(now).getTime();
}

export function monthIsFuture(cursor: Date, now: Date) {
  return startOfMonth(cursor).getTime() > startOfMonth(now).getTime();
}

/** Mes anterior con tarjeta ya cerrada y cuentas de sueldo pagadas. */
export function monthIsSealed(
  cursor: Date,
  now: Date,
  cycle: BillingCycle | null | undefined,
  recurring: RecurringPayment[],
  transactions: Transaction[],
) {
  if (!monthIsPast(cursor, now)) return false;
  const cardClosed = !cycle || isCycleClosed(cycle, now);
  return cardClosed && cashBillsSettled(recurring, transactions, cursor);
}

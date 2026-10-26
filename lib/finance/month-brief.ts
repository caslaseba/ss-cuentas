import type { Category, Transaction } from "@/lib/types";
import { observationOf } from "@/lib/finance/tx-notes";
import { inCurrentMonth } from "@/lib/finance/wallet";

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Sueldo cobrado. La sobra del mes anterior no cuenta como sueldo. */
export function isSalaryTx(
  tx: Pick<Transaction, "type" | "concept" | "category_id" | "notes">,
  categories: Pick<Category, "id" | "name">[],
) {
  if (tx.type !== "ingreso") return false;
  const concept = fold(tx.concept);
  if (concept.startsWith("sobra")) return false;
  if ((tx.notes ?? "").toLowerCase().includes("sobra:")) return false;
  const cat = fold(categories.find((item) => item.id === tx.category_id)?.name ?? "");
  return cat.includes("sueldo") || concept === "sueldo" || concept.startsWith("sueldo ");
}

export function monthIncomeSplit(
  transactions: Transaction[],
  categories: Pick<Category, "id" | "name">[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
  month: Date,
) {
  let sueldo = 0;
  let ingresos = 0;
  const names = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "ingreso" || !inCurrentMonth(tx.occurred_on, month)) continue;
    const amount = toArs(Number(tx.amount), tx.currency);
    if (!Number.isFinite(amount)) continue;
    if (isSalaryTx(tx, categories)) {
      sueldo += amount;
      continue;
    }
    ingresos += amount;
    const name = tx.concept.trim() || "Ingreso";
    names.set(name, (names.get(name) ?? 0) + amount);
  }
  const detalle = [...names.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  return { sueldo, ingresos, detalle };
}

export type IncomeLine = {
  id: string;
  on: string;
  concept: string;
  note: string;
  amount: number;
};

/** Cada ingreso del mes, sueldo incluido. */
export function monthIncomeLines(
  transactions: Transaction[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
  month: Date,
): IncomeLine[] {
  return transactions
    .filter((tx) => tx.type === "ingreso" && inCurrentMonth(tx.occurred_on, month))
    .map((tx) => ({
      id: tx.id,
      on: tx.occurred_on,
      concept: tx.concept.trim() || "Ingreso",
      note: observationOf(tx.notes),
      amount: toArs(Number(tx.amount), tx.currency),
    }))
    .filter((line) => Number.isFinite(line.amount))
    .sort((a, b) => b.on.localeCompare(a.on) || a.concept.localeCompare(b.concept, "es"));
}

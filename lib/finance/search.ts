import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { groupCategory } from "@/lib/finance/style";
import { observationOf } from "@/lib/finance/tx-notes";
import type { Category, Transaction } from "@/lib/types";

export type SearchFilters = {
  query: string;
  type: "todos" | "ingreso" | "egreso";
  method: "todos" | "plata" | "mp" | "tarjeta";
  monthOnly: boolean;
  inName: boolean;
  inCategory: boolean;
  inAmount: boolean;
  categoryNames: string[];
};

export const EMPTY_SEARCH: SearchFilters = {
  query: "",
  type: "todos",
  method: "todos",
  monthOnly: false,
  inName: true,
  inCategory: true,
  inAmount: true,
  categoryNames: [],
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function amountMatchesQuery(amount: number, query: string) {
  const q = query.trim();
  if (!q) return true;
  const qDigits = digits(q);
  if (!qDigits) return false;
  const formatted = formatAmountFromNumber(amount);
  const formattedDigits = digits(formatted);
  if (formattedDigits === qDigits || formattedDigits.startsWith(qDigits)) return true;
  const pesos = String(Math.round(Math.abs(amount)));
  if (pesos === qDigits || pesos.startsWith(qDigits)) return true;
  const parsed = parseAmountInput(q);
  if (parsed > 0 && Math.abs(parsed - amount) < 0.005) return true;
  return false;
}

function nameHay(tx: Transaction) {
  return fold([tx.concept, observationOf(tx.notes)].join(" "));
}

function categoryHay(tx: Transaction, categories: Category[]) {
  const cat = categories.find((c) => c.id === tx.category_id)?.name ?? "";
  return fold([cat, groupCategory(cat)].join(" "));
}

export function filterTransactions(list: Transaction[], categories: Category[], filters: SearchFilters) {
  const q = filters.query.trim();
  const qNorm = fold(q);
  const qDigits = digits(q);
  const anyField = filters.inName || filters.inCategory || filters.inAmount;
  const useName = !anyField || filters.inName;
  const useCat = !anyField || filters.inCategory;
  const useAmt = !anyField || filters.inAmount;
  const catSet = new Set(filters.categoryNames);

  return list.filter((tx) => {
    if (filters.type !== "todos" && tx.type !== filters.type) return false;
    if (filters.method === "tarjeta" && tx.payment_method !== "tarjeta_credito") return false;
    if (filters.method === "mp" && tx.payment_method !== "billetera") return false;
    if (
      filters.method === "plata" &&
      (tx.payment_method === "tarjeta_credito" || tx.payment_method === "billetera")
    ) {
      return false;
    }
    if (catSet.size) {
      const raw = categories.find((c) => c.id === tx.category_id)?.name ?? "Sin categoría";
      if (!catSet.has(groupCategory(raw))) return false;
    }
    if (!q) return true;
    if (useAmt && qDigits && amountMatchesQuery(Number(tx.amount), q)) return true;
    if (useName && nameHay(tx).includes(qNorm)) return true;
    if (useCat && categoryHay(tx, categories).includes(qNorm)) return true;
    return false;
  });
}

export function searchTotals(
  hits: Transaction[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
) {
  let gastos = 0;
  let cobros = 0;
  for (const tx of hits) {
    const n = toArs(Number(tx.amount), tx.currency);
    if (tx.type === "ingreso") cobros += n;
    else gastos += n;
  }
  return { gastos, cobros, count: hits.length };
}

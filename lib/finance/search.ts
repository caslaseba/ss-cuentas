import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { paymentMethodLabel } from "@/lib/finance/match";
import { groupCategory } from "@/lib/finance/style";
import { observationOf } from "@/lib/finance/tx-notes";
import type { Category, Transaction } from "@/lib/types";

export type SearchFilters = {
  query: string;
  type: "todos" | "ingreso" | "egreso";
  method: "todos" | "plata" | "mp" | "tarjeta";
  monthOnly: boolean;
};

export const EMPTY_SEARCH: SearchFilters = {
  query: "",
  type: "todos",
  method: "todos",
  monthOnly: true,
};

function digits(value: string) {
  return value.replace(/\D/g, "");
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

function textHay(tx: Transaction, categories: Category[]) {
  const cat = categories.find((c) => c.id === tx.category_id)?.name ?? "";
  return [tx.concept, cat, groupCategory(cat), observationOf(tx.notes), paymentMethodLabel(tx.payment_method)]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterTransactions(
  list: Transaction[],
  categories: Category[],
  filters: SearchFilters,
  monthKeyOf: (tx: Transaction) => string,
  currentMonth: string,
) {
  const q = filters.query.trim();
  const qNorm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const qDigits = digits(q);

  return list.filter((tx) => {
    if (filters.monthOnly && monthKeyOf(tx) !== currentMonth) return false;
    if (filters.type !== "todos" && tx.type !== filters.type) return false;
    if (filters.method === "tarjeta" && tx.payment_method !== "tarjeta_credito") return false;
    if (filters.method === "mp" && tx.payment_method !== "billetera") return false;
    if (
      filters.method === "plata" &&
      (tx.payment_method === "tarjeta_credito" || tx.payment_method === "billetera")
    ) {
      return false;
    }
    if (!q) return true;
    if (qDigits && amountMatchesQuery(Number(tx.amount), q)) return true;
    return textHay(tx, categories).includes(qNorm);
  });
}

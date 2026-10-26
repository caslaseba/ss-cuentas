import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { occurredOnMatches, parseDateQuery } from "@/lib/finance/date-query";
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
  const dateQuery = parseDateQuery(q);

  return list.filter((tx) => {
    if (filters.type !== "todos" && tx.type !== filters.type) return false;
    if (filters.method === "tarjeta" && tx.payment_method !== "tarjeta_credito") return false;
    if (filters.method === "mp" && tx.payment_method !== "transferencia" && tx.payment_method !== "billetera" && tx.payment_method !== "efectivo") return false;
    if (filters.method === "plata" && tx.payment_method === "tarjeta_credito") return false;
    if (catSet.size) {
      const raw = categories.find((c) => c.id === tx.category_id)?.name ?? "Sin categoría";
      if (!catSet.has(groupCategory(raw))) return false;
    }
    if (!q) return true;
    if (dateQuery && occurredOnMatches(tx.occurred_on, dateQuery)) return true;
    if (useAmt && qDigits && !dateQuery && amountMatchesQuery(Number(tx.amount), q)) return true;
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
  let ahora = 0;
  let tarjeta = 0;
  for (const tx of hits) {
    const n = toArs(Number(tx.amount), tx.currency);
    if (tx.type === "ingreso") cobros += n;
    else {
      gastos += n;
      if (tx.payment_method === "tarjeta_credito") tarjeta += n;
      else ahora += n;
    }
  }
  return { gastos, cobros, ahora, tarjeta, count: hits.length };
}

export type MoveSort = "az" | "valor-desc" | "valor-asc";

export function sortMoves(list: Transaction[], sort: MoveSort, categories: Category[]) {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sort === "valor-desc") return Number(b.amount) - Number(a.amount);
    if (sort === "valor-asc") return Number(a.amount) - Number(b.amount);
    const an = (a.concept ?? "").replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim();
    const bn = (b.concept ?? "").replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim();
    const byName = an.localeCompare(bn, "es", { sensitivity: "base" });
    if (byName) return byName;
    const ac = categories.find((c) => c.id === a.category_id)?.name ?? "";
    const bc = categories.find((c) => c.id === b.category_id)?.name ?? "";
    return ac.localeCompare(bc, "es", { sensitivity: "base" });
  });
  return copy;
}

export type CategoryMoveGroup = {
  name: string;
  ahora: number;
  tarjeta: number;
  ingresos: number;
  items: Transaction[];
};

export function groupMovesByCategory(
  list: Transaction[],
  categories: Category[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
  sort: MoveSort,
): CategoryMoveGroup[] {
  const buckets = new Map<string, CategoryMoveGroup>();
  for (const tx of list) {
    const raw = categories.find((c) => c.id === tx.category_id)?.name ?? (tx.type === "ingreso" ? "Ingresos" : "Sin categoría");
    const name = groupCategory(raw);
    const row = buckets.get(name) ?? { name, ahora: 0, tarjeta: 0, ingresos: 0, items: [] };
    const n = toArs(Number(tx.amount), tx.currency);
    if (tx.type === "ingreso") row.ingresos += n;
    else if (tx.payment_method === "tarjeta_credito") row.tarjeta += n;
    else row.ahora += n;
    row.items.push(tx);
    buckets.set(name, row);
  }
  return [...buckets.values()]
    .map((row) => ({ ...row, items: sortMoves(row.items, sort, categories) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

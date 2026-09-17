import { isCashMethod } from "@/lib/finance/match";
import { groupCategory } from "@/lib/finance/style";
import type { Category, CreditCard, Transaction } from "@/lib/types";

export type OriginKind = "plata" | "tarjeta" | "visa" | "papa";

export function uniqueById(list: Transaction[]) {
  const map = new Map<string, Transaction>();
  for (const t of list) map.set(t.id, t);
  return [...map.values()];
}

export function cashMonthSpend(monthTx: Transaction[]) {
  return monthTx.filter((t) => t.type === "egreso" && isCashMethod(t.payment_method));
}

export function cashMonthMoves(monthTx: Transaction[]) {
  return monthTx.filter((t) => t.payment_method !== "tarjeta_credito");
}

export function originLabel(kind: OriginKind) {
  if (kind === "plata") return "Tu sueldo";
  if (kind === "visa") return "Tu Visa";
  if (kind === "papa") return "Visa de papá";
  return "Tarjeta";
}

export function categorySlug(name: string) {
  return encodeURIComponent(name);
}

export function cursorFromMes(mes: string | null | undefined) {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return undefined;
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function categoryFromSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export type CategoryOriginRow = {
  name: string;
  sueldo: number;
  visa: number;
  papa: number;
  total: number;
};

export function categoryOriginSplit(
  cashTx: Transaction[],
  cardTx: Transaction[],
  categories: Category[],
  mineId: string | null,
  papaId: string | null,
  toArs: (amount: number, currency: Transaction["currency"]) => number,
): CategoryOriginRow[] {
  const buckets: Record<string, CategoryOriginRow> = {};

  function row(name: string) {
    buckets[name] ??= { name, sueldo: 0, visa: 0, papa: 0, total: 0 };
    return buckets[name];
  }

  function catName(t: Transaction) {
    const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    return groupCategory(raw);
  }

  for (const t of cashTx) {
    const r = row(catName(t));
    r.sueldo += toArs(Number(t.amount), t.currency);
  }
  for (const t of cardTx.filter((x) => x.type === "egreso")) {
    const r = row(catName(t));
    const amount = toArs(Number(t.amount), t.currency);
    if (papaId && t.credit_card_id === papaId) r.papa += amount;
    else r.visa += amount;
  }
  return Object.values(buckets)
    .map((r) => ({ ...r, total: r.sueldo + r.visa + r.papa }))
    .sort((a, b) => b.total - a.total);
}

export function txsForCategory(
  name: string,
  cashTx: Transaction[],
  cardTx: Transaction[],
  categories: Category[],
) {
  const match = (t: Transaction) => {
    const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    return groupCategory(raw) === name;
  };
  return {
    sueldo: cashTx.filter(match),
    tarjeta: cardTx.filter((t) => t.type === "egreso" && match(t)),
  };
}

export function txsForOrigin(
  kind: OriginKind,
  cashMoves: Transaction[],
  cardTx: Transaction[],
  papaId: string | null,
) {
  if (kind === "plata") return cashMoves;
  const cards = cardTx.filter((t) => t.type === "egreso");
  if (kind === "visa") return cards.filter((t) => t.credit_card_id !== papaId);
  if (kind === "papa") return cards.filter((t) => t.credit_card_id === papaId);
  return cards;
}

export function cardOfTx(t: Transaction, cards: CreditCard[]) {
  return cards.find((c) => c.id === t.credit_card_id) ?? null;
}

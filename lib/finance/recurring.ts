import type { RecurringPayment, Transaction } from "@/lib/types";
import { inCurrentMonth } from "@/lib/finance/wallet";

const VIA_PREFIX = "via:";

function notesLines(notes: string | null | undefined) {
  return (notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function recurringVia(item: Pick<RecurringPayment, "notes">) {
  const line = notesLines(item.notes).find((l) => l.startsWith(VIA_PREFIX)) ?? "";
  const rest = line.slice(VIA_PREFIX.length);
  if (rest.startsWith("tarjeta")) {
    const cardId = rest.includes(":") ? rest.slice(rest.indexOf(":") + 1) || null : null;
    return { onCard: true as const, cardId };
  }
  return { onCard: false as const, cardId: null };
}

export function isCardRecurring(item: Pick<RecurringPayment, "notes">) {
  return recurringVia(item).onCard;
}

export function cleanConceptName(name: string) {
  return name.replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim();
}

export function findRecurringByName(list: RecurringPayment[], name: string) {
  const needle = norm(cleanConceptName(name));
  return list.find((r) => norm(r.name) === needle) ?? null;
}

export function withRecurringVia(notes: string | null | undefined, onCard: boolean, cardId?: string | null) {
  const extra = notesLines(notes).filter((l) => !l.startsWith(VIA_PREFIX));
  if (onCard) extra.unshift(cardId ? `via:tarjeta:${cardId}` : "via:tarjeta");
  return extra.length ? extra.join("\n") : null;
}

function norm(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cardCoversRecurring(
  item: RecurringPayment,
  transactions: Transaction[],
  ref = new Date(),
) {
  const via = recurringVia(item);
  if (!via.onCard) return false;
  const needle = norm(item.name);
  const words = needle.split(" ").filter((w) => w.length >= 4);
  return transactions.some((t) => {
    if (t.type !== "egreso" || t.payment_method !== "tarjeta_credito") return false;
    if (!inCurrentMonth(t.occurred_on, ref)) return false;
    if (via.cardId && t.credit_card_id && t.credit_card_id !== via.cardId) return false;
    const concept = norm(t.concept);
    if (concept.includes(needle) || needle.includes(concept)) return true;
    return words.some((w) => concept.includes(w));
  });
}

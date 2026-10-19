import type { RecurringPayment, Transaction } from "@/lib/types";
import { inCurrentMonth } from "@/lib/finance/wallet";

const VIA_PREFIX = "via:";
const SUB_PREFIX = "sub:";

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
  const extra = notesLines(notes).filter(
    (l) => !l.startsWith(VIA_PREFIX) && !l.toLowerCase().startsWith(SUB_PREFIX),
  );
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

export function chargeMatchesRecurring(
  item: Pick<RecurringPayment, "name">,
  tx: Pick<Transaction, "concept" | "type" | "payment_method">,
) {
  if (tx.type !== "egreso" || tx.payment_method !== "tarjeta_credito") return false;
  const needle = norm(cleanConceptName(item.name));
  const concept = norm(cleanConceptName(tx.concept));
  if (!needle || !concept) return false;
  if (concept === needle || concept.includes(needle) || needle.includes(concept)) return true;
  const words = needle.split(" ").filter((w) => w.length >= 4);
  return words.length > 0 && words.every((w) => concept.includes(w));
}

export function cardCoversRecurring(
  item: RecurringPayment,
  transactions: Transaction[],
  ref = new Date(),
) {
  const via = recurringVia(item);
  if (!via.onCard) return false;
  return transactions.some((t) => {
    if (!chargeMatchesRecurring(item, t)) return false;
    if (!inCurrentMonth(t.occurred_on, ref)) return false;
    if (via.cardId && t.credit_card_id && t.credit_card_id !== via.cardId) return false;
    return true;
  });
}

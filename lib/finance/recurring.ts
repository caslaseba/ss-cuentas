import type { RecurringPayment, Transaction } from "@/lib/types";
import { inCurrentMonth } from "@/lib/finance/wallet";

const VIA_PREFIX = "via:";
const SUB_PREFIX = "sub:";

export const SERVICE_SUBCATEGORIES = ["Suscripción", "Seguro", "Hogar", "Impuestos", "Otro"] as const;
export type ServiceSubcategory = (typeof SERVICE_SUBCATEGORIES)[number];

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

function mentions(name: string, words: string[]) {
  const tokens = norm(name).split(" ").filter(Boolean);
  return words.some((word) => tokens.some((token) => (word.length <= 4 ? token === word : token.startsWith(word))));
}

export function guessServiceSubcategory(name: string): ServiceSubcategory {
  if (mentions(name, ["seguro", "osde", "swiss", "galeno", "medicus", "sancor", "prevencion"])) return "Seguro";
  if (mentions(name, ["impuesto", "abl", "arba", "afip", "monotributo", "patente", "municipal"])) return "Impuestos";
  if (mentions(name, ["luz", "gas", "agua", "edenor", "edesur", "metrogas", "aysa", "expensa", "edea", "naturgy", "internet", "wifi", "fibra", "telefono", "celular"])) {
    return "Hogar";
  }
  if (mentions(name, ["netflix", "youtube", "spotify", "disney", "prime", "hbo", "suscrip", "apple", "icloud", "google", "paramount", "flow", "directv", "twitch"])) {
    return "Suscripción";
  }
  return "Otro";
}

export function recurringSubcategory(item: Pick<RecurringPayment, "notes" | "name">): ServiceSubcategory {
  const line = notesLines(item.notes).find((l) => l.toLowerCase().startsWith(SUB_PREFIX));
  if (line) {
    const raw = norm(line.slice(SUB_PREFIX.length));
    const found = SERVICE_SUBCATEGORIES.find((sub) => norm(sub) === raw);
    if (found) return found;
  }
  return guessServiceSubcategory(item.name);
}

export function withRecurringSub(notes: string | null | undefined, sub: string) {
  const extra = notesLines(notes).filter((l) => !l.toLowerCase().startsWith(SUB_PREFIX));
  const found = SERVICE_SUBCATEGORIES.find((item) => norm(item) === norm(sub)) ?? "Otro";
  extra.push(`${SUB_PREFIX}${found}`);
  return extra.join("\n");
}

export function servicesBySubcategory(items: RecurringPayment[]) {
  const groups = new Map<ServiceSubcategory, RecurringPayment[]>();
  for (const item of items) {
    const sub = recurringSubcategory(item);
    const list = groups.get(sub) ?? [];
    list.push(item);
    groups.set(sub, list);
  }
  return SERVICE_SUBCATEGORIES.filter((sub) => groups.has(sub)).map((sub) => ({
    sub,
    items: (groups.get(sub) ?? []).sort((a, b) => a.name.localeCompare(b.name, "es")),
  }));
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

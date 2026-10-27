import type { CreditCard, Transaction } from "@/lib/types";

export const MY_CARD_NAME = "Visa ICBC";
export const DAD_CARD_NAME = "Visa ICBC Papá";
export const MASTERCARD_NAME = "MasterCard ICBC";

function norm(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isPapaCard(card: Pick<CreditCard, "name" | "kind">) {
  return card.kind === "extension" && /papa/.test(norm(card.name));
}

/** La Visa de Seba. No es la MasterCard ni la extensión. */
export function isVisaMine(card: Pick<CreditCard, "name" | "kind">) {
  if (card.kind !== "principal") return false;
  const name = norm(card.name);
  if (/papa/.test(name) || /master/.test(name)) return false;
  return name === norm(MY_CARD_NAME) || (name.includes("visa") && name.includes("icbc"));
}

export function cardChoiceLabel(card: Pick<CreditCard, "name" | "kind">) {
  if (isVisaMine(card)) return "Visa mía";
  if (isPapaCard(card)) return "Extensión de papá";
  return card.name;
}

export function householdCards(cards: CreditCard[], transactions: Transaction[] = []) {
  const principals = cards.filter((c) => c.kind === "principal");
  const ranked = principals
    .map((card) => {
      const n = norm(card.name);
      return {
        card,
        named: n === norm(MY_CARD_NAME) || (n.includes("visa") && n.includes("icbc") && !/papa/.test(n)),
        spend: transactions.filter((t) => t.credit_card_id === card.id).length,
        visa: /visa/.test(n),
      };
    })
    .sort((a, b) => b.spend - a.spend || Number(b.named) - Number(a.named) || Number(b.visa) - Number(a.visa));

  const mine =
    cards.find((card) => isVisaMine(card)) ??
    ranked.find((row) => !/master/.test(norm(row.card.name)))?.card ??
    null;
  const papa =
    (mine
      ? cards.find((c) => c.parent_card_id === mine.id && isPapaCard(c))
      : null) ??
    cards.find((c) => isPapaCard(c)) ??
    null;

  const extras = cards
    .filter((card) => card.id !== mine?.id && card.id !== papa?.id)
    .filter((card) => card.kind === "principal" || (mine != null && card.parent_card_id === mine.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const visible = [mine, papa, ...extras].filter((c): c is CreditCard => Boolean(c));
  return { mine, papa, visible };
}

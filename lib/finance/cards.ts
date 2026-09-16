import type { CreditCard, Transaction } from "@/lib/types";

export const MY_CARD_NAME = "Visa ICBC";
export const DAD_CARD_NAME = "Visa ICBC Papá";

function norm(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isPapaCard(card: Pick<CreditCard, "name" | "kind">) {
  return card.kind === "extension" && /papa/.test(norm(card.name));
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

  const mine = ranked[0]?.card ?? null;
  const papa =
    (mine
      ? cards.find((c) => c.parent_card_id === mine.id && isPapaCard(c))
      : null) ??
    cards.find((c) => isPapaCard(c)) ??
    null;

  const visible = [mine, papa].filter((c): c is CreditCard => Boolean(c));
  return { mine, papa, visible };
}

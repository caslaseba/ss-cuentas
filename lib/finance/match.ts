import type { Category, CreditCard, PaymentMethod } from "@/lib/types";

export const CATEGORY_KEYWORDS: { name: string; type: "ingreso" | "egreso"; words: string[] }[] = [
  { name: "Sueldo", type: "ingreso", words: ["sueldo", "salario", "cobre", "me pagaron", "deposito"] },
  { name: "Alimentación", type: "egreso", words: ["milanesa", "asado", "carne", "comida", "almuerzo", "cena", "pan", "verdura", "pizza", "empanada", "pollo", "fideos", "fruta"] },
  { name: "Supermercado", type: "egreso", words: ["super", "supermercado", "coto", "carrefour", "chino"] },
  { name: "Cigarrillos", type: "egreso", words: ["cigarrillo", "cigarrillos", "pucho", "puchos", "tabaco"] },
  { name: "Servicios", type: "egreso", words: ["luz", "gas", "agua", "internet", "wifi", "telefono", "expensas", "abl", "edesen", "metrogas"] },
  { name: "Transporte", type: "egreso", words: ["nafta", "uber", "taxi", "subte", "colectivo", "peaje"] },
  { name: "Ocio", type: "egreso", words: ["cine", "salida", "bar", "birra", "juego"] },
  { name: "Suscripciones", type: "egreso", words: ["netflix", "spotify", "youtube", "disney", "max"] },
];

export function guessCategoryName(text: string, type: "ingreso" | "egreso"): string | null {
  const hay = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const row of CATEGORY_KEYWORDS) {
    if (row.type !== type) continue;
    if (row.words.some((w) => hay.includes(w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      return row.name;
    }
  }
  return type === "ingreso" ? "Sueldo" : null;
}

export function matchCategory(
  categories: Category[],
  type: "ingreso" | "egreso",
  concept: string,
  hint?: string | null,
) {
  const wanted = (hint || guessCategoryName(concept, type) || "").toLowerCase();
  if (!wanted) return categories.find((c) => c.type === type && c.name === "Otros egresos") ?? null;
  return (
    categories.find((c) => c.type === type && c.name.toLowerCase() === wanted) ||
    categories.find((c) => c.type === type && wanted.includes(c.name.toLowerCase().slice(0, 5))) ||
    null
  );
}

export function matchCard(cards: CreditCard[], nameHint?: string | null, kindHint?: "principal" | "extension" | null) {
  const papa = cards.find((c) => {
    const n = c.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /papa/.test(n);
  });
  if (kindHint === "extension" && papa) return papa;
  if (nameHint && /papa|papi|extension|adicional/.test(nameHint.toLowerCase()) && papa) return papa;
  if (nameHint) {
    const needle = nameHint.toLowerCase();
    const byName = cards.find((c) => c.name.toLowerCase().includes(needle));
    if (byName) return byName;
  }
  if (kindHint) {
    const byKind = cards.find((c) => c.kind === kindHint);
    if (byKind) return byKind;
  }
  return cards.find((c) => c.kind === "principal") ?? cards[0] ?? null;
}

export function isCashMethod(method: PaymentMethod) {
  return method !== "tarjeta_credito";
}

export function categoryLabel(name: string) {
  if (name === "Alimentación") return "Comida";
  if (name === "Supermercado") return "Comida";
  return name;
}

export function paymentMethodLabel(method: PaymentMethod) {
  if (method === "efectivo") return "Efectivo";
  if (method === "debito") return "Débito";
  if (method === "transferencia") return "Transferencia";
  if (method === "billetera") return "Mercado Pago";
  return "Tarjeta";
}

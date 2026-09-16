import { categoryLabel } from "@/lib/finance/match";
import type { Category, PaymentMethod, Transaction } from "@/lib/types";

export function groupCategory(name: string | null | undefined) {
  const raw = (name ?? "Otros").trim() || "Otros";
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (n.includes("aliment") || n.includes("comida") || n.includes("super")) return "Comida";
  if (n.includes("ocio") || n.includes("entreten")) return "Ocio";
  if (n.includes("servicio") || n.includes("suscrip")) return "Servicios";
  if (n.includes("transporte")) return "Transporte";
  if (n.includes("cigarrillo")) return "Cigarrillos";
  if (n.includes("sueldo") || n.includes("freelance")) return "Ingresos";
  return categoryLabel(raw);
}

export function categoryChipClass(group: string) {
  if (group === "Comida") return "bg-orange-500/15 text-orange-800 border-orange-500/30";
  if (group === "Ocio") return "bg-fuchsia-500/15 text-fuchsia-800 border-fuchsia-500/30";
  if (group === "Servicios") return "bg-teal-500/15 text-teal-800 border-teal-500/30";
  if (group === "Transporte") return "bg-lime-500/15 text-lime-800 border-lime-500/30";
  if (group === "Cigarrillos") return "bg-stone-500/20 text-stone-800 border-stone-500/30";
  if (group === "Ingresos") return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export function methodChipClass(method: PaymentMethod, type: Transaction["type"] = "egreso") {
  if (type === "ingreso") return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30";
  if (method === "tarjeta_credito") return "bg-violet-500/15 text-violet-800 border-violet-500/30";
  if (method === "billetera") return "bg-sky-500/15 text-sky-800 border-sky-500/30";
  if (method === "debito") return "bg-cyan-500/15 text-cyan-800 border-cyan-500/30";
  if (method === "transferencia") return "bg-indigo-500/15 text-indigo-800 border-indigo-500/30";
  return "bg-amber-500/15 text-amber-800 border-amber-500/30";
}

export function movementRowClass(tx: Transaction) {
  if (tx.type === "ingreso") return "border-emerald-500/25 bg-emerald-500/10";
  if (tx.payment_method === "tarjeta_credito") return "border-violet-500/25 bg-violet-500/10";
  if (tx.payment_method === "billetera") return "border-sky-500/25 bg-sky-500/10";
  return "border-amber-500/25 bg-amber-500/10";
}

export function movementAmountClass(tx: Transaction) {
  if (tx.type === "ingreso") return "text-emerald-700";
  if (tx.payment_method === "tarjeta_credito") return "text-violet-800";
  if (tx.payment_method === "billetera") return "text-sky-800";
  return "text-amber-800";
}

export function methodBarClass(name: string) {
  if (name === "Tarjeta") return "bg-violet-500";
  if (name === "Mercado Pago") return "bg-sky-500";
  if (name === "Efectivo") return "bg-amber-500";
  if (name === "Débito") return "bg-cyan-500";
  return "bg-indigo-500";
}

export function methodBoxClass(name: string) {
  if (name === "Tarjeta") return "border-violet-500/30 bg-violet-500/10";
  if (name === "Mercado Pago") return "border-sky-500/30 bg-sky-500/10";
  if (name === "Efectivo") return "border-amber-500/30 bg-amber-500/10";
  if (name === "Débito") return "border-cyan-500/30 bg-cyan-500/10";
  return "border-indigo-500/30 bg-indigo-500/10";
}

export function categoryTotals(
  txs: Transaction[],
  categories: Category[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
) {
  const buckets: Record<string, number> = {};
  for (const t of txs.filter((x) => x.type === "egreso")) {
    const name = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    buckets[name] = (buckets[name] ?? 0) + toArs(Number(t.amount), t.currency);
  }
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));
}

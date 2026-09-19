import { categoryLabel } from "@/lib/finance/match";
import type { Category, PaymentMethod, Transaction } from "@/lib/types";

export function groupCategory(name: string | null | undefined) {
  const raw = (name ?? "Otros").trim() || "Otros";
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (n.includes("aliment") || n.includes("comida")) return "Comida";
  if (n.includes("super")) return "Supermercado";
  if (n.includes("ocio") || n.includes("entreten")) return "Ocio";
  if (n.includes("servicio") || n.includes("suscrip")) return "Servicios";
  if (n.includes("transporte")) return "Transporte";
  if (n.includes("cigarrillo")) return "Cigarrillos";
  if (n.includes("sueldo") || n.includes("freelance")) return "Ingresos";
  return categoryLabel(raw);
}

export function categoryChipClass(group: string) {
  if (group === "Comida") {
    return "bg-orange-500/15 text-orange-900 border-orange-500/30 dark:bg-orange-500/20 dark:text-orange-100 dark:border-orange-300/40";
  }
  if (group === "Supermercado") {
    return "bg-yellow-500/20 text-yellow-950 border-yellow-500/40 dark:bg-yellow-400/20 dark:text-yellow-50 dark:border-yellow-200/50";
  }
  if (group === "Ocio") {
    return "bg-fuchsia-500/15 text-fuchsia-900 border-fuchsia-500/30 dark:bg-fuchsia-500/20 dark:text-fuchsia-100 dark:border-fuchsia-300/40";
  }
  if (group === "Servicios") {
    return "bg-teal-500/15 text-teal-900 border-teal-500/30 dark:bg-teal-500/20 dark:text-teal-100 dark:border-teal-300/40";
  }
  if (group === "Transporte") {
    return "bg-lime-500/15 text-lime-900 border-lime-500/30 dark:bg-lime-500/20 dark:text-lime-100 dark:border-lime-300/40";
  }
  if (group === "Cigarrillos") {
    return "bg-rose-500/20 text-rose-950 border-rose-500/40 dark:bg-rose-400/25 dark:text-rose-50 dark:border-rose-200/50";
  }
  if (group === "Ingresos") {
    return "bg-emerald-500/15 text-emerald-900 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-300/40";
  }
  return "bg-muted text-foreground border-border";
}

export function methodChipClass(method: PaymentMethod, type: Transaction["type"] = "egreso") {
  if (type === "ingreso") {
    return "bg-emerald-500/15 text-emerald-900 border-emerald-500/30 dark:text-emerald-100 dark:border-emerald-300/40";
  }
  if (method === "tarjeta_credito") {
    return "bg-violet-500/15 text-violet-900 border-violet-500/30 dark:text-violet-100 dark:border-violet-300/40";
  }
  if (method === "debito") {
    return "bg-cyan-500/15 text-cyan-900 border-cyan-500/30 dark:text-cyan-100 dark:border-cyan-300/40";
  }
  if (method === "transferencia" || method === "billetera" || method === "efectivo") {
    return "bg-indigo-500/15 text-indigo-900 border-indigo-500/30 dark:text-indigo-100 dark:border-indigo-300/40";
  }
  return "bg-amber-500/15 text-amber-900 border-amber-500/30 dark:text-amber-100 dark:border-amber-300/40";
}

export function movementAmountClass(tx: Transaction) {
  if (tx.type === "ingreso") return "text-emerald-800 dark:text-emerald-300";
  if (tx.payment_method === "tarjeta_credito") return "text-violet-800 dark:text-violet-200";
  if (tx.payment_method === "billetera" || tx.payment_method === "transferencia") return "text-indigo-800 dark:text-indigo-200";
  return "text-amber-800 dark:text-amber-200";
}

export function movementRowClass(tx: Transaction) {
  if (tx.type === "ingreso") return "border-emerald-500/25 bg-emerald-500/10";
  if (tx.payment_method === "tarjeta_credito") return "border-violet-500/25 bg-violet-500/10";
  if (tx.payment_method === "billetera" || tx.payment_method === "transferencia") return "border-indigo-500/25 bg-indigo-500/10";
  return "border-amber-500/25 bg-amber-500/10";
}

export function methodBarClass(name: string) {
  if (name === "Tarjeta") return "bg-violet-500";
  if (name === "Mercado Pago") return "bg-sky-500";
  if (name === "Efectivo") return "bg-amber-500";
  if (name === "Débito") return "bg-cyan-500";
  return "bg-indigo-500";
}

export function methodBoxClass(name: string) {
  if (name === "Tarjeta") return "border-violet-500/30 bg-violet-500/15 text-violet-950 dark:text-violet-100";
  if (name === "Mercado Pago") return "border-sky-500/30 bg-sky-500/15 text-sky-950 dark:text-sky-100";
  if (name === "Efectivo") return "border-amber-500/30 bg-amber-500/15 text-amber-950 dark:text-amber-100";
  if (name === "Débito") return "border-cyan-500/30 bg-cyan-500/15 text-cyan-950 dark:text-cyan-100";
  return "border-indigo-500/30 bg-indigo-500/15 text-indigo-950 dark:text-indigo-100";
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

export function methodBucketName(method: PaymentMethod) {
  if (method === "billetera") return "Transferencia";
  if (method === "tarjeta_credito") return "Tarjeta";
  if (method === "debito") return "Débito";
  return "Transferencia";
}

export function groupedCategorySplit(
  txs: Transaction[],
  categories: Category[],
  toArs: (amount: number, currency: Transaction["currency"]) => number,
) {
  const buckets: Record<string, Record<string, number>> = {};
  for (const t of txs.filter((x) => x.type === "egreso")) {
    const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
    const cat = groupCategory(raw);
    const method = methodBucketName(t.payment_method);
    buckets[cat] ??= {};
    buckets[cat][method] = (buckets[cat][method] ?? 0) + toArs(Number(t.amount), t.currency);
  }
  return Object.entries(buckets)
    .map(([name, parts]) => {
      const split = Object.entries(parts)
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount);
      const total = split.reduce((s, p) => s + p.amount, 0);
      return { name, total, split };
    })
    .sort((a, b) => b.total - a.total);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { clearFinanceSnapshot } from "@/lib/offline/snapshot";
import { clearOutbox } from "@/lib/offline/sync";

const DEFAULT_CATEGORIES: { name: string; type: "ingreso" | "egreso"; icon: string }[] = [
  { name: "Sueldo", type: "ingreso", icon: "wallet" },
  { name: "Transferencia", type: "ingreso", icon: "arrow-left-right" },
  { name: "Freelance", type: "ingreso", icon: "briefcase" },
  { name: "Inversiones", type: "ingreso", icon: "trending-up" },
  { name: "Otros ingresos", type: "ingreso", icon: "plus-circle" },
  { name: "Alimentación", type: "egreso", icon: "utensils" },
  { name: "Supermercado", type: "egreso", icon: "shopping-cart" },
  { name: "Transporte", type: "egreso", icon: "car" },
  { name: "Vivienda", type: "egreso", icon: "home" },
  { name: "Servicios", type: "egreso", icon: "zap" },
  { name: "Suscripciones", type: "egreso", icon: "repeat" },
  { name: "Salud", type: "egreso", icon: "heart-pulse" },
  { name: "Educación", type: "egreso", icon: "graduation-cap" },
  { name: "Ocio", type: "egreso", icon: "clapperboard" },
  { name: "Ropa", type: "egreso", icon: "shirt" },
  { name: "Tecnología", type: "egreso", icon: "smartphone" },
  { name: "Impuestos", type: "egreso", icon: "receipt" },
  { name: "Transferencias", type: "egreso", icon: "arrow-left-right" },
  { name: "Cigarrillos", type: "egreso", icon: "cigarette" },
  { name: "Otros egresos", type: "egreso", icon: "circle-dot" },
];

async function removeRows(supabase: SupabaseClient, table: string, userId: string, extra?: { column: string; value: string }) {
  let query = supabase.from(table).delete().eq("user_id", userId);
  if (extra) query = query.eq(extra.column, extra.value);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** Borra movimientos, tarjetas, saldos y categorías de esta cuenta. No toca el usuario ni otras cuentas. */
export async function resetOwnFinance(supabase: SupabaseClient, userId: string) {
  await clearOutbox();
  clearFinanceSnapshot();

  await removeRows(supabase, "transactions", userId);
  await removeRows(supabase, "installments", userId);
  await removeRows(supabase, "recurring_payments", userId);
  await removeRows(supabase, "sync_queue", userId);
  await removeRows(supabase, "credit_cards", userId, { column: "kind", value: "extension" });
  await removeRows(supabase, "credit_cards", userId);
  await removeRows(supabase, "accounts", userId);
  await removeRows(supabase, "categories", userId);

  const { error } = await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((row) => ({
      user_id: userId,
      name: row.name,
      type: row.type,
      icon: row.icon,
      is_default: true,
    })),
  );
  if (error) throw new Error(error.message);
}

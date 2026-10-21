import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertMonthClose, type CardMonthClose } from "@/lib/finance/close-cycle";

const KIND = "ss-cuentas-month-closes";

type QueueRow = { id: string; payload: { kind?: string; closes?: unknown } | null };

function asCloses(value: unknown): CardMonthClose[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as CardMonthClose;
    if (typeof row.cardId !== "string" || !/^\d{4}-\d{2}$/.test(row.month) || !/^\d{4}-\d{2}-\d{2}$/.test(row.closingOn)) {
      return [];
    }
    return [row];
  });
}

async function readTable(supabase: SupabaseClient): Promise<CardMonthClose[] | null> {
  const { data, error } = await supabase.from("card_month_closes").select("credit_card_id, month_key, closing_on");
  if (error) return null;
  return (data ?? []).map((row) => ({
    cardId: String(row.credit_card_id),
    month: String(row.month_key),
    closingOn: String(row.closing_on).slice(0, 10),
  }));
}

async function readQueue(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("sync_queue").select("id, payload").eq("user_id", userId);
  if (error || !data) return [];
  const row = (data as QueueRow[]).find((item) => item.payload?.kind === KIND);
  return asCloses(row?.payload?.closes);
}

export async function loadMonthCloses(supabase: SupabaseClient, userId: string) {
  const [table, queued] = await Promise.all([readTable(supabase), readQueue(supabase, userId)]);
  if (table && table.length) return table;
  if (queued.length) return queued;
  return table ?? [];
}

async function writeQueue(supabase: SupabaseClient, userId: string, closes: CardMonthClose[]) {
  const { data, error } = await supabase.from("sync_queue").select("id, payload").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const row = (data as QueueRow[] | null)?.find((item) => item.payload?.kind === KIND);
  const payload = { kind: KIND, closes };
  if (row) {
    const updated = await supabase.from("sync_queue").update({ payload }).eq("id", row.id);
    if (updated.error) throw new Error(updated.error.message);
    return;
  }
  const inserted = await supabase.from("sync_queue").insert({ user_id: userId, payload });
  if (inserted.error) throw new Error(inserted.error.message);
}

async function writeTable(supabase: SupabaseClient, userId: string, closes: CardMonthClose[]) {
  const probe = await supabase.from("card_month_closes").select("id").limit(1);
  if (probe.error) return;
  for (const item of closes) {
    const saved = await supabase.from("card_month_closes").upsert(
      {
        user_id: userId,
        credit_card_id: item.cardId,
        month_key: item.month,
        closing_on: item.closingOn,
      },
      { onConflict: "credit_card_id,month_key" },
    );
    if (saved.error) return;
  }
}

export async function persistMonthCloses(supabase: SupabaseClient, userId: string, closes: CardMonthClose[]) {
  await writeQueue(supabase, userId, closes);
  await writeTable(supabase, userId, closes);
}

export function withMonthClose(list: CardMonthClose[], next: CardMonthClose) {
  return upsertMonthClose(list, next);
}

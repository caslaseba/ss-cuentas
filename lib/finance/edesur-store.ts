import type { SupabaseClient } from "@supabase/supabase-js";
import type { EdesurMonth } from "@/lib/finance/edesur";

const KIND = "ss-cuentas-edesur-months";

function readingOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function stampOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type QueueRow = { id: string; payload: { kind?: string; months?: unknown } | null };

function asMonths(value: unknown): EdesurMonth[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as EdesurMonth;
    if (!/^\d{4}-\d{2}$/.test(row.month)) return [];
    const totalKwh = Number(row.totalKwh);
    const totalBill = Number(row.totalBill);
    const mineKwh = Number(row.mineKwh);
    const brotherKwh = Number(row.brotherKwh);
    const brother2Kwh = Number(row.brother2Kwh ?? 0);
    if (![totalKwh, totalBill, mineKwh, brotherKwh, brother2Kwh].every((n) => Number.isFinite(n) && n >= 0)) return [];
    return [{
      month: row.month,
      totalKwh,
      totalBill,
      mineKwh,
      brotherKwh,
      brother2Kwh,
      brotherReading: readingOf(row.brotherReading),
      brotherReadAt: stampOf(row.brotherReadAt),
      brother2Reading: readingOf(row.brother2Reading),
      brother2ReadAt: stampOf(row.brother2ReadAt),
      mineReading: readingOf(row.mineReading),
      mineReadAt: stampOf(row.mineReadAt),
    }];
  });
}

async function readTable(supabase: SupabaseClient): Promise<EdesurMonth[] | null> {
  const { data, error } = await supabase
    .from("edesur_months")
    .select("month_key, total_kwh, total_bill, mine_kwh, brother_kwh, brother_kwh_2, brother_reading, brother_read_at, brother2_reading, brother2_read_at, mine_reading, mine_read_at");
  if (error) return null;
  return asMonths(
    (data ?? []).map((row) => ({
      month: String(row.month_key),
      totalKwh: row.total_kwh,
      totalBill: row.total_bill,
      mineKwh: row.mine_kwh,
      brotherKwh: row.brother_kwh,
      brother2Kwh: row.brother_kwh_2,
      brotherReading: row.brother_reading,
      brotherReadAt: row.brother_read_at,
      brother2Reading: row.brother2_reading,
      brother2ReadAt: row.brother2_read_at,
      mineReading: row.mine_reading,
      mineReadAt: row.mine_read_at,
    })),
  );
}

async function readQueue(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("sync_queue").select("id, payload").eq("user_id", userId);
  if (error || !data) return [];
  const row = (data as QueueRow[]).find((item) => item.payload?.kind === KIND);
  return asMonths(row?.payload?.months);
}

export async function loadEdesurMonths(supabase: SupabaseClient, userId: string) {
  const [table, queued] = await Promise.all([readTable(supabase), readQueue(supabase, userId)]);
  if (table && table.length) return table;
  if (queued.length) return queued;
  return table ?? [];
}

async function writeQueue(supabase: SupabaseClient, userId: string, months: EdesurMonth[]) {
  const { data, error } = await supabase.from("sync_queue").select("id, payload").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const row = (data as QueueRow[] | null)?.find((item) => item.payload?.kind === KIND);
  const payload = { kind: KIND, months };
  if (row) {
    const updated = await supabase.from("sync_queue").update({ payload }).eq("id", row.id);
    if (updated.error) throw new Error(updated.error.message);
    return;
  }
  const inserted = await supabase.from("sync_queue").insert({ user_id: userId, payload });
  if (inserted.error) throw new Error(inserted.error.message);
}

async function writeTable(supabase: SupabaseClient, userId: string, months: EdesurMonth[]) {
  const probe = await supabase.from("edesur_months").select("id").limit(1);
  if (probe.error) return;
  for (const item of months) {
    const saved = await supabase.from("edesur_months").upsert(
      {
        user_id: userId,
        month_key: item.month,
        total_kwh: item.totalKwh,
        total_bill: item.totalBill,
        mine_kwh: item.mineKwh,
        brother_kwh: item.brotherKwh,
        brother_kwh_2: item.brother2Kwh,
        brother_reading: item.brotherReading,
        brother_read_at: item.brotherReadAt,
        brother2_reading: item.brother2Reading,
        brother2_read_at: item.brother2ReadAt,
        mine_reading: item.mineReading,
        mine_read_at: item.mineReadAt,
      },
      { onConflict: "user_id,month_key" },
    );
    if (saved.error) return;
  }
}

export async function persistEdesurMonths(supabase: SupabaseClient, userId: string, months: EdesurMonth[]) {
  await writeQueue(supabase, userId, months);
  await writeTable(supabase, userId, months);
}

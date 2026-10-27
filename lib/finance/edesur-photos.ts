import type { SupabaseClient } from "@supabase/supabase-js";
import type { EdesurPhoto, EdesurPhotoLabel } from "@/lib/finance/edesur";

export const EDESUR_METER_BUCKET = "edesur-meters";

function asLabel(value: unknown): EdesurPhotoLabel | null {
  return value === "mio" || value === "hermano" || value === "factura" ? value : null;
}

export function asEdesurPhotos(value: unknown): EdesurPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as EdesurPhoto;
    const label = asLabel(row.label);
    if (!label || !/^\d{4}-\d{2}$/.test(row.month) || typeof row.path !== "string" || typeof row.id !== "string") {
      return [];
    }
    return [{ id: row.id, month: row.month, label, path: row.path, createdAt: String(row.createdAt ?? "") }];
  });
}

export async function loadEdesurPhotos(supabase: SupabaseClient): Promise<EdesurPhoto[] | null> {
  const { data, error } = await supabase
    .from("edesur_meter_photos")
    .select("id, month_key, storage_path, label, created_at")
    .order("created_at", { ascending: true });
  if (error) return null;
  return asEdesurPhotos(
    (data ?? []).map((row) => ({
      id: String(row.id),
      month: String(row.month_key),
      label: row.label,
      path: String(row.storage_path),
      createdAt: String(row.created_at ?? ""),
    })),
  );
}

export async function signEdesurPhoto(supabase: SupabaseClient, path: string) {
  const signed = await supabase.storage.from(EDESUR_METER_BUCKET).createSignedUrl(path, 60 * 60 * 12);
  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}

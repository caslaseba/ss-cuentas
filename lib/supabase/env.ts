/** Project URL only: https://xxxx.supabase.co — never /rest/v1 or /auth/v1. */
export function normalizeSupabaseUrl(raw?: string | null) {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, "").replace(/\r/g, "") ?? "";
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/+$/, "").replace(/\/(rest|auth|storage|functions)\/v1$/i, "");
  }
}

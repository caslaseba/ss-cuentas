import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { LOCAL_USER_ID } from "@/lib/finance/local-books";
import { asRecord, hasServiceRoleKey, supabaseHttps } from "@/lib/supabase/https";

export type AdminSession = {
  id: string;
  email: string;
};

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(): Promise<
  | { ok: true; user: AdminSession; hasServiceRole: boolean }
  | { ok: false; status: number; error: string }
> {
  if (!hasSupabaseConfig()) {
    return {
      ok: true,
      user: { id: LOCAL_USER_ID, email: "sebastian@local" },
      hasServiceRole: false,
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, status: 401, error: "Tenés que iniciar sesión." };
  }

  const hasServiceRole = hasServiceRoleKey();
  const emails = adminEmails();
  let allowed = emails.includes(user.email.toLowerCase());

  if (!allowed) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    allowed = data?.role === "admin";
  }

  if (!allowed && hasServiceRole) {
    try {
      const { status, json } = await supabaseHttps({
        pathname: "/auth/v1/admin/users?page=1&per_page=2",
        method: "GET",
        key: "service",
      });
      const users = asRecord(json).users;
      const count = Array.isArray(users) ? users.length : 0;
      if (status < 400 && count <= 1) allowed = true;
    } catch {
      allowed = false;
    }
  }

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: "Solo un administrador puede gestionar usuarios. Agregá tu email en ADMIN_EMAILS.",
    };
  }

  return { ok: true, user: { id: user.id, email: user.email }, hasServiceRole };
}

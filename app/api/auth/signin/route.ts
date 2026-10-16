import { type NextRequest } from "next/server";
import { signinWithPassword } from "@/lib/supabase/auth-http";
import { errorMessage } from "@/lib/supabase/https";
import { bindAuthResponse, friendlyAuthError } from "@/lib/supabase/route-session";

export const runtime = "nodejs";

function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }
  return value;
}

export async function POST(request: NextRequest) {
  let auth: ReturnType<typeof bindAuthResponse>;
  try {
    auth = bindAuthResponse(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Falta la configuración de Supabase." },
      { status: 500 },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  const formPost =
    contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");

  function fail(message: string, status: number) {
    if (formPost) return auth.redirect("/login", { error: message });
    return auth.json({ error: message }, status);
  }

  try {
    let email = "";
    let password = "";
    let next = "/dashboard";
    if (formPost) {
      const form = await request.formData();
      email = String(form.get("email") || "").trim();
      password = String(form.get("password") || "");
      next = safeNext(String(form.get("next") || ""));
    } else {
      const body = (await request.json()) as { email?: string; password?: string };
      email = body.email?.trim() ?? "";
      password = body.password ?? "";
    }

    if (!email || !password) {
      return fail("Completá email y contraseña.", 400);
    }

    const { status, json } = await signinWithPassword({ email, password });

    if (status >= 400) {
      return fail(friendlyAuthError(errorMessage(json, "No se pudo ingresar.")), status);
    }

    const access_token = json.access_token;
    const refresh_token = json.refresh_token;
    if (typeof access_token !== "string" || typeof refresh_token !== "string") {
      return fail("Supabase no devolvió sesión. Si Confirm email está activo, confirmá el correo.", 401);
    }

    const { error } = await auth.supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      return fail(friendlyAuthError(error.message), 401);
    }

    if (formPost) return auth.redirect(next);
    return auth.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red hacia Supabase.";
    return fail(friendlyAuthError(`Error de red hacia Supabase: ${message}`), 500);
  }
}

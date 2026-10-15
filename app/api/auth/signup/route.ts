import { type NextRequest } from "next/server";
import { signupWithPassword } from "@/lib/supabase/auth-http";
import { errorMessage } from "@/lib/supabase/https";
import { bindAuthResponse, friendlyAuthError } from "@/lib/supabase/route-session";

export const runtime = "nodejs";

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

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() ?? "";

    if (!email || !password || password.length < 6) {
      return auth.json({ error: "Completá email y una contraseña de al menos 6 caracteres." }, 400);
    }

    const { status, json } = await signupWithPassword({ email, password, fullName });

    if (status >= 400) {
      return auth.json({ error: friendlyAuthError(errorMessage(json, "No se pudo crear la cuenta.")) }, status);
    }

    const access_token = json.access_token;
    const refresh_token = json.refresh_token;
    if (typeof access_token === "string" && typeof refresh_token === "string") {
      const { error } = await auth.supabase.auth.setSession({ access_token, refresh_token });
      if (error) return auth.json({ error: friendlyAuthError(error.message) }, 401);
      return auth.json({ ok: true });
    }

    return auth.json({ needsConfirm: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red hacia Supabase.";
    return auth.json({ error: friendlyAuthError(`Error de red hacia Supabase: ${message}`) }, 500);
  }
}

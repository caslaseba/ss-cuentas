import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signinWithPassword } from "@/lib/supabase/auth-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Completá email y contraseña." }, { status: 400 });
    }

    const { status, json } = await signinWithPassword({ email, password });

    if (status >= 400) {
      const message =
        (typeof json.msg === "string" && json.msg) ||
        (typeof json.message === "string" && json.message) ||
        (typeof json.error_description === "string" && json.error_description) ||
        "No se pudo ingresar.";
      return NextResponse.json({ error: message }, { status });
    }

    const access_token = json.access_token;
    const refresh_token = json.refresh_token;
    if (typeof access_token !== "string" || typeof refresh_token !== "string") {
      return NextResponse.json(
        { error: "Supabase no devolvió sesión. Si Confirm email está activo, confirmá el correo." },
        { status: 401 },
      );
    }

    const supabase = await createClient();
    await supabase.auth.setSession({ access_token, refresh_token });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Error de red hacia Supabase: ${err.message}`
            : "Error de red hacia Supabase.",
      },
      { status: 500 },
    );
  }
}

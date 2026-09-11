import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signupWithPassword } from "@/lib/supabase/auth-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
      return NextResponse.json(
        { error: "Completá email y una contraseña de al menos 6 caracteres." },
        { status: 400 },
      );
    }

    const { status, json } = await signupWithPassword({ email, password, fullName });

    if (status >= 400) {
      const message =
        (typeof json.msg === "string" && json.msg) ||
        (typeof json.message === "string" && json.message) ||
        (typeof json.error_description === "string" && json.error_description) ||
        "No se pudo crear la cuenta.";
      return NextResponse.json({ error: message }, { status });
    }

    const session = json as {
      access_token?: string;
      refresh_token?: string;
    };

    if (session.access_token && session.refresh_token) {
      const supabase = await createClient();
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ needsConfirm: true });
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

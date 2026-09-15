import { NextResponse } from "next/server";
import { asRecord, errorMessage, supabaseHttps } from "@/lib/supabase/https";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim() ?? "";
    if (!email) {
      return NextResponse.json({ error: "Completá el email." }, { status: 400 });
    }

    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const redirectTo = `${origin}/recuperar`;

    const { status, json } = await supabaseHttps({
      pathname: "/auth/v1/recover",
      method: "POST",
      body: { email },
      extraHeaders: { "Redirect-To": redirectTo },
    });

    if (status >= 400) {
      return NextResponse.json(
        { error: errorMessage(json, "No se pudo enviar el correo de recuperación.") },
        { status },
      );
    }

    const rec = asRecord(json);
    if (typeof rec.msg === "string" && rec.msg.toLowerCase().includes("error")) {
      return NextResponse.json({ error: rec.msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "No se pudo enviar el correo de recuperación.",
      },
      { status: 500 },
    );
  }
}

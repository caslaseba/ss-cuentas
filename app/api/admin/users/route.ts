import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createManagedUser, listManagedUsers } from "@/lib/admin/users";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const result = await requireAdmin();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.hasServiceRole) {
    return NextResponse.json(
      {
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Está en Supabase → Settings → API → service_role (secret).",
      },
      { status: 500 },
    );
  }

  try {
    const users = await listManagedUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudieron listar los usuarios." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.hasServiceRole) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const role: UserRole = body.role === "admin" ? "admin" : "user";

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: "Email y contraseña (mínimo 6 caracteres) son obligatorios." },
        { status: 400 },
      );
    }

    const created = await createManagedUser({ email, password, fullName, role });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo crear el usuario." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { deleteManagedUser, listManagedUsers, updateManagedUser } from "@/lib/admin/users";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  try {
    const body = (await request.json()) as {
      password?: string;
      fullName?: string;
      role?: UserRole;
    };

    if (body.password && body.password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña nueva debe tener al menos 6 caracteres." },
        { status: 400 },
      );
    }

    if (body.role === "user" && id === result.user.id) {
      const users = await listManagedUsers();
      const admins = users.filter((u) => u.role === "admin");
      if (admins.length <= 1) {
        return NextResponse.json(
          { error: "No podés quitarte el rol de admin si sos el único administrador." },
          { status: 400 },
        );
      }
    }

    await updateManagedUser(id, {
      password: body.password,
      fullName: body.fullName,
      role: body.role,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar el usuario." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  if (id === result.user.id) {
    return NextResponse.json({ error: "No podés eliminar tu propia cuenta desde acá." }, { status: 400 });
  }

  try {
    await deleteManagedUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar el usuario." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";

export const runtime = "nodejs";

export async function GET() {
  const result = await requireAdmin();
  if (!result.ok) {
    return NextResponse.json({ admin: false });
  }
  return NextResponse.json({
    admin: true,
    hasServiceRole: result.hasServiceRole,
    email: result.user.email,
  });
}

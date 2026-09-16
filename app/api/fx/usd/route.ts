import { NextResponse } from "next/server";
import { fetchDolarHoy } from "@/lib/fx/dolar";

export const runtime = "nodejs";

export async function GET() {
  try {
    const quote = await fetchDolarHoy();
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el dólar." },
      { status: 502 },
    );
  }
}

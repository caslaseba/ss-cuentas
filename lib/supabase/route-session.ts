import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export function friendlyAuthError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirmá el email antes de entrar.";
  }
  if (text.includes("fetch failed") || text.includes("error de red") || text.includes("enotfound")) {
    return "No hay conexión con el servidor. Probá de nuevo en un momento.";
  }
  if (text.includes("user already registered") || text.includes("already been registered")) {
    return "Ese email ya tiene cuenta. Entrá con tu contraseña.";
  }
  return message;
}

/** Guarda la sesión en la respuesta del login. cookies() del servidor a veces no llega al navegador. */
export function bindAuthResponse(request: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Falta la configuración de Supabase en el servidor.");
  }

  const jar: CookieToSet[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        jar.splice(0, jar.length, ...cookiesToSet);
      },
    },
  });

  function json(body: unknown, status = 200) {
    const response = NextResponse.json(body, { status });
    for (const cookie of jar) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return response;
  }

  return { supabase, json };
}

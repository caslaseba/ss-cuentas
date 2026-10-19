import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { withTimeout } from "@/lib/async";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/offline",
  "/recuperar",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/auth")) {
    return supabaseResponse;
  }

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key || !hasSupabaseConfig()) {
    if (path === "/" || path === "/login" || path === "/register") {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/dashboard";
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.includes("-auth-token"));
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), 8000);
    user = data.user;
  } catch {
    if (hasSessionCookie) return supabaseResponse;
    user = null;
  }

  const isPublic =
    PUBLIC_PATHS.includes(path) ||
    path.startsWith("/api/fx") ||
    path.startsWith("/icons") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".svg") ||
    path.endsWith(".webmanifest");

  if (!user && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "La sesión venció. Volvé a entrar." }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && (path === "/" || path === "/login" || path === "/register")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}

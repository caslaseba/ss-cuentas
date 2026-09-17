"use server";

import { createClient } from "@/lib/supabase/server";

function appOrigin() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function signUpAction(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ error?: string; needsConfirm?: boolean; ok?: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { full_name: input.fullName.trim() },
        emailRedirectTo: `${appOrigin()}/dashboard`,
      },
    });

    if (error) return { error: error.message };
    if (!data.session) return { needsConfirm: true };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch";
    return {
      error:
        message === "Failed to fetch"
          ? "El servidor no pudo contactar Supabase. Revisá internet y que el proyecto no esté pausado."
          : message,
    };
  }
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string; ok?: boolean }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch";
    return {
      error:
        message === "Failed to fetch"
          ? "El servidor no pudo contactar Supabase. Revisá internet y que el proyecto no esté pausado."
          : message,
    };
  }
}

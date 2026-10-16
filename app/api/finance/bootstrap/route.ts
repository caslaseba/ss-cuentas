import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function messageOf(error: { message?: string; code?: string } | null) {
  if (!error || error.code === "PGRST116") return null;
  return error.message || "No se pudieron leer los datos.";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await withTimeout(supabase.auth.getUser(), 8000);
    const user = userData.user;
    if (userError || !user) {
      return Response.json({ error: "La sesión venció. Volvé a entrar." }, { status: 401 });
    }

    const [profile, categories, accounts, cards, transactions, installments, recurring] = await withTimeout(
      Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("categories").select("*").eq("user_id", user.id).order("name"),
        supabase.from("accounts").select("*").eq("user_id", user.id).order("name"),
        supabase.from("credit_cards").select("*").eq("user_id", user.id).order("name"),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("occurred_on", { ascending: false })
          .limit(800),
        supabase.from("installments").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
        supabase.from("recurring_payments").select("*").eq("user_id", user.id).order("due_day"),
      ]),
      12000,
    );

    const failure =
      messageOf(categories.error) ||
      messageOf(accounts.error) ||
      messageOf(cards.error) ||
      messageOf(transactions.error) ||
      messageOf(installments.error) ||
      messageOf(recurring.error);

    if (failure && !categories.data && !accounts.data && !transactions.data) {
      return Response.json({ error: failure }, { status: 500 });
    }

    return Response.json({
      userId: user.id,
      profile: profile.data ?? null,
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      cards: cards.data ?? [],
      transactions: transactions.data ?? [],
      installments: installments.data ?? [],
      recurring: recurring.data ?? [],
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : "No se pudieron cargar los datos.";
    const error = text === "timeout" ? "La carga tardó demasiado. Probá de nuevo." : text;
    return Response.json({ error }, { status: 504 });
  }
}

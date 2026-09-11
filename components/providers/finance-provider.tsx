"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { enqueueOutbox, readOutbox, removeOutbox } from "@/lib/offline/sync";
import { isoDate, monthKey } from "@/lib/utils";
import type {
  Account,
  Category,
  CreditCard,
  Installment,
  Profile,
  RecurringPayment,
  Transaction,
} from "@/lib/types";

type FinanceContextValue = {
  loading: boolean;
  online: boolean;
  profile: Profile | null;
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  transactions: Transaction[];
  installments: Installment[];
  recurring: RecurringPayment[];
  refresh: () => Promise<void>;
  saveTransaction: (input: Partial<Transaction> & { concept: string; amount: number }) => Promise<void>;
  saveInstallmentPurchase: (input: {
    concept: string;
    totalAmount?: number;
    installmentAmount: number;
    count: number;
    currency: Transaction["currency"];
    credit_card_id: string;
    category_id?: string | null;
    occurred_on: string;
    source?: Transaction["source"];
  }) => Promise<void>;
  saveAccount: (input: Partial<Account> & { name: string }) => Promise<void>;
  saveCard: (input: Partial<CreditCard> & { name: string }) => Promise<void>;
  saveRecurring: (input: Partial<RecurringPayment> & { name: string; amount: number }) => Promise<void>;
  toggleRecurringPaid: (id: string, paid: boolean) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateCategoryLimit: (id: string, monthly_limit: number | null) => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [p, c, a, cc, t, i, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
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
    ]);

    if (p.data) setProfile(p.data as Profile);
    if (c.data) setCategories(c.data as Category[]);
    if (a.data) setAccounts(a.data as Account[]);
    if (cc.data) setCards(cc.data as CreditCard[]);
    if (t.data) setTransactions(t.data as Transaction[]);
    if (i.data) setInstallments(i.data as Installment[]);
    if (r.data) setRecurring(r.data as RecurringPayment[]);
    setLoading(false);
  }, [supabase]);

  const flushOutbox = useCallback(async () => {
    const items = await readOutbox();
    for (const item of items) {
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (!error) await removeOutbox(item.id);
    }
    if (items.length) await refresh();
  }, [refresh, supabase]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void flushOutbox();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refresh();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flushOutbox, refresh]);

  const saveTransaction: FinanceContextValue["saveTransaction"] = async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");

    const payload = {
      user_id: user.id,
      type: input.type ?? "egreso",
      amount: input.amount,
      currency: input.currency ?? "ARS",
      category_id: input.category_id ?? null,
      account_id: input.account_id ?? null,
      credit_card_id: input.credit_card_id ?? null,
      installment_id: input.installment_id ?? null,
      installment_number: input.installment_number ?? null,
      concept: input.concept,
      payment_method: input.payment_method ?? "efectivo",
      occurred_on: input.occurred_on ?? isoDate(new Date()),
      notes: input.notes ?? null,
      source: input.source ?? "manual",
    };

    if (!navigator.onLine) {
      await enqueueOutbox({ table: "transactions", payload });
      toast.message("Guardado offline. Se sincroniza al reconectar.");
      return;
    }

    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw error;
    await refresh();
  };

  const saveInstallmentPurchase: FinanceContextValue["saveInstallmentPurchase"] = async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");

    const installmentAmount = input.installmentAmount;
    const total = input.totalAmount ?? installmentAmount * input.count;

    const { data, error } = await supabase
      .from("installments")
      .insert({
        user_id: user.id,
        credit_card_id: input.credit_card_id,
        concept: input.concept,
        currency: input.currency,
        total_amount: total,
        installment_count: input.count,
        installment_amount: installmentAmount,
        start_date: input.occurred_on,
        current_installment: 1,
      })
      .select("*")
      .single();

    if (error) throw error;

    await saveTransaction({
      type: "egreso",
      amount: installmentAmount,
      currency: input.currency,
      concept: `${input.concept} (cuota 1/${input.count})`,
      payment_method: "tarjeta_credito",
      credit_card_id: input.credit_card_id,
      category_id: input.category_id ?? null,
      occurred_on: input.occurred_on,
      installment_id: data.id,
      installment_number: 1,
      source: input.source ?? "cuota",
    });
  };

  const saveAccount: FinanceContextValue["saveAccount"] = async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id,
      name: input.name,
      kind: input.kind ?? "caja_ahorro",
      currency: input.currency ?? "ARS",
      balance: input.balance ?? 0,
      is_savings_box: input.is_savings_box ?? false,
      notes: input.notes ?? null,
    });
    if (error) throw error;
    await refresh();
  };

  const saveCard: FinanceContextValue["saveCard"] = async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");
    const { error } = await supabase.from("credit_cards").insert({
      user_id: user.id,
      name: input.name,
      kind: input.kind ?? "principal",
      parent_card_id: input.parent_card_id ?? null,
      closing_day: input.closing_day ?? 10,
      due_day: input.due_day ?? 20,
      credit_limit: input.credit_limit ?? 0,
      available_limit: input.available_limit ?? input.credit_limit ?? 0,
      usd_tax_pct: input.usd_tax_pct ?? 0,
      last4: input.last4 ?? null,
    });
    if (error) throw error;
    await refresh();
  };

  const saveRecurring: FinanceContextValue["saveRecurring"] = async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");
    const { error } = await supabase.from("recurring_payments").insert({
      user_id: user.id,
      name: input.name,
      amount: input.amount,
      currency: input.currency ?? "ARS",
      frequency: input.frequency ?? "mensual",
      due_day: input.due_day ?? 1,
      is_paid: false,
      category_id: input.category_id ?? null,
      account_id: input.account_id ?? null,
    });
    if (error) throw error;
    await refresh();
  };

  const toggleRecurringPaid = async (id: string, paid: boolean) => {
    const { error } = await supabase
      .from("recurring_payments")
      .update({
        is_paid: paid,
        paid_month: paid ? `${monthKey()}-01` : null,
      })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const updateProfile = async (patch: Partial<Profile>) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
    if (error) throw error;
    await refresh();
  };

  const updateCategoryLimit = async (id: string, monthly_limit: number | null) => {
    const { error } = await supabase.from("categories").update({ monthly_limit }).eq("id", id);
    if (error) throw error;
    await refresh();
  };

  return (
    <FinanceContext.Provider
      value={{
        loading,
        online,
        profile,
        categories,
        accounts,
        cards,
        transactions,
        installments,
        recurring,
        refresh,
        saveTransaction,
        saveInstallmentPurchase,
        saveAccount,
        saveCard,
        saveRecurring,
        toggleRecurringPaid,
        updateProfile,
        updateCategoryLimit,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance debe usarse dentro de FinanceProvider");
  return ctx;
}

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
  primaryAccount: Account | null;
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
  saveCard: (input: Partial<CreditCard> & { name: string }) => Promise<CreditCard>;
  updateCard: (id: string, patch: Partial<CreditCard>) => Promise<void>;
  updateTransaction: (
    id: string,
    patch: Partial<Transaction> & { concept?: string; amount?: number },
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  convertToInstallments: (
    transactionId: string,
    count: number,
    amountIsTotal: boolean,
  ) => Promise<void>;
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
    let cats = (c.data ?? []) as Category[];
    if (!cats.some((x) => x.name === "Cigarrillos" && x.type === "egreso")) {
      const { data: created } = await supabase
        .from("categories")
        .insert({
          user_id: user.id,
          name: "Cigarrillos",
          type: "egreso",
          icon: "cigarette",
          is_default: true,
        })
        .select("*")
        .single();
      if (created) cats = [...cats, created as Category];
    }
    setCategories(cats);
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

    const cash = (input.payment_method ?? "efectivo") !== "tarjeta_credito";
    const walletId =
      input.account_id ??
      accounts.find((a) => !a.is_savings_box && a.kind === "caja_ahorro")?.id ??
      accounts.find((a) => !a.is_savings_box)?.id ??
      null;

    const payload = {
      user_id: user.id,
      type: input.type ?? "egreso",
      amount: input.amount,
      currency: input.currency ?? "ARS",
      category_id: input.category_id ?? null,
      account_id: cash ? walletId : null,
      credit_card_id: input.credit_card_id ?? null,
      installment_id: input.installment_id ?? null,
      installment_number: input.installment_number ?? null,
      concept: input.concept,
      payment_method: input.payment_method ?? "efectivo",
      occurred_on: input.occurred_on ?? isoDate(new Date()),
      notes: input.notes ?? null,
      source: input.source ?? "manual",
    };

    const applyLocalWallet = () => {
      if (!cash || !walletId) return;
      const delta = payload.type === "ingreso" ? Number(payload.amount) : -Number(payload.amount);
      setAccounts((prev) =>
        prev.map((a) => (a.id === walletId ? { ...a, balance: Number(a.balance) + delta } : a)),
      );
    };

    if (!navigator.onLine) {
      await enqueueOutbox({ table: "transactions", payload });
      setTransactions((prev) => [
        {
          id: `local-${crypto.randomUUID()}`,
          ...payload,
        } as Transaction,
        ...prev,
      ]);
      applyLocalWallet();
      toast.message("Guardado offline. Se sincroniza al reconectar.");
      return;
    }

    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw error;

    if (cash && walletId) {
      const acc = accounts.find((a) => a.id === walletId);
      if (acc) {
        const delta = payload.type === "ingreso" ? Number(payload.amount) : -Number(payload.amount);
        await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", walletId);
      }
    }

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
    const { data, error } = await supabase
      .from("credit_cards")
      .insert({
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
      })
      .select("*")
      .single();
    if (error) throw error;
    await refresh();
    return data as CreditCard;
  };

  const walletIdFor = (accountId?: string | null) =>
    accountId ??
    accounts.find((a) => !a.is_savings_box && a.kind === "caja_ahorro")?.id ??
    accounts.find((a) => !a.is_savings_box)?.id ??
    null;

  const cashDelta = (tx: Pick<Transaction, "type" | "amount" | "payment_method">) => {
    if (tx.payment_method === "tarjeta_credito") return 0;
    return tx.type === "ingreso" ? Number(tx.amount) : -Number(tx.amount);
  };

  const applyWallet = async (accountId: string | null, delta: number) => {
    if (!accountId || !delta) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", accountId);
  };

  const updateCard: FinanceContextValue["updateCard"] = async (id, patch) => {
    const safe: Record<string, unknown> = {};
    if (patch.name != null) safe.name = patch.name;
    if (patch.closing_day != null) safe.closing_day = patch.closing_day;
    if (patch.due_day != null) safe.due_day = patch.due_day;
    if (patch.kind != null) safe.kind = patch.kind;
    if (patch.parent_card_id !== undefined) safe.parent_card_id = patch.parent_card_id;
    if (patch.last4 !== undefined) safe.last4 = patch.last4;
    if (patch.credit_limit != null) safe.credit_limit = patch.credit_limit;
    if (patch.available_limit != null) safe.available_limit = patch.available_limit;
    if (patch.usd_tax_pct != null) safe.usd_tax_pct = patch.usd_tax_pct;
    const { error } = await supabase.from("credit_cards").update(safe).eq("id", id);
    if (error) throw error;
    const card = cards.find((c) => c.id === id);
    if (card?.kind === "principal" && (safe.closing_day != null || safe.due_day != null)) {
      await supabase
        .from("credit_cards")
        .update({
          closing_day: safe.closing_day ?? card.closing_day,
          due_day: safe.due_day ?? card.due_day,
        })
        .eq("parent_card_id", id);
    }
    await refresh();
  };

  const updateTransaction: FinanceContextValue["updateTransaction"] = async (id, patch) => {
    const current = transactions.find((t) => t.id === id);
    if (!current) throw new Error("No se encontró el gasto");
    if (current.id.startsWith("local-")) throw new Error("Ese movimiento todavía no se sincronizó");

    const next: Transaction = {
      ...current,
      ...patch,
      amount: patch.amount ?? current.amount,
      concept: patch.concept ?? current.concept,
    };
    const oldCash = cashDelta(current);
    const newCash = cashDelta(next);
    const oldWallet = current.payment_method === "tarjeta_credito" ? null : current.account_id;
    const newWallet = next.payment_method === "tarjeta_credito" ? null : walletIdFor(next.account_id);

    const { error } = await supabase
      .from("transactions")
      .update({
        type: next.type,
        amount: next.amount,
        currency: next.currency,
        category_id: next.category_id,
        account_id: newWallet,
        credit_card_id: next.payment_method === "tarjeta_credito" ? next.credit_card_id : null,
        concept: next.concept,
        payment_method: next.payment_method,
        occurred_on: next.occurred_on,
        notes: next.notes,
        installment_id: next.installment_id,
        installment_number: next.installment_number,
      })
      .eq("id", id);
    if (error) throw error;

    if (oldWallet && newWallet && oldWallet === newWallet) {
      await applyWallet(oldWallet, newCash - oldCash);
    } else {
      if (oldWallet && oldCash) await applyWallet(oldWallet, -oldCash);
      if (newWallet && newCash) await applyWallet(newWallet, newCash);
    }
    await refresh();
  };

  const deleteTransaction: FinanceContextValue["deleteTransaction"] = async (id) => {
    const current = transactions.find((t) => t.id === id);
    if (!current) throw new Error("No se encontró el gasto");
    if (current.id.startsWith("local-")) throw new Error("Ese movimiento todavía no se sincronizó");
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw error;
    const delta = cashDelta(current);
    if (current.account_id && delta) await applyWallet(current.account_id, -delta);
    await refresh();
  };

  const convertToInstallments: FinanceContextValue["convertToInstallments"] = async (
    transactionId,
    count,
    amountIsTotal,
  ) => {
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) throw new Error("No se encontró el gasto");
    if (tx.id.startsWith("local-")) throw new Error("Ese movimiento todavía no se sincronizó");
    if (tx.payment_method !== "tarjeta_credito" || !tx.credit_card_id) {
      throw new Error("Solo se pueden pasar a cuotas gastos de tarjeta");
    }
    if (tx.installment_id) throw new Error("Ese gasto ya está en cuotas");
    if (count < 2) throw new Error("Mínimo 2 cuotas");

    const total = amountIsTotal ? Number(tx.amount) : Number(tx.amount) * count;
    const installmentAmount = amountIsTotal ? Number((total / count).toFixed(2)) : Number(tx.amount);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");

    const { data, error } = await supabase
      .from("installments")
      .insert({
        user_id: user.id,
        credit_card_id: tx.credit_card_id,
        concept: tx.concept,
        currency: tx.currency,
        total_amount: total,
        installment_count: count,
        installment_amount: installmentAmount,
        start_date: tx.occurred_on,
        current_installment: 1,
      })
      .select("*")
      .single();
    if (error) throw error;

    const { error: txError } = await supabase
      .from("transactions")
      .update({
        amount: installmentAmount,
        installment_id: data.id,
        installment_number: 1,
        concept: `${tx.concept.replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "")} (cuota 1/${count})`,
        source: "cuota",
      })
      .eq("id", transactionId);
    if (txError) throw txError;
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
    const { id: _id, role: _role, ...safe } = patch;
    const { error } = await supabase.from("profiles").update(safe).eq("id", profile.id);
    if (error) throw error;
    await refresh();
  };

  const updateCategoryLimit = async (id: string, monthly_limit: number | null) => {
    const { error } = await supabase.from("categories").update({ monthly_limit }).eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const primaryAccount =
    accounts.find((a) => !a.is_savings_box && a.kind === "caja_ahorro") ??
    accounts.find((a) => !a.is_savings_box) ??
    accounts[0] ??
    null;

  return (
    <FinanceContext.Provider
      value={{
        loading,
        online,
        profile,
        categories,
        accounts,
        primaryAccount,
        cards,
        transactions,
        installments,
        recurring,
        refresh,
        saveTransaction,
        saveInstallmentPurchase,
        saveAccount,
        saveCard,
        updateCard,
        updateTransaction,
        deleteTransaction,
        convertToInstallments,
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

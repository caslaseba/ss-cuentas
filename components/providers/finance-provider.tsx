"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { enqueueOutbox, readOutbox, removeOutbox } from "@/lib/offline/sync";
import { applyOutboxToSnapshot, readFinanceSnapshot, writeFinanceSnapshot, type FinanceSnapshot } from "@/lib/offline/snapshot";
import {
  LOCAL_USER_ID,
  localAddAccount,
  localAddCard,
  localAddCategory,
  localAddTransaction,
  localSeed,
} from "@/lib/finance/local-books";
import { findIcbcAccount, findMpAccount, ICBC_ACCOUNT_NAME, MP_ACCOUNT_NAME, walletForMethod } from "@/lib/finance/accounts";
import { DAD_CARD_NAME, MY_CARD_NAME, householdCards, isPapaCard } from "@/lib/finance/cards";
import {
  cleanConceptName,
  findRecurringByName,
  isCardRecurring,
  withRecurringVia,
} from "@/lib/finance/recurring";
import { withTimeout } from "@/lib/async";
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
  loadError: string | null;
  online: boolean;
  pendingSync: number;
  profile: Profile | null;
  categories: Category[];
  accounts: Account[];
  primaryAccount: Account | null;
  mpAccount: Account | null;
  icbcAccount: Account | null;
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
    current?: number;
    currency: Transaction["currency"];
    credit_card_id: string;
    category_id?: string | null;
    occurred_on: string;
    source?: Transaction["source"];
    notes?: string | null;
  }) => Promise<void>;
  saveAccount: (input: Partial<Account> & { name: string }) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Pick<Account, "name" | "balance" | "notes">>) => Promise<void>;
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
    current?: number,
  ) => Promise<void>;
  updateInstallment: (
    id: string,
    patch: {
      current_installment?: number;
      installment_count?: number;
      installment_amount?: number;
    },
  ) => Promise<void>;
  saveRecurring: (input: Partial<RecurringPayment> & { name: string; amount: number }) => Promise<void>;
  updateRecurring: (
    id: string,
    patch: Partial<Pick<RecurringPayment, "name" | "amount" | "due_day" | "currency" | "category_id" | "notes">>,
  ) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  toggleRecurringPaid: (id: string, paid: boolean) => Promise<void>;
  linkCardService: (input: {
    name: string;
    matchName?: string;
    amount: number;
    currency?: RecurringPayment["currency"];
    credit_card_id: string;
    category_id?: string | null;
  }) => Promise<void>;
  unlinkCardService: (name: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  saveCategory: (input: { name: string; type: Category["type"] }) => Promise<Category>;
  updateCategory: (id: string, patch: { name: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateCategoryLimit: (id: string, monthly_limit: number | null) => Promise<void>;
};

type BootstrapBody = {
  userId: string;
  profile: Profile | null;
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  transactions: Transaction[];
  installments: Installment[];
  recurring: RecurringPayment[];
  error?: string;
};

function loadFailureMessage(err: unknown) {
  const text = err instanceof Error ? err.message : "No se pudieron cargar los datos.";
  if (text === "timeout") return "La carga tardó demasiado. Tocá reintentar.";
  return text;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const remote = hasSupabaseConfig();
  const supabase = useMemo(() => (remote ? createClient() : null), [remote]);
  const booksRef = useRef<FinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);

  const applySnap = useCallback((snap: FinanceSnapshot) => {
    booksRef.current = snap;
    setProfile(snap.profile);
    setCategories(snap.categories);
    setAccounts(snap.accounts);
    setCards(snap.cards);
    setTransactions(snap.transactions);
    setInstallments(snap.installments);
    setRecurring(snap.recurring);
    writeFinanceSnapshot(snap);
  }, []);

  const currentBooks = useCallback(() => booksRef.current ?? localSeed(), []);

  const currentUser = useCallback(async () => {
    if (!supabase) return { id: LOCAL_USER_ID };
    try {
      const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 5000);
      if (sessionData.session?.user) return sessionData.session.user;
    } catch {
      /* la sesión del navegador no respondió */
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    try {
      const { data } = await withTimeout(supabase.auth.getUser(), 5000);
      return data.user;
    } catch {
      return null;
    }
  }, [supabase]);

  const primeHousehold = useCallback(
    async (body: BootstrapBody) => {
      if (!supabase) return;
      let cats = body.categories;
      if (!cats.some((x) => x.name === "Transferencia" && x.type === "ingreso")) {
        const { data: createdTransfer } = await withTimeout(
          supabase
            .from("categories")
            .insert({
              user_id: body.userId,
              name: "Transferencia",
              type: "ingreso",
              icon: "arrow-left-right",
              is_default: true,
            })
            .select("*")
            .single(),
          6000,
        );
        if (createdTransfer) cats = [...cats, createdTransfer as Category];
      }
      if (!cats.some((x) => x.name === "Cigarrillos" && x.type === "egreso")) {
        const { data: created } = await withTimeout(
          supabase
            .from("categories")
            .insert({
              user_id: body.userId,
              name: "Cigarrillos",
              type: "egreso",
              icon: "cigarette",
              is_default: true,
            })
            .select("*")
            .single(),
          6000,
        );
        if (created) cats = [...cats, created as Category];
      }
      if (cats !== body.categories) setCategories(cats);

      let loadedAccounts = body.accounts;
      if (!findMpAccount(loadedAccounts)) {
        const { data: createdMp } = await withTimeout(
          supabase
            .from("accounts")
            .insert({
              user_id: body.userId,
              name: MP_ACCOUNT_NAME,
              kind: "billetera",
              currency: "ARS",
              balance: 0,
              is_savings_box: false,
            })
            .select("*")
            .single(),
          6000,
        );
        if (createdMp) loadedAccounts = [...loadedAccounts, createdMp as Account];
      }
      if (!findIcbcAccount(loadedAccounts)) {
        const { data: createdBank } = await withTimeout(
          supabase
            .from("accounts")
            .insert({
              user_id: body.userId,
              name: ICBC_ACCOUNT_NAME,
              kind: "caja_ahorro",
              currency: "ARS",
              balance: 0,
              is_savings_box: false,
            })
            .select("*")
            .single(),
          6000,
        );
        if (createdBank) loadedAccounts = [...loadedAccounts, createdBank as Account];
      }
      if (loadedAccounts !== body.accounts) setAccounts(loadedAccounts);

      const { mine, papa } = householdCards(body.cards, body.transactions);
      if (mine && mine.name !== MY_CARD_NAME) {
        await withTimeout(supabase.from("credit_cards").update({ name: MY_CARD_NAME }).eq("id", mine.id), 6000);
        setCards((prev) => prev.map((c) => (c.id === mine.id ? { ...c, name: MY_CARD_NAME } : c)));
      }
      if (papa && papa.name !== DAD_CARD_NAME) {
        await withTimeout(supabase.from("credit_cards").update({ name: DAD_CARD_NAME }).eq("id", papa.id), 6000);
        setCards((prev) => prev.map((c) => (c.id === papa.id ? { ...c, name: DAD_CARD_NAME } : c)));
      }
      if (mine && !papa && !body.cards.some((c) => isPapaCard(c))) {
        const { data: createdPapa } = await withTimeout(
          supabase
            .from("credit_cards")
            .insert({
              user_id: body.userId,
              name: DAD_CARD_NAME,
              kind: "extension",
              parent_card_id: mine.id,
              closing_day: mine.closing_day,
              due_day: mine.due_day,
              credit_limit: 0,
              available_limit: 0,
              usd_tax_pct: 0,
            })
            .select("*")
            .single(),
          6000,
        );
        if (createdPapa) setCards((prev) => [...prev, createdPapa as CreditCard]);
      }
    },
    [supabase],
  );

  const refresh = useCallback(async () => {
    if (!supabase) {
      const snap = readFinanceSnapshot(LOCAL_USER_ID) ?? localSeed();
      applySnap(snap);
      setPendingSync(0);
      setLoadError(null);
      setLoading(false);
      return;
    }
    try {
      const cachedNow = readFinanceSnapshot();
      if (cachedNow) {
        setProfile(cachedNow.profile);
        setCategories(cachedNow.categories);
        setAccounts(cachedNow.accounts);
        setCards(cachedNow.cards);
        setTransactions(cachedNow.transactions);
        setInstallments(cachedNow.installments);
        setRecurring(cachedNow.recurring);
        setLoading(false);
      }

      const res = await withTimeout(fetch("/api/finance/bootstrap", { cache: "no-store" }), 12000);
      const body = (await res.json().catch(() => null)) as BootstrapBody | null;
      if (!res.ok || !body || body.error || !body.userId) {
        if (res.status === 401) {
          setLoadError("La sesión venció. Volvé a entrar.");
          return;
        }
        throw new Error(body?.error || "No se pudieron cargar los datos.");
      }

      let pending: Awaited<ReturnType<typeof readOutbox>> = [];
      try {
        pending = await withTimeout(readOutbox(), 2500);
      } catch {
        pending = [];
      }
      const merged = applyOutboxToSnapshot(
        {
          userId: body.userId,
          profile: body.profile,
          categories: body.categories,
          accounts: body.accounts,
          cards: body.cards,
          transactions: body.transactions,
          installments: body.installments,
          recurring: body.recurring,
        },
        pending,
      );
      setProfile(merged.profile);
      setCategories(merged.categories);
      setAccounts(merged.accounts);
      setCards(merged.cards);
      setTransactions(merged.transactions);
      setInstallments(merged.installments);
      setRecurring(merged.recurring);
      setPendingSync(pending.length);
      writeFinanceSnapshot(merged);
      setLoadError(null);
      setLoading(false);
      void primeHousehold(body).catch(() => undefined);
    } catch (err) {
      const cached = readFinanceSnapshot();
      const message = loadFailureMessage(err);
      if (!cached) {
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [applySnap, primeHousehold, supabase]);

  const flushOutbox = useCallback(async () => {
    if (!supabase) return;
    const items = await readOutbox();
    let synced = 0;
    for (const item of items) {
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (error) continue;
      const payload = item.payload;
      const cash = payload.payment_method !== "tarjeta_credito";
      const accountId = typeof payload.account_id === "string" ? payload.account_id : null;
      if (cash && accountId) {
        const { data: acc } = await supabase.from("accounts").select("balance").eq("id", accountId).single();
        if (acc) {
          const delta = payload.type === "ingreso" ? Number(payload.amount) : -Number(payload.amount);
          await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", accountId);
        }
      }
      await removeOutbox(item.id);
      synced += 1;
    }
    setPendingSync((await readOutbox()).length);
    if (synced) {
      toast.success(synced === 1 ? "Se subió 1 movimiento." : `Se subieron ${synced} movimientos.`);
      await refresh();
    }
  }, [refresh, supabase]);


  useEffect(() => {
    const watchdog = window.setTimeout(() => setLoading(false), 8000);
    return () => window.clearTimeout(watchdog);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void flushOutbox();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refresh().then(() => {
      if (navigator.onLine) void flushOutbox();
    });
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flushOutbox, refresh]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const pull = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void refreshRef.current();
    };
    const onFocus = () => pull();
    const onVis = () => {
      if (document.visibilityState === "visible") pull();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, 8000);
    const channel = supabase
      ? supabase
          .channel("ss-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, pull)
          .on("postgres_changes", { event: "*", schema: "public", table: "recurring_payments" }, pull)
          .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, pull)
          .on("postgres_changes", { event: "*", schema: "public", table: "installments" }, pull)
          .subscribe()
      : null;
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(tick);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const saveTransaction: FinanceContextValue["saveTransaction"] = async (input) => {
    if (!supabase) {
      applySnap(localAddTransaction(currentBooks(), input));
      toast.success("Guardado en esta sesión.");
      return;
    }
    const user = await currentUser();
    if (!user) throw new Error("Sin sesión");

    const cash = (input.payment_method ?? "transferencia") !== "tarjeta_credito";
    const method =
      input.payment_method === "efectivo" || input.payment_method === "billetera"
        ? "transferencia"
        : (input.payment_method ?? "transferencia");
    const walletId = input.account_id ?? walletForMethod(accounts, method)?.id ?? null;

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
      payment_method: method,
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

    const queueLocal = async () => {
      const row = await enqueueOutbox({ table: "transactions", payload });
      setPendingSync((n) => n + 1);
      setTransactions((prev) => [
        {
          id: `local-${row.id}`,
          ...payload,
        } as Transaction,
        ...prev,
      ]);
      applyLocalWallet();
      toast.message("Guardado sin señal. Se sube cuando vuelva internet.");
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await queueLocal();
      return;
    }

    try {
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
    } catch {
      await queueLocal();
    }
  };

  const saveInstallmentPurchase: FinanceContextValue["saveInstallmentPurchase"] = async (input) => {
    if (!supabase) {
      const count = input.count;
      const installmentAmount = input.installmentAmount;
      const total = input.totalAmount ?? installmentAmount * count;
      const current = Math.min(Math.max(input.current ?? 1, 1), count);
      const plan: Installment = {
        id: `inst-${Date.now()}`,
        user_id: LOCAL_USER_ID,
        credit_card_id: input.credit_card_id,
        concept: input.concept,
        currency: input.currency,
        total_amount: total,
        installment_count: count,
        installment_amount: installmentAmount,
        start_date: input.occurred_on,
        current_installment: current,
      };
      const base = currentBooks();
      applySnap(
        localAddTransaction(
          { ...base, installments: [plan, ...base.installments] },
          {
            type: "egreso",
            amount: installmentAmount,
            currency: input.currency,
            concept: input.concept,
            payment_method: "tarjeta_credito",
            credit_card_id: input.credit_card_id,
            category_id: input.category_id ?? null,
            occurred_on: input.occurred_on,
            installment_id: plan.id,
            installment_number: current,
            source: input.source ?? "cuota",
            notes: input.notes ?? null,
          },
        ),
      );
      toast.success("Guardado en esta sesión.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");

    const installmentAmount = input.installmentAmount;
    const total = input.totalAmount ?? installmentAmount * input.count;
    const current = Math.min(Math.max(input.current ?? 1, 1), input.count);

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
        current_installment: current,
      })
      .select("*")
      .single();

    if (error) throw error;

    await saveTransaction({
      type: "egreso",
      amount: installmentAmount,
      currency: input.currency,
      concept: input.concept,
      payment_method: "tarjeta_credito",
      credit_card_id: input.credit_card_id,
      category_id: input.category_id ?? null,
      occurred_on: input.occurred_on,
      installment_id: data.id,
      installment_number: current,
      source: input.source ?? "cuota",
      notes: input.notes ?? null,
    });
  };

  const saveAccount: FinanceContextValue["saveAccount"] = async (input) => {
    if (!supabase) {
      applySnap(localAddAccount(currentBooks(), input));
      toast.success("Guardado en esta sesión.");
      return;
    }
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

  const updateAccount: FinanceContextValue["updateAccount"] = async (id, patch) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({
        ...base,
        accounts: base.accounts.map((account) => (account.id === id ? { ...account, ...patch } : account)),
      });
      return;
    }
    const { error } = await supabase.from("accounts").update(patch).eq("id", id);
    if (error) throw error;
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const saveCard: FinanceContextValue["saveCard"] = async (input) => {
    if (!supabase) {
      const result = localAddCard(currentBooks(), input);
      applySnap(result.snap);
      toast.success("Guardado en esta sesión.");
      return result.card;
    }
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

  const walletIdFor = (accountId?: string | null, method?: Transaction["payment_method"]) =>
    accountId ?? walletForMethod(accounts, method ?? "transferencia")?.id ?? null;

  const cashDelta = (tx: Pick<Transaction, "type" | "amount" | "payment_method">) => {
    if (tx.payment_method === "tarjeta_credito") return 0;
    return tx.type === "ingreso" ? Number(tx.amount) : -Number(tx.amount);
  };

  const applyWallet = async (accountId: string | null, delta: number) => {
    if (!accountId || !delta || !supabase) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", accountId);
  };

  const updateCard: FinanceContextValue["updateCard"] = async (id, patch) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({
        ...base,
        cards: base.cards.map((card) => {
          if (card.id === id) return { ...card, ...patch };
          if (card.parent_card_id === id && (patch.closing_day != null || patch.due_day != null)) {
            return {
              ...card,
              closing_day: patch.closing_day ?? card.closing_day,
              due_day: patch.due_day ?? card.due_day,
            };
          }
          return card;
        }),
      });
      return;
    }
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
    if (!supabase) {
      const base = currentBooks();
      const current = base.transactions.find((t) => t.id === id);
      if (!current) throw new Error("No se encontró el gasto");
      const next: Transaction = {
        ...current,
        ...patch,
        amount: patch.amount ?? current.amount,
        concept: patch.concept ?? current.concept,
      };
      const oldDelta = next.payment_method === "tarjeta_credito" ? 0 : current.payment_method === "tarjeta_credito" ? 0 : current.type === "ingreso" ? Number(current.amount) : -Number(current.amount);
      const newDelta = next.payment_method === "tarjeta_credito" ? 0 : next.type === "ingreso" ? Number(next.amount) : -Number(next.amount);
      let accounts = base.accounts;
      const oldWallet = current.payment_method === "tarjeta_credito" ? null : current.account_id;
      const newWallet = next.payment_method === "tarjeta_credito" ? null : next.account_id;
      if (oldWallet && newWallet && oldWallet === newWallet) {
        accounts = accounts.map((a) => (a.id === oldWallet ? { ...a, balance: Number(a.balance) + (newDelta - oldDelta) } : a));
      } else {
        if (oldWallet) accounts = accounts.map((a) => (a.id === oldWallet ? { ...a, balance: Number(a.balance) - oldDelta } : a));
        if (newWallet) accounts = accounts.map((a) => (a.id === newWallet ? { ...a, balance: Number(a.balance) + newDelta } : a));
      }
      applySnap({
        ...base,
        accounts,
        transactions: base.transactions.map((t) => (t.id === id ? next : t)),
      });
      return;
    }
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
    const nextMethod =
      next.payment_method === "efectivo" || next.payment_method === "billetera"
        ? "transferencia"
        : next.payment_method;
    next.payment_method = nextMethod;
    const oldWallet = current.payment_method === "tarjeta_credito" ? null : current.account_id;
    const newWallet = nextMethod === "tarjeta_credito" ? null : walletIdFor(next.account_id, nextMethod);

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
    if (!supabase) {
      const base = currentBooks();
      const current = base.transactions.find((t) => t.id === id);
      if (!current) throw new Error("No se encontró el gasto");
      const delta = current.payment_method === "tarjeta_credito" ? 0 : current.type === "ingreso" ? Number(current.amount) : -Number(current.amount);
      applySnap({
        ...base,
        transactions: base.transactions.filter((t) => t.id !== id),
        accounts:
          current.account_id && delta
            ? base.accounts.map((a) => (a.id === current.account_id ? { ...a, balance: Number(a.balance) - delta } : a))
            : base.accounts,
      });
      return;
    }
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
    current = 1,
  ) => {
    if (!supabase) {
      const base = currentBooks();
      const tx = base.transactions.find((t) => t.id === transactionId);
      if (!tx) throw new Error("No se encontró el gasto");
      if (tx.payment_method !== "tarjeta_credito" || !tx.credit_card_id) {
        throw new Error("Solo se pueden pasar a cuotas gastos de tarjeta");
      }
      if (tx.installment_id) throw new Error("Ese gasto ya está en cuotas");
      if (count < 2) throw new Error("Mínimo 2 cuotas");
      const currentN = Math.min(Math.max(current, 1), count);
      const total = amountIsTotal ? Number(tx.amount) : Number(tx.amount) * count;
      const installmentAmount = amountIsTotal ? Number((total / count).toFixed(2)) : Number(tx.amount);
      const plan: Installment = {
        id: `inst-${Date.now()}`,
        user_id: LOCAL_USER_ID,
        credit_card_id: tx.credit_card_id,
        concept: tx.concept,
        currency: tx.currency,
        total_amount: total,
        installment_count: count,
        installment_amount: installmentAmount,
        start_date: tx.occurred_on,
        current_installment: currentN,
      };
      applySnap({
        ...base,
        installments: [plan, ...base.installments],
        transactions: base.transactions.map((item) =>
          item.id === transactionId
            ? {
                ...item,
                amount: installmentAmount,
                installment_id: plan.id,
                installment_number: currentN,
                source: "cuota",
              }
            : item,
        ),
      });
      return;
    }
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) throw new Error("No se encontró el gasto");
    if (tx.id.startsWith("local-")) throw new Error("Ese movimiento todavía no se sincronizó");
    if (tx.payment_method !== "tarjeta_credito" || !tx.credit_card_id) {
      throw new Error("Solo se pueden pasar a cuotas gastos de tarjeta");
    }
    if (tx.installment_id) throw new Error("Ese gasto ya está en cuotas");
    if (count < 2) throw new Error("Mínimo 2 cuotas");
    const currentN = Math.min(Math.max(current, 1), count);

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
        current_installment: currentN,
      })
      .select("*")
      .single();
    if (error) throw error;

    const { error: txError } = await supabase
      .from("transactions")
      .update({
        amount: installmentAmount,
        installment_id: data.id,
        installment_number: currentN,
        concept: tx.concept.replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim() || tx.concept,
        source: "cuota",
      })
      .eq("id", transactionId);
    if (txError) throw txError;
    await refresh();
  };

  const updateInstallment: FinanceContextValue["updateInstallment"] = async (id, patch) => {
    if (!supabase) {
      const base = currentBooks();
      const plan = base.installments.find((i) => i.id === id);
      if (!plan) throw new Error("No se encontró el plan de cuotas");
      const current = Math.min(
        Math.max(patch.current_installment ?? plan.current_installment, 1),
        patch.installment_count ?? plan.installment_count,
      );
      const count = Math.max(patch.installment_count ?? plan.installment_count, current);
      const amount = patch.installment_amount ?? plan.installment_amount;
      applySnap({
        ...base,
        installments: base.installments.map((item) =>
          item.id === id
            ? { ...item, current_installment: current, installment_count: count, installment_amount: amount, total_amount: amount * count }
            : item,
        ),
        transactions: base.transactions.map((item) =>
          item.installment_id === id ? { ...item, amount, installment_number: current } : item,
        ),
      });
      return;
    }
    const plan = installments.find((i) => i.id === id);
    if (!plan) throw new Error("No se encontró el plan de cuotas");
    const current = Math.min(
      Math.max(patch.current_installment ?? plan.current_installment, 1),
      patch.installment_count ?? plan.installment_count,
    );
    const count = Math.max(patch.installment_count ?? plan.installment_count, current);
    const amount = patch.installment_amount ?? plan.installment_amount;
    const { error } = await supabase
      .from("installments")
      .update({
        current_installment: current,
        installment_count: count,
        installment_amount: amount,
        total_amount: amount * count,
      })
      .eq("id", id);
    if (error) throw error;

    const linked = transactions.find((t) => t.installment_id === id);
    if (linked) {
      await supabase
        .from("transactions")
        .update({
          amount,
          installment_number: current,
        })
        .eq("id", linked.id);
    }
    await refresh();
  };

  const saveRecurring: FinanceContextValue["saveRecurring"] = async (input) => {
    if (!supabase) {
      const base = currentBooks();
      const row: RecurringPayment = {
        id: `rec-${Date.now()}`,
        user_id: LOCAL_USER_ID,
        name: input.name,
        amount: input.amount,
        currency: input.currency ?? "ARS",
        frequency: input.frequency ?? "mensual",
        due_day: input.due_day ?? 1,
        is_paid: false,
        paid_month: null,
        category_id: input.category_id ?? null,
        account_id: input.account_id ?? null,
        notes: input.notes ?? null,
      };
      applySnap({ ...base, recurring: [...base.recurring, row] });
      toast.success("Guardado en esta sesión.");
      return;
    }
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
      notes: input.notes ?? null,
    });
    if (error) throw error;
    await refresh();
  };

  const updateRecurring: FinanceContextValue["updateRecurring"] = async (id, patch) => {
    if (!supabase) {
      const base = currentBooks();
      const current = base.recurring.find((r) => r.id === id);
      if (!current) throw new Error("No se encontró el mensual");
      applySnap({
        ...base,
        recurring: base.recurring.map((item) =>
          item.id === id
            ? {
                ...item,
                name: patch.name ?? item.name,
                amount: patch.amount ?? item.amount,
                due_day: patch.due_day ?? item.due_day,
                currency: patch.currency ?? item.currency,
                category_id: patch.category_id === undefined ? item.category_id : patch.category_id,
                notes: patch.notes === undefined ? item.notes : patch.notes,
              }
            : item,
        ),
      });
      return;
    }
    const current = recurring.find((r) => r.id === id);
    if (!current) throw new Error("No se encontró el mensual");
    const { error } = await supabase
      .from("recurring_payments")
      .update({
        name: patch.name ?? current.name,
        amount: patch.amount ?? current.amount,
        due_day: patch.due_day ?? current.due_day,
        currency: patch.currency ?? current.currency,
        category_id: patch.category_id === undefined ? current.category_id : patch.category_id,
        notes: patch.notes === undefined ? current.notes : patch.notes,
      })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const deleteRecurring: FinanceContextValue["deleteRecurring"] = async (id) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({ ...base, recurring: base.recurring.filter((item) => item.id !== id) });
      return;
    }
    const { error } = await supabase.from("recurring_payments").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const toggleRecurringPaid = async (id: string, paid: boolean) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({
        ...base,
        recurring: base.recurring.map((item) =>
          item.id === id ? { ...item, is_paid: paid, paid_month: paid ? `${monthKey()}-01` : null } : item,
        ),
      });
      return;
    }
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

  const linkCardService: FinanceContextValue["linkCardService"] = async (input) => {
    const cleaned = cleanConceptName(input.name);
    if (!cleaned) return;
    const existing = findRecurringByName(recurring, input.matchName ?? cleaned);
    const notes = withRecurringVia(existing?.notes, true, input.credit_card_id);
    if (existing) {
      await updateRecurring(existing.id, {
        name: cleaned,
        amount: input.amount,
        currency: input.currency ?? existing.currency,
        category_id: input.category_id === undefined ? existing.category_id : input.category_id,
        notes,
      });
      return;
    }
    await saveRecurring({
      name: cleaned,
      amount: input.amount,
      currency: input.currency ?? "ARS",
      due_day: 1,
      category_id: input.category_id ?? null,
      notes,
    });
  };

  const unlinkCardService: FinanceContextValue["unlinkCardService"] = async (name) => {
    const existing = findRecurringByName(recurring, name);
    if (!existing || !isCardRecurring(existing)) return;
    await deleteRecurring(existing.id);
  };

  const updateProfile = async (patch: Partial<Profile>) => {
    if (!supabase) {
      const base = currentBooks();
      if (!base.profile) return;
      const { id: _id, role: _role, ...safe } = patch;
      applySnap({ ...base, profile: { ...base.profile, ...safe } });
      return;
    }
    if (!profile) return;
    const { id: _id, role: _role, ...safe } = patch;
    const { error } = await supabase.from("profiles").update(safe).eq("id", profile.id);
    if (error) throw error;
    await refresh();
  };

  const updateCategoryLimit = async (id: string, monthly_limit: number | null) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({
        ...base,
        categories: base.categories.map((item) => (item.id === id ? { ...item, monthly_limit } : item)),
      });
      return;
    }
    const { error } = await supabase.from("categories").update({ monthly_limit }).eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const saveCategory: FinanceContextValue["saveCategory"] = async (input) => {
    if (!supabase) {
      const result = localAddCategory(currentBooks(), input);
      applySnap(result.snap);
      return result.category;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión");
    const name = input.name.trim();
    if (!name) throw new Error("Poné un nombre de categoría");
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: user.id,
        name,
        type: input.type,
        icon: "tag",
        is_default: false,
      })
      .select("*")
      .single();
    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
        throw new Error("Esa categoría ya existe");
      }
      throw error;
    }
    await refresh();
    return data as Category;
  };

  const updateCategory: FinanceContextValue["updateCategory"] = async (id, patch) => {
    if (!supabase) {
      const name = patch.name.trim();
      if (!name) throw new Error("Poné un nombre de categoría");
      const base = currentBooks();
      const current = base.categories.find((item) => item.id === id);
      if (current && base.categories.some((item) => item.id !== id && item.type === current.type && item.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Esa categoría ya existe");
      }
      applySnap({
        ...base,
        categories: base.categories.map((item) => (item.id === id ? { ...item, name } : item)),
      });
      return;
    }
    const name = patch.name.trim();
    if (!name) throw new Error("Poné un nombre de categoría");
    const { error } = await supabase.from("categories").update({ name }).eq("id", id);
    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
        throw new Error("Esa categoría ya existe");
      }
      throw error;
    }
    await refresh();
  };

  const deleteCategory: FinanceContextValue["deleteCategory"] = async (id) => {
    if (!supabase) {
      const base = currentBooks();
      applySnap({ ...base, categories: base.categories.filter((item) => item.id !== id) });
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const primaryAccount = findIcbcAccount(accounts) ?? accounts[0] ?? null;
  const mpAccount = findMpAccount(accounts);
  const icbcAccount = findIcbcAccount(accounts);

  return (
    <FinanceContext.Provider
      value={{
        loading,
        loadError,
        online,
        pendingSync,
        profile,
        categories,
        accounts,
        primaryAccount,
        mpAccount,
        icbcAccount,
        cards,
        transactions,
        installments,
        recurring,
        refresh,
        saveTransaction,
        saveInstallmentPurchase,
        saveAccount,
        updateAccount,
        saveCard,
        updateCard,
        updateTransaction,
        deleteTransaction,
        convertToInstallments,
        updateInstallment,
        saveRecurring,
        updateRecurring,
        deleteRecurring,
        toggleRecurringPaid,
        linkCardService,
        unlinkCardService,
        updateProfile,
        saveCategory,
        updateCategory,
        deleteCategory,
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

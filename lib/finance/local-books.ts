import type {
  Account,
  Category,
  CreditCard,
  Installment,
  Profile,
  RecurringPayment,
  Transaction,
} from "@/lib/types";
import { isoDate, monthKey } from "@/lib/utils";
import type { FinanceSnapshot } from "@/lib/offline/snapshot";

export const LOCAL_USER_ID = "local-sebastian";

function nid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function dayOfMonth(day: number) {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), Math.min(day, last)));
}

function cat(
  id: string,
  name: string,
  type: Category["type"],
  icon: string,
  monthly_limit: number | null = null,
): Category {
  return { id, user_id: LOCAL_USER_ID, name, type, icon, monthly_limit };
}

export function localSeed(): FinanceSnapshot {
  const categories: Category[] = [
    cat("cat-sueldo", "Sueldo", "ingreso", "wallet"),
    cat("cat-transfer", "Transferencia", "ingreso", "arrow-left-right"),
    cat("cat-comida", "Comida", "egreso", "utensils", 150000),
    cat("cat-super", "Supermercado", "egreso", "shopping-cart", 200000),
    cat("cat-ciga", "Cigarrillos", "egreso", "cigarette", 20000),
    cat("cat-serv", "Servicios", "egreso", "zap", 80000),
    cat("cat-ocio", "Ocio", "egreso", "clapperboard", 60000),
    cat("cat-salud", "Salud", "egreso", "heart-pulse", 50000),
    cat("cat-otros", "Otros egresos", "egreso", "circle-dot"),
  ];

  const accounts: Account[] = [
    {
      id: "acc-icbc",
      user_id: LOCAL_USER_ID,
      name: "Caja de ahorro ICBC",
      kind: "caja_ahorro",
      currency: "ARS",
      balance: 2397000,
      is_savings_box: false,
      notes: null,
    },
    {
      id: "acc-mp",
      user_id: LOCAL_USER_ID,
      name: "Mercado Pago",
      kind: "billetera",
      currency: "ARS",
      balance: 45000,
      is_savings_box: false,
      notes: null,
    },
    {
      id: "acc-cash",
      user_id: LOCAL_USER_ID,
      name: "Efectivo",
      kind: "efectivo",
      currency: "ARS",
      balance: 12000,
      is_savings_box: false,
      notes: null,
    },
  ];

  const cards: CreditCard[] = [
    {
      id: "card-visa",
      user_id: LOCAL_USER_ID,
      name: "Visa ICBC",
      kind: "principal",
      parent_card_id: null,
      closing_day: 10,
      due_day: 20,
      credit_limit: 1500000,
      available_limit: 1400000,
      usd_tax_pct: 0,
      last4: "4412",
    },
    {
      id: "card-papa",
      user_id: LOCAL_USER_ID,
      name: "Visa ICBC Papá",
      kind: "extension",
      parent_card_id: "card-visa",
      closing_day: 10,
      due_day: 20,
      credit_limit: 0,
      available_limit: 0,
      usd_tax_pct: 0,
      last4: null,
    },
  ];

  const installments: Installment[] = [
    {
      id: "inst-heladera",
      user_id: LOCAL_USER_ID,
      credit_card_id: "card-papa",
      concept: "Heladera",
      currency: "ARS",
      total_amount: 480000,
      installment_count: 6,
      installment_amount: 80000,
      start_date: dayOfMonth(6),
      current_installment: 2,
    },
  ];

  const tx = (
    id: string,
    partial: Pick<Transaction, "type" | "amount" | "concept" | "payment_method" | "occurred_on"> &
      Partial<Transaction>,
  ): Transaction => ({
    id,
    user_id: LOCAL_USER_ID,
    currency: "ARS",
    category_id: null,
    account_id: null,
    credit_card_id: null,
    installment_id: null,
    installment_number: null,
    notes: null,
    source: "manual",
    ...partial,
  });

  const transactions: Transaction[] = [
    tx("tx-sueldo", {
      type: "ingreso",
      amount: 2500000,
      concept: "Sueldo",
      payment_method: "transferencia",
      occurred_on: dayOfMonth(1),
      category_id: "cat-sueldo",
      account_id: "acc-icbc",
    }),
    tx("tx-super", {
      type: "egreso",
      amount: 85000,
      concept: "Supermercado",
      payment_method: "transferencia",
      occurred_on: dayOfMonth(3),
      category_id: "cat-super",
      account_id: "acc-icbc",
    }),
    tx("tx-asado", {
      type: "egreso",
      amount: 20000,
      concept: "Asado",
      payment_method: "tarjeta_credito",
      occurred_on: dayOfMonth(8),
      category_id: "cat-comida",
      credit_card_id: "card-visa",
      source: "manual",
    }),
    tx("tx-heladera", {
      type: "egreso",
      amount: 80000,
      concept: "Heladera",
      payment_method: "tarjeta_credito",
      occurred_on: dayOfMonth(6),
      category_id: "cat-otros",
      credit_card_id: "card-papa",
      installment_id: "inst-heladera",
      installment_number: 2,
      source: "cuota",
    }),
    tx("tx-ciga", {
      type: "egreso",
      amount: 3000,
      concept: "Cigarrillos",
      payment_method: "transferencia",
      occurred_on: dayOfMonth(12),
      category_id: "cat-ciga",
      account_id: "acc-icbc",
    }),
    tx("tx-mila", {
      type: "egreso",
      amount: 15000,
      concept: "Milanesa",
      payment_method: "transferencia",
      occurred_on: dayOfMonth(15),
      category_id: "cat-comida",
      account_id: "acc-icbc",
    }),
    tx("tx-mp", {
      type: "egreso",
      amount: 8000,
      concept: "Kiosco",
      payment_method: "billetera",
      occurred_on: dayOfMonth(16),
      category_id: "cat-ocio",
      account_id: "acc-mp",
    }),
  ];

  const recurring: RecurringPayment[] = [
    {
      id: "rec-netflix",
      user_id: LOCAL_USER_ID,
      name: "Netflix",
      amount: 12000,
      currency: "ARS",
      frequency: "mensual",
      due_day: 5,
      is_paid: false,
      paid_month: null,
      category_id: "cat-ocio",
      account_id: "acc-icbc",
      notes: null,
    },
    {
      id: "rec-spotify",
      user_id: LOCAL_USER_ID,
      name: "Spotify",
      amount: 5000,
      currency: "ARS",
      frequency: "mensual",
      due_day: 8,
      is_paid: true,
      paid_month: `${monthKey()}-01`,
      category_id: "cat-ocio",
      account_id: "acc-icbc",
      notes: null,
    },
    {
      id: "rec-osde",
      user_id: LOCAL_USER_ID,
      name: "OSDE",
      amount: 90000,
      currency: "ARS",
      frequency: "mensual",
      due_day: 10,
      is_paid: false,
      paid_month: null,
      category_id: "cat-salud",
      account_id: "acc-icbc",
      notes: null,
    },
    {
      id: "rec-edenor",
      user_id: LOCAL_USER_ID,
      name: "Edenor",
      amount: 28000,
      currency: "ARS",
      frequency: "mensual",
      due_day: 12,
      is_paid: true,
      paid_month: `${monthKey()}-01`,
      category_id: "cat-serv",
      account_id: "acc-icbc",
      notes: null,
    },
    {
      id: "rec-abl",
      user_id: LOCAL_USER_ID,
      name: "ABL",
      amount: 18000,
      currency: "ARS",
      frequency: "mensual",
      due_day: 15,
      is_paid: false,
      paid_month: null,
      category_id: "cat-serv",
      account_id: "acc-icbc",
      notes: null,
    },
  ];

  const profile: Profile = {
    id: LOCAL_USER_ID,
    email: "sebastian@local",
    full_name: "Sebastian",
    role: "admin",
    local_currency: "ARS",
    usd_exchange_rate: 1300,
    tax_surcharge_pct: 0,
  };

  return {
    userId: LOCAL_USER_ID,
    profile,
    categories,
    accounts,
    cards,
    transactions,
    installments,
    recurring,
  };
}

function cashDelta(tx: Pick<Transaction, "type" | "amount" | "payment_method">) {
  if (tx.payment_method === "tarjeta_credito") return 0;
  return tx.type === "ingreso" ? Number(tx.amount) : -Number(tx.amount);
}

function shiftBalance(accounts: Account[], accountId: string | null, delta: number) {
  if (!accountId || !delta) return accounts;
  return accounts.map((account) =>
    account.id === accountId ? { ...account, balance: Number(account.balance) + delta } : account,
  );
}

export function localAddTransaction(
  snap: FinanceSnapshot,
  input: Partial<Transaction> & { concept: string; amount: number },
): FinanceSnapshot {
  const method =
    input.payment_method === "efectivo" || input.payment_method === "billetera"
      ? "transferencia"
      : (input.payment_method ?? "transferencia");
  const cash = method !== "tarjeta_credito";
  const accountId = cash ? (input.account_id ?? snap.accounts.find((a) => /icbc/i.test(a.name))?.id ?? null) : null;
  const row: Transaction = {
    id: nid("tx"),
    user_id: LOCAL_USER_ID,
    type: input.type ?? "egreso",
    amount: input.amount,
    currency: input.currency ?? "ARS",
    category_id: input.category_id ?? null,
    account_id: accountId,
    credit_card_id: method === "tarjeta_credito" ? (input.credit_card_id ?? null) : null,
    installment_id: input.installment_id ?? null,
    installment_number: input.installment_number ?? null,
    concept: input.concept,
    payment_method: method,
    occurred_on: input.occurred_on ?? isoDate(new Date()),
    notes: input.notes ?? null,
    source: input.source ?? "manual",
  };
  return {
    ...snap,
    transactions: [row, ...snap.transactions],
    accounts: shiftBalance(snap.accounts, accountId, cashDelta(row)),
  };
}

export function localAddAccount(
  snap: FinanceSnapshot,
  input: Partial<Account> & { name: string },
): FinanceSnapshot {
  const row: Account = {
    id: nid("acc"),
    user_id: LOCAL_USER_ID,
    name: input.name,
    kind: input.kind ?? "caja_ahorro",
    currency: input.currency ?? "ARS",
    balance: input.balance ?? 0,
    is_savings_box: input.is_savings_box ?? false,
    notes: input.notes ?? null,
  };
  return { ...snap, accounts: [...snap.accounts, row] };
}

export function localAddCard(
  snap: FinanceSnapshot,
  input: Partial<CreditCard> & { name: string },
): { snap: FinanceSnapshot; card: CreditCard } {
  const card: CreditCard = {
    id: nid("card"),
    user_id: LOCAL_USER_ID,
    name: input.name,
    kind: input.kind ?? "principal",
    parent_card_id: input.parent_card_id ?? null,
    closing_day: input.closing_day ?? 10,
    due_day: input.due_day ?? 20,
    credit_limit: input.credit_limit ?? 0,
    available_limit: input.available_limit ?? input.credit_limit ?? 0,
    usd_tax_pct: input.usd_tax_pct ?? 0,
    last4: input.last4 ?? null,
  };
  return { snap: { ...snap, cards: [...snap.cards, card] }, card };
}

export function localAddCategory(
  snap: FinanceSnapshot,
  input: { name: string; type: Category["type"] },
): { snap: FinanceSnapshot; category: Category } {
  const name = input.name.trim();
  if (!name) throw new Error("Poné un nombre de categoría");
  if (snap.categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.type === input.type)) {
    throw new Error("Esa categoría ya existe");
  }
  const category = cat(nid("cat"), name, input.type, "tag");
  return { snap: { ...snap, categories: [...snap.categories, category] }, category };
}

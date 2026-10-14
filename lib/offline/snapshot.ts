import type { OutboxItem } from "@/lib/offline/sync";
import type {
  Account,
  Category,
  CreditCard,
  Installment,
  Profile,
  RecurringPayment,
  Transaction,
} from "@/lib/types";

const KEY = "ss-cuentas-snap";

export type FinanceSnapshot = {
  userId: string;
  profile: Profile | null;
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  transactions: Transaction[];
  installments: Installment[];
  recurring: RecurringPayment[];
};

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readFinanceSnapshot(userId?: string): FinanceSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as FinanceSnapshot;
    if (userId && snap.userId !== userId) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearFinanceSnapshot() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export function writeFinanceSnapshot(snap: FinanceSnapshot) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* quota or private mode */
  }
}

export function applyOutboxToSnapshot(snap: FinanceSnapshot, items: OutboxItem[]): FinanceSnapshot {
  if (!items.length) return snap;
  const extra = items
    .filter((item) => item.table === "transactions")
    .map(
      (item) =>
        ({
          id: `local-${item.id}`,
          ...item.payload,
        }) as Transaction,
    );
  const known = new Set(snap.transactions.map((t) => t.id));
  const merged = extra.filter((t) => !known.has(t.id));
  if (!merged.length) return snap;

  let accounts = snap.accounts;
  for (const tx of merged) {
    if (tx.payment_method === "tarjeta_credito" || !tx.account_id) continue;
    const delta = tx.type === "ingreso" ? Number(tx.amount) : -Number(tx.amount);
    accounts = accounts.map((a) =>
      a.id === tx.account_id ? { ...a, balance: Number(a.balance) + delta } : a,
    );
  }

  return {
    ...snap,
    accounts,
    transactions: [...merged, ...snap.transactions],
  };
}

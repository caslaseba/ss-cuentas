import type { Account, PaymentMethod } from "@/lib/types";

export const MP_ACCOUNT_NAME = "Mercado Pago";
export const ICBC_ACCOUNT_NAME = "Caja de ahorro ICBC";

function norm(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function findMpAccount(accounts: Account[]) {
  return (
    accounts.find((a) => a.kind === "billetera") ??
    accounts.find((a) => /mercado\s*pago|\bmp\b/.test(norm(a.name))) ??
    null
  );
}

export function findIcbcAccount(accounts: Account[]) {
  const mp = findMpAccount(accounts);
  const rest = accounts.filter((a) => a.id !== mp?.id);
  return (
    rest.find((a) => /icbc/.test(norm(a.name))) ??
    rest.find((a) => a.kind === "caja_ahorro" && !a.is_savings_box) ??
    rest.find((a) => !a.is_savings_box) ??
    null
  );
}

export function walletForMethod(accounts: Account[], method: PaymentMethod | null | undefined) {
  if (method === "billetera") return findMpAccount(accounts) ?? findIcbcAccount(accounts);
  return findIcbcAccount(accounts) ?? findMpAccount(accounts);
}

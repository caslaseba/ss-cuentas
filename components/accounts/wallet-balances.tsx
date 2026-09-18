"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { formatMoney } from "@/lib/utils";
import type { Account } from "@/lib/types";

export function WalletBalances() {
  const { mpAccount, icbcAccount, updateAccount } = useFinance();
  const [editing, setEditing] = useState<Account | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  function open(account: Account) {
    setEditing(account);
    setAmount(formatAmountFromNumber(Number(account.balance)));
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await updateAccount(editing.id, { balance: parseAmountInput(amount) });
      toast.success("Saldo actualizado");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el saldo");
    } finally {
      setBusy(false);
    }
  }

  if (!mpAccount && !icbcAccount) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {mpAccount ? (
          <button
            type="button"
            onClick={() => open(mpAccount)}
            className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-left"
          >
            <p className="text-xs font-medium text-sky-800 dark:text-sky-200">Mercado Pago</p>
            <p className="text-sm font-semibold text-sky-950 dark:text-sky-50">
              {formatMoney(Number(mpAccount.balance), mpAccount.currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Billetera · tocá para corregir</p>
          </button>
        ) : null}
        {icbcAccount ? (
          <button
            type="button"
            onClick={() => open(icbcAccount)}
            className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-left"
          >
            <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">ICBC</p>
            <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-50">
              {formatMoney(Number(icbcAccount.balance), icbcAccount.currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Caja de ahorro · tocá para corregir</p>
          </button>
        ) : null}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldo de {editing?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Poné el número que ves en la app. Los próximos gastos de ese medio se descuentan de acá.
          </p>
          <AmountInput className="mt-3" value={amount} onChange={setAmount} placeholder="0" />
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void save()}>
              Guardar
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

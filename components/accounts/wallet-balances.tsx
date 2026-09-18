"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PinGate } from "@/components/entry/pin-gate";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { EDIT_PIN } from "@/lib/finance/edit-lock";
import { icbcUnlocked, setIcbcUnlocked } from "@/lib/security/wallet-unlock";
import { formatMoney } from "@/lib/utils";
import type { Account } from "@/lib/types";

export function WalletBalances() {
  const { mpAccount, icbcAccount, updateAccount } = useFinance();
  const [showMp, setShowMp] = useState(false);
  const [showIcbc, setShowIcbc] = useState(false);
  const [askIcbc, setAskIcbc] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (icbcUnlocked()) setShowIcbc(true);
  }, []);

  function openEdit(account: Account) {
    setEditing(account);
    setAmount(formatAmountFromNumber(Number(account.balance)));
  }

  function tapMp() {
    if (!mpAccount) return;
    if (!showMp) {
      setShowMp(true);
      return;
    }
    openEdit(mpAccount);
  }

  function tapIcbc() {
    if (!icbcAccount) return;
    if (!showIcbc) {
      setPinError(false);
      setAskIcbc(true);
      return;
    }
    openEdit(icbcAccount);
  }

  function submitIcbc(pin: string) {
    if (pin !== "__bio__" && pin !== EDIT_PIN) {
      setPinError(true);
      return false;
    }
    setIcbcUnlocked();
    setShowIcbc(true);
    setAskIcbc(false);
    setPinError(false);
    return true;
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
      <div className="grid grid-cols-2 gap-1">
        {mpAccount ? (
          <button
            type="button"
            onClick={tapMp}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-1 text-left"
          >
            <p className="truncate text-[11px] font-medium leading-tight text-sky-800 dark:text-sky-200">Mercado Pago</p>
            <p className="text-[11px] font-semibold leading-tight tabular-nums text-sky-950 dark:text-sky-50">
              {showMp ? formatMoney(Number(mpAccount.balance), mpAccount.currency) : "Tocá para ver"}
            </p>
          </button>
        ) : null}
        {icbcAccount ? (
          <button
            type="button"
            onClick={tapIcbc}
            className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-1 text-left"
          >
            <p className="truncate text-[11px] font-medium leading-tight text-indigo-800 dark:text-indigo-200">
              Caja ICBC
            </p>
            <p className="text-[11px] font-semibold leading-tight tabular-nums text-indigo-950 dark:text-indigo-50">
              {showIcbc ? formatMoney(Number(icbcAccount.balance), icbcAccount.currency) : "PIN o huella"}
            </p>
          </button>
        ) : null}
      </div>

      <PinGate
        open={askIcbc}
        error={pinError}
        title="Caja de ahorro ICBC"
        hint="El saldo de la caja se ve con tu clave o con huella / Face ID. Mercado Pago no pide esto."
        confirmLabel="Ver saldo"
        allowBiometric
        onClose={() => {
          setAskIcbc(false);
          setPinError(false);
        }}
        onSubmit={submitIcbc}
      />

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

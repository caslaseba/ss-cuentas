"use client";

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { MovementSearch } from "@/components/dashboard/movement-search";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDropInstallment } from "@/hooks/use-drop-installment";
import { planIdFromProjectedCuota } from "@/lib/finance/installment-drop";
import { isProjectedTx } from "@/lib/finance/month-view";
import { usdToLocal } from "@/lib/finance/settlement";
import { toast } from "sonner";
import type { Transaction } from "@/lib/types";

export function SearchWidget() {
  const { transactions, categories, cards, installments, profile } = useFinance();
  const dropInstallment = useDropInstallment();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const rate = Number(profile?.usd_exchange_rate ?? 0);

  const toArs = useCallback(
    (amount: number, currency: Transaction["currency"]) =>
      currency === "USD" ? usdToLocal(amount, rate, 0) : amount,
    [rate],
  );

  function select(tx: Transaction) {
    if (planIdFromProjectedCuota(tx.id)) {
      void dropInstallment(tx);
      return;
    }
    if (isProjectedTx(tx)) {
      toast.message("Es una proyección: todavía no se debitó.");
      return;
    }
    setEditing(tx);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 w-9 p-0"
        aria-label="Buscar"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buscar</DialogTitle>
          </DialogHeader>
          <MovementSearch
            transactions={transactions}
            categories={categories}
            cards={cards}
            installments={installments}
            toArs={toArs}
            onSelect={select}
          />
        </DialogContent>
      </Dialog>
      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
    </>
  );
}

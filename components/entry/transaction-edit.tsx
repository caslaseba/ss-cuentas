"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/finance/match";
import { planProgress } from "@/lib/finance/settlement";
import type { PaymentMethod, Transaction } from "@/lib/types";

export function TransactionEdit({
  tx,
  open,
  onOpenChange,
}: {
  tx: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!tx) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar movimiento</DialogTitle>
        </DialogHeader>
        <EditForm tx={tx} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const { categories, cards, installments, updateTransaction, deleteTransaction, convertToInstallments } =
    useFinance();
  const [concept, setConcept] = useState(tx.concept);
  const [amount, setAmount] = useState(String(tx.amount));
  const [method, setMethod] = useState<PaymentMethod>(tx.payment_method);
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [cardId, setCardId] = useState(tx.credit_card_id ?? "");
  const [date, setDate] = useState(tx.occurred_on);
  const [cuotas, setCuotas] = useState("12");
  const [amountIsTotal, setAmountIsTotal] = useState(true);
  const [busy, setBusy] = useState(false);

  const plan = tx.installment_id ? installments.find((i) => i.id === tx.installment_id) : null;
  const progress = plan ? planProgress(plan) : null;
  const n = Number(amount) || 0;
  const count = Number(cuotas) || 0;
  const previewCuota = amountIsTotal && count >= 2 ? n / count : n;
  const previewTotal = amountIsTotal ? n : n * Math.max(count, 1);

  async function save() {
    setBusy(true);
    try {
      await updateTransaction(tx.id, {
        concept: concept.trim() || tx.concept,
        amount: n,
        payment_method: method,
        category_id: categoryId || null,
        credit_card_id: method === "tarjeta_credito" ? cardId || null : null,
        occurred_on: date,
      });
      toast.success("Movimiento actualizado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("¿Borrar este movimiento?")) return;
    setBusy(true);
    try {
      await deleteTransaction(tx.id);
      toast.success("Movimiento borrado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  async function toInstallments() {
    setBusy(true);
    try {
      await convertToInstallments(tx.id, count, amountIsTotal);
      toast.success(`Pasó a ${count} cuotas de ${formatMoney(previewCuota, tx.currency)}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo pasar a cuotas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Qué fue</Label>
        <Input className="mt-1.5" value={concept} onChange={(e) => setConcept(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Monto</Label>
          <Input className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label>Fecha</Label>
          <Input className="mt-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Categoría</Label>
        <Select className="mt-1.5" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories
            .filter((c) => c.type === tx.type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </div>
      <div>
        <Label>Medio</Label>
        <Select className="mt-1.5" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="efectivo">Efectivo</option>
          <option value="billetera">Mercado Pago</option>
          <option value="debito">Débito</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta_credito">Tarjeta</option>
        </Select>
      </div>
      {method === "tarjeta_credito" ? (
        <div>
          <Label>Tarjeta (tuya o extensión)</Label>
          <Select className="mt-1.5" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === "extension" ? `${c.name} · extensión` : c.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {progress && plan ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          Cuota {progress.current}/{progress.total}
          {progress.remainingAfterThis > 0
            ? ` · quedan ${progress.remainingAfterThis}`
            : " · última cuota"}
        </p>
      ) : null}

      {method === "tarjeta_credito" && !tx.installment_id && tx.type === "egreso" ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Pasar a cuotas</p>
          <div>
            <Label>Cantidad</Label>
            <Input className="mt-1.5" value={cuotas} onChange={(e) => setCuotas(e.target.value)} inputMode="numeric" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={amountIsTotal} onChange={() => setAmountIsTotal(true)} />
            El monto es el total
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={!amountIsTotal} onChange={() => setAmountIsTotal(false)} />
            El monto es una cuota
          </label>
          {count >= 2 ? (
            <p className="text-xs text-muted-foreground">
              {count} cuotas de {formatMoney(previewCuota, tx.currency)} (total{" "}
              {formatMoney(previewTotal, tx.currency)})
            </p>
          ) : null}
          <Button type="button" variant="outline" disabled={busy || count < 2} onClick={() => void toInstallments()}>
            Confirmar cuotas
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">Medio actual: {paymentMethodLabel(tx.payment_method)}</p>

      <div className="flex flex-col gap-2 pt-1">
        <Button disabled={busy} onClick={() => void save()}>
          Guardar cambios
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
          Borrar
        </Button>
      </div>
    </div>
  );
}

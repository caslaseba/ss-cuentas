"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { householdCards } from "@/lib/finance/cards";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { recurringVia, withRecurringVia } from "@/lib/finance/recurring";
import type { RecurringPayment } from "@/lib/types";

export function RecurringEdit({
  item,
  open,
  onOpenChange,
}: {
  item: RecurringPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar gasto fijo</DialogTitle>
        </DialogHeader>
        <EditForm item={item} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ item, onDone }: { item: RecurringPayment; onDone: () => void }) {
  const { categories, cards, transactions, updateRecurring, deleteRecurring, toggleRecurringPaid } = useFinance();
  const { visible } = householdCards(cards, transactions);
  const via = recurringVia(item);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(formatAmountFromNumber(Number(item.amount)));
  const [dueDay, setDueDay] = useState(String(item.due_day));
  const [categoryId, setCategoryId] = useState(item.category_id ?? "");
  const [payHow, setPayHow] = useState(via.onCard ? via.cardId || "tarjeta" : "plata");
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = parseAmountInput(amount);
    if (!name.trim() || !n) {
      toast.error("Poné nombre y monto.");
      return;
    }
    const onCard = payHow !== "plata";
    const cardId = payHow !== "plata" && payHow !== "tarjeta" ? payHow : visible[0]?.id ?? null;
    setBusy(true);
    try {
      await updateRecurring(item.id, {
        name: name.trim(),
        amount: n,
        due_day: onCard ? 1 : Math.min(28, Math.max(1, Number(dueDay) || 1)),
        category_id: categoryId || null,
        notes: withRecurringVia(item.notes, onCard, onCard ? cardId : null),
      });
      toast.success("Gasto fijo actualizado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Borrar ${item.name}? Deja de aparecer todos los meses.`)) return;
    setBusy(true);
    try {
      await deleteRecurring(item.id);
      toast.success("Gasto fijo borrado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Qué es</Label>
        <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={payHow === "plata" ? "" : "col-span-2"}>
          <Label>Monto</Label>
          <AmountInput className="mt-1.5" value={amount} onChange={setAmount} />
        </div>
        {payHow === "plata" ? (
          <div>
            <Label>Día de vencimiento</Label>
            <Input className="mt-1.5" value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" />
          </div>
        ) : null}
      </div>
      <div>
        <Label>Cómo se paga</Label>
        <Select className="mt-1.5" value={payHow} onChange={(e) => setPayHow(e.target.value)}>
          <option value="plata">Lo pago yo (sale de tu plata)</option>
          {visible.map((c) => (
            <option key={c.id} value={c.id}>
              Se debita de {c.name}
            </option>
          ))}
        </Select>
        {payHow !== "plata" ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Sin día de vencimiento: se paga solo cuando pagás el resumen. No se suma otra vez.
          </p>
        ) : null}
      </div>
      <div>
        <Label>Categoría</Label>
        <Select className="mt-1.5" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories
            .filter((c) => c.type === "egreso")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </div>
      {item.is_paid && payHow === "plata" ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void toggleRecurringPaid(item.id, false)
              .then(() => {
                toast.success("Quedó como impago este mes");
                onDone();
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
          }}
        >
          Marcar como no pagado
        </Button>
      ) : null}
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

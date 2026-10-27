"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cardChoiceLabel, householdCards } from "@/lib/finance/cards";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { paymentMethodLabel, unifyPaymentMethod } from "@/lib/finance/match";
import { findRecurringByName, isCardRecurring } from "@/lib/finance/recurring";
import { addMonths, planProgress } from "@/lib/finance/settlement";
import { observationOf, withObservation } from "@/lib/finance/tx-notes";
import { confirmDropInstallment } from "@/lib/finance/installment-drop";
import { isProjectedTx } from "@/lib/finance/month-view";
import { formatMoney } from "@/lib/utils";
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
  if (isProjectedTx(tx)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proyección</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta cuota todavía no se debitó. Se calcula para que veas cómo queda el mes.
          </p>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar movimiento</DialogTitle>
        </DialogHeader>
        <EditForm key={tx.id} tx={tx} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const {
    categories,
    cards,
    transactions,
    installments,
    recurring,
    updateTransaction,
    deleteTransaction,
    deleteInstallment,
    convertToInstallments,
    updateInstallment,
    linkCardService,
    unlinkCardService,
  } = useFinance();
  const { visible } = householdCards(cards, transactions);
  const matching = findRecurringByName(recurring, tx.concept);
  const alreadyService = Boolean(matching && isCardRecurring(matching));
  const [concept, setConcept] = useState(tx.concept.replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "").trim() || tx.concept);
  const [amount, setAmount] = useState(formatAmountFromNumber(Number(tx.amount)));
  const [method, setMethod] = useState<PaymentMethod>(unifyPaymentMethod(tx.payment_method));
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [cardId, setCardId] = useState(tx.credit_card_id ?? visible[0]?.id ?? "");
  const [date, setDate] = useState(tx.occurred_on);
  const plan = tx.installment_id ? installments.find((i) => i.id === tx.installment_id) : null;
  const progress = plan ? planProgress(plan) : null;
  const [enCuotas, setEnCuotas] = useState(false);
  const [cuotas, setCuotas] = useState(String(plan?.installment_count ?? ""));
  const [currentCuota, setCurrentCuota] = useState(String(progress?.current ?? 1));
  const [cuotaAmount, setCuotaAmount] = useState(formatAmountFromNumber(Number(plan?.installment_amount ?? tx.amount)));
  const [amountIsTotal, setAmountIsTotal] = useState(true);
  const [asService, setAsService] = useState(alreadyService);
  const [observation, setObservation] = useState(observationOf(tx.notes));
  const [busy, setBusy] = useState(false);

  const n = parseAmountInput(amount);
  const count = Number(cuotas) || 0;
  const currentN = Number(currentCuota) || 1;
  const previewCuota = amountIsTotal && count >= 2 ? n / count : n;
  const previewTotal = amountIsTotal ? n : n * Math.max(count, 1);
  const cuotaPreview = useMemo(() => {
    const tot = Math.max(count, currentN, 1);
    const cur = Math.min(Math.max(currentN, 1), tot);
    const remainingAfterThis = Math.max(0, tot - cur);
    const unit = plan ? parseAmountInput(cuotaAmount) : previewCuota;
    return {
      cur,
      tot,
      remainingAfterThis,
      remainingAmount: remainingAfterThis * unit,
      endsOn: addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), remainingAfterThis),
      isLast: cur >= tot,
    };
  }, [count, currentN, cuotaAmount, plan, previewCuota]);

  const pickedCard = visible.find((c) => c.id === cardId);
  const canBeService = method === "tarjeta_credito" && tx.type === "egreso" && !plan;

  async function save() {
    setBusy(true);
    try {
      const cleaned = (concept.trim() || tx.concept).replace(/\s*\(cuota \d+\/\d+\)\s*$/i, "");
      if (plan) {
        await updateInstallment(plan.id, {
          current_installment: cuotaPreview.cur,
          installment_count: cuotaPreview.tot,
          installment_amount: parseAmountInput(cuotaAmount) || n,
        });
      }
      await updateTransaction(tx.id, {
        concept: cleaned,
        amount: plan ? parseAmountInput(cuotaAmount) || n : n,
        payment_method: method,
        category_id: categoryId || null,
        credit_card_id: method === "tarjeta_credito" ? cardId || null : null,
        occurred_on: date,
        notes: withObservation(tx.notes, observation),
        installment_number: plan ? cuotaPreview.cur : tx.installment_number,
      });
      if (tx.type === "egreso") {
        if (asService && canBeService && cardId) {
          await linkCardService({
            name: cleaned,
            matchName: tx.concept,
            amount: n,
            currency: tx.currency,
            credit_card_id: cardId,
            category_id: categoryId || null,
          });
        } else {
          await unlinkCardService(tx.concept);
          if (cleaned !== tx.concept) await unlinkCardService(cleaned);
        }
      }
      toast.success(
        asService && canBeService
          ? `Guardado. Se paga con ${pickedCard?.name ?? "la tarjeta"}, sin duplicar el gasto.`
          : "Movimiento actualizado",
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (plan) {
      if (!confirmDropInstallment(plan)) return;
      setBusy(true);
      try {
        await deleteInstallment(plan.id);
        toast.success("Plan de cuotas eliminado");
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo borrar");
      } finally {
        setBusy(false);
      }
      return;
    }
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
      await convertToInstallments(tx.id, count, amountIsTotal, currentN);
      toast.success(`Cuota ${currentN}/${count} de ${formatMoney(previewCuota, tx.currency)}`);
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
          <Label>{plan ? "Monto de cada cuota" : "Monto"}</Label>
          <AmountInput
            className="mt-1.5"
            value={plan ? cuotaAmount : amount}
            onChange={(v) => (plan ? setCuotaAmount(v) : setAmount(v))}
          />
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
          <option value="transferencia">Transferencia</option>
          <option value="debito">Débito</option>
          <option value="tarjeta_credito">Tarjeta</option>
        </Select>
      </div>
      {method === "tarjeta_credito" ? (
        <div>
          <Label>Tarjeta</Label>
          <Select className="mt-1.5" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {cardChoiceLabel(c)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {canBeService ? (
        <label className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-violet-700"
            checked={asService}
            onChange={(e) => {
              const on = e.target.checked;
              setAsService(on);
              if (on) setEnCuotas(false);
            }}
          />
          <span>
            Es mensual
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Sigue en su categoría. Se paga con {pickedCard?.name ?? "la tarjeta"}, sin sumar otra vez el gasto.
            </span>
          </span>
        </label>
      ) : null}

      {plan ? (
        <div className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
          <p className="text-sm font-medium">Plan de cuotas</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Total de cuotas</Label>
              <Input className="mt-1.5" value={cuotas} onChange={(e) => setCuotas(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <Label>Voy por la cuota</Label>
              <Input
                className="mt-1.5"
                value={currentCuota}
                onChange={(e) => setCurrentCuota(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>
          <p className="text-sm">
            {cuotaPreview.isLast
              ? `Última cuota (${cuotaPreview.cur}/${cuotaPreview.tot})`
              : `Cuota ${cuotaPreview.cur}/${cuotaPreview.tot} · faltan ${cuotaPreview.remainingAfterThis} (${formatMoney(cuotaPreview.remainingAmount, tx.currency)})`}
          </p>
          <p className="text-xs text-muted-foreground">
            Termina en {format(cuotaPreview.endsOn, "MMMM yyyy", { locale: es })}
          </p>
        </div>
      ) : null}

      {method === "tarjeta_credito" && !tx.installment_id && tx.type === "egreso" ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-sky-700"
              checked={enCuotas}
              onChange={(e) => {
                const on = e.target.checked;
                setEnCuotas(on);
                if (on) setAsService(false);
              }}
            />
            Va en cuotas
          </label>
          {enCuotas ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Total de cuotas</Label>
                  <Input className="mt-1.5" value={cuotas} onChange={(e) => setCuotas(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <Label>Voy por la cuota</Label>
                  <Input
                    className="mt-1.5"
                    value={currentCuota}
                    onChange={(e) => setCurrentCuota(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
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
                  Cuota {currentN}/{count} de {formatMoney(previewCuota, tx.currency)} · faltan{" "}
                  {Math.max(0, count - currentN)} · termina{" "}
                  {format(addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), Math.max(0, count - currentN)), "MMMM yyyy", { locale: es })}
                  {" "}(total {formatMoney(previewTotal, tx.currency)})
                </p>
              ) : null}
              <Button type="button" variant="outline" disabled={busy || count < 2} onClick={() => void toInstallments()}>
                Confirmar cuotas
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Pago por única vez. Marcá solo si realmente va en cuotas.</p>
          )}
        </div>
      ) : null}

      <div>
        <Label>Observación (opcional)</Label>
        <Textarea
          className="mt-1.5 min-h-16"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder="Algún detalle para vos"
        />
      </div>

      <p className="text-xs text-muted-foreground">Medio actual: {paymentMethodLabel(tx.payment_method)}</p>

      <div className="flex flex-col gap-2 pt-1">
        <Button disabled={busy} onClick={() => void save()}>
          Guardar cambios
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
          {plan ? "Borrar plan de cuotas" : "Borrar"}
        </Button>
      </div>
    </div>
  );
}

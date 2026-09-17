"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMonthView } from "@/hooks/use-month-view";
import { MY_CARD_NAME } from "@/lib/finance/cards";
import { categoryOriginSplit, categorySlug } from "@/lib/finance/month-view";
import { cardCoversRecurring, isCardRecurring, recurringVia } from "@/lib/finance/recurring";
import { categoryChipClass, groupCategory, methodBoxClass } from "@/lib/finance/style";
import { carryOverNote, inCurrentMonth, shiftMonth } from "@/lib/finance/wallet";
import { cn, formatMoney, isoDate, monthKey } from "@/lib/utils";
import type { RecurringPayment, Transaction } from "@/lib/types";

export default function ResumenPage() {
  const view = useMonthView();
  const {
    cursor,
    setCursor,
    canGoNext,
    isCurrent,
    wallet,
    leftover,
    alreadyCarried,
    saveTransaction,
    deleteTransaction,
    toggleRecurringPaid,
    recurring,
    transactions,
    categories,
    cards,
    installments,
    mine,
    papa,
    toArs,
    cashSpend,
    openCardTx,
    monthMoves,
    tarjetaAbierta,
    visaMia,
    visaPapa,
    liveStatement,
  } = view;

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const [payAsk, setPayAsk] = useState<RecurringPayment | null>(null);
  const [unpayAsk, setUnpayAsk] = useState<RecurringPayment | null>(null);

  const mes = monthKey(cursor);
  const cats = categoryOriginSplit(cashSpend, openCardTx, categories, mine?.id ?? null, papa?.id ?? null, toArs);
  const cashRecurring = isCurrent ? recurring.filter((r) => !isCardRecurring(r)) : [];
  const unpaid = cashRecurring.filter((r) => !r.is_paid);
  const paid = cashRecurring.filter((r) => r.is_paid);
  const cardServices = isCurrent ? recurring.filter((r) => isCardRecurring(r)) : [];
  const used = tarjetaAbierta;
  const limit = Number(mine?.credit_limit ?? 0);
  const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  const linkedPay = (r: RecurringPayment) =>
    transactions.find(
      (t) =>
        t.source === "recurrente" &&
        t.concept === r.name &&
        t.type === "egreso" &&
        t.payment_method !== "tarjeta_credito" &&
        inCurrentMonth(t.occurred_on, cursor),
    );

  async function confirmPay() {
    if (!payAsk) return;
    const r = payAsk;
    setPayAsk(null);
    try {
      await toggleRecurringPaid(r.id, true);
      await saveTransaction({
        type: "egreso",
        amount: Number(r.amount),
        currency: r.currency,
        concept: r.name,
        payment_method: "transferencia",
        category_id: r.category_id,
        source: "recurrente",
      });
      toast.success(`Marcado pagado: ${r.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar pagado");
    }
  }

  async function confirmUnpay() {
    if (!unpayAsk) return;
    const r = unpayAsk;
    setUnpayAsk(null);
    try {
      const linked = linkedPay(r);
      if (linked) await deleteTransaction(linked.id);
      await toggleRecurringPaid(r.id, false);
      toast.success(`Volvió a impago: ${r.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo deshacer");
    }
  }

  async function bringLeftover() {
    if (!leftover || alreadyCarried) return;
    try {
      await saveTransaction({
        type: "ingreso",
        amount: leftover,
        concept: `Sobra de ${format(shiftMonth(cursor, -1), "MMMM yyyy", { locale: es })}`,
        payment_method: "transferencia",
        occurred_on: isoDate(cursor),
        notes: carryOverNote(shiftMonth(cursor, -1)),
        source: "manual",
      });
      toast.success("Sobra del mes anterior sumada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo traer la sobra");
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-5 md:max-w-2xl">
      <div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setCursor((d) => shiftMonth(d, -1))}>
            ← Anterior
          </Button>
          <p className="text-center text-sm font-medium capitalize">{format(cursor, "MMMM yyyy", { locale: es })}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!canGoNext}
            onClick={() => setCursor((d) => shiftMonth(d, 1))}
          >
            Siguiente →
          </Button>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{isCurrent ? "Te queda de tu sueldo" : "Te quedó de tu sueldo"}</p>
        <p className="text-3xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300 sm:text-4xl">
          {formatMoney(wallet.queda, "ARS")}
        </p>
      </div>

      {leftover > 0 && !alreadyCarried ? (
        <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">Sobra del mes anterior</p>
            <p className="text-xs text-muted-foreground">
              En {format(shiftMonth(cursor, -1), "MMMM", { locale: es })} te quedó {formatMoney(leftover, "ARS")}.
            </p>
          </div>
          <Button size="sm" onClick={() => void bringLeftover()}>
            Traer
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/resumen/origen/plata?mes=${mes}`}
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-center"
        >
          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">De tu sueldo</p>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{formatMoney(wallet.gastadoContado, "ARS")}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Efectivo, MP y transferencias</p>
        </Link>
        <Link
          href={`/resumen/origen/tarjeta?mes=${mes}`}
          className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3 py-3 text-center"
        >
          <p className="text-[11px] font-medium text-violet-800 dark:text-violet-200">Tarjeta · próximo mes</p>
          <p className="text-sm font-semibold text-violet-950 dark:text-violet-100">{formatMoney(tarjetaAbierta, "ARS")}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Tu Visa y la de papá</p>
        </Link>
      </div>

      {mine ? (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3 py-3">
          <p className="text-sm font-medium text-violet-950 dark:text-violet-100">Consumo de tu tarjeta</p>
          <p className="text-2xl font-semibold text-violet-950 dark:text-violet-50">{formatMoney(used, "ARS")}</p>
          <p className="text-xs text-muted-foreground">
            {MY_CARD_NAME} {formatMoney(visaMia, "ARS")}
            {papa ? ` · ${papa.name} ${formatMoney(visaPapa, "ARS")}` : ""}
            {liveStatement ? ` · cierra ${format(liveStatement.cycle.end, "d/M")}` : ""}
          </p>
          {limit > 0 ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(6, usedPct)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatMoney(used, "ARS")} de {formatMoney(limit, "ARS")}
              </p>
            </>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/resumen/origen/visa?mes=${mes}`}>Tu Visa</Link>
            </Button>
            {papa ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/resumen/origen/papa?mes=${mes}`}>Visa papá</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {cats.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Por categoría</h2>
          <p className="text-xs text-muted-foreground">
            Tocá una para ver cada gasto. Separado: tu sueldo vs tarjeta (va al próximo mes).
          </p>
          {cats.map((row) => (
            <Link
              key={row.name}
              href={`/resumen/categoria/${categorySlug(row.name)}?mes=${mes}`}
              className={cn("block rounded-xl border px-3 py-2", categoryChipClass(groupCategory(row.name)))}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.name}</span>
                <span className="font-semibold">{formatMoney(row.total, "ARS")}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {row.sueldo > 0 ? (
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodBoxClass("Efectivo"))}>
                    Tu sueldo {formatMoney(row.sueldo, "ARS")}
                  </span>
                ) : null}
                {row.visa > 0 ? (
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodBoxClass("Tarjeta"))}>
                    Tu Visa {formatMoney(row.visa, "ARS")}
                  </span>
                ) : null}
                {row.papa > 0 ? (
                  <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-medium text-fuchsia-950 dark:text-fuchsia-100">
                    Visa papá {formatMoney(row.papa, "ARS")}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {unpaid.length > 0 || paid.length > 0 || cardServices.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Servicios del mes</h2>
          {cardServices.map((r) => {
            const via = recurringVia(r);
            const card = cards.find((c) => c.id === via.cardId);
            const onCard = cardCoversRecurring(r, transactions, cursor);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setEditingFixed(r)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {card?.name ?? MY_CARD_NAME}
                    {onCard ? " · ya está en el resumen" : " · se debita con la tarjeta"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium">{formatMoney(Number(r.amount), r.currency)}</span>
              </button>
            );
          })}
          {unpaid.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setEditingFixed(r)}>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  Día {r.due_day} · {formatMoney(Number(r.amount), r.currency)}
                </p>
              </button>
              <Button size="sm" onClick={() => setPayAsk(r)}>
                Pagué
              </Button>
            </div>
          ))}
          {paid.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setEditingFixed(r)}>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Pagado este mes · {formatMoney(Number(r.amount), r.currency)}</p>
              </button>
              <Button size="sm" variant="outline" onClick={() => setUnpayAsk(r)}>
                Deshacer
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 pb-4">
        <h2 className="text-sm font-medium">Cada movimiento</h2>
        <p className="text-xs text-muted-foreground">
          Efectivo, transferencia, Mercado Pago y Visa (tuya o de papá). Lo de tarjeta va al próximo mes.
        </p>
        {monthMoves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          monthMoves.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={categories}
              cards={cards}
              installments={installments}
              onSelect={setEditing}
            />
          ))
        )}
      </div>

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <RecurringEdit item={editingFixed} open={Boolean(editingFixed)} onOpenChange={(v) => !v && setEditingFixed(null)} />

      <Dialog open={Boolean(payAsk)} onOpenChange={(v) => !v && setPayAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Lo marcás pagado?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {payAsk
              ? `Se descuenta ${formatMoney(Number(payAsk.amount), payAsk.currency)} de tu sueldo por ${payAsk.name}.`
              : null}
          </p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => void confirmPay()}>
              Sí, pagué
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setPayAsk(null)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(unpayAsk)} onOpenChange={(v) => !v && setUnpayAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Deshacer el pago?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {unpayAsk
              ? `${unpayAsk.name} vuelve a impago y se anula el gasto de tu sueldo.`
              : null}
          </p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => void confirmUnpay()}>
              Sí, deshacer
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setUnpayAsk(null)}>
              Dejar pagado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

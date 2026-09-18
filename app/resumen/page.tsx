"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { PinGate } from "@/components/entry/pin-gate";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { MovementRow } from "@/components/dashboard/movement-row";
import { WalletBalances } from "@/components/accounts/wallet-balances";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useEditGate } from "@/hooks/use-edit-gate";
import { useMonthView } from "@/hooks/use-month-view";
import { MY_CARD_NAME } from "@/lib/finance/cards";
import { cashRecurringPaid, categoryOriginSplit, categorySlug, cursorFromMes, isProjectedTx } from "@/lib/finance/month-view";
import { cardCoversRecurring, isCardRecurring, recurringVia } from "@/lib/finance/recurring";
import { categoryChipClass, groupCategory } from "@/lib/finance/style";
import { carryOverNote, inCurrentMonth, shiftMonth } from "@/lib/finance/wallet";
import { cn, formatMoney, isoDate, monthKey } from "@/lib/utils";
import type { PaymentMethod, RecurringPayment, Transaction } from "@/lib/types";

export default function ResumenPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <ResumenInner />
    </Suspense>
  );
}

function ResumenInner() {
  const search = useSearchParams();
  const router = useRouter();
  const view = useMonthView(cursorFromMes(search.get("mes")));
  const {
    cursor,
    setCursor,
    canGoNext,
    isCurrent,
    isPast,
    isFuture,
    sealed,
    estimated,
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
    quedaSiPagaVisa,
  } = view;
  const { unlocked, askPin, pinError, guard, submitPin, closePin } = useEditGate();
  const canEdit = !isPast || unlocked;

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const [payAsk, setPayAsk] = useState<RecurringPayment | null>(null);
  const [payDate, setPayDate] = useState(isoDate(new Date()));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [unpayAsk, setUnpayAsk] = useState<RecurringPayment | null>(null);

  const mes = monthKey(cursor);
  const cats = categoryOriginSplit(cashSpend, openCardTx, categories, mine?.id ?? null, papa?.id ?? null, toArs);
  const cashRecurring = recurring.filter((r) => !isCardRecurring(r));
  const unpaid = cashRecurring.filter((r) => !cashRecurringPaid(r, transactions, cursor, isCurrent));
  const paid = cashRecurring.filter((r) => cashRecurringPaid(r, transactions, cursor, isCurrent));
  const cardServices = isCurrent ? recurring.filter((r) => isCardRecurring(r)) : [];

  const linkedPay = (r: RecurringPayment) =>
    transactions.find(
      (t) =>
        t.source === "recurrente" &&
        t.concept === r.name &&
        t.type === "egreso" &&
        t.payment_method !== "tarjeta_credito" &&
        inCurrentMonth(t.occurred_on, cursor),
    );

  function goMonth(delta: number) {
    const next = shiftMonth(cursor, delta);
    setCursor(next);
    router.replace(`/resumen?mes=${monthKey(next)}`, { scroll: false });
  }

  function selectTx(tx: Transaction) {
    if (isProjectedTx(tx)) {
      toast.message("Es una proyección: todavía no se debitó.");
      return;
    }
    guard(() => setEditing(tx), isPast);
  }

  function selectFixed(r: RecurringPayment) {
    guard(() => setEditingFixed(r), isPast);
  }

  async function confirmPay() {
    if (!payAsk) return;
    const r = payAsk;
    setPayAsk(null);
    try {
      if (isCurrent) await toggleRecurringPaid(r.id, true);
      await saveTransaction({
        type: "egreso",
        amount: Number(r.amount),
        currency: r.currency,
        concept: r.name,
        payment_method: payMethod,
        category_id: r.category_id,
        occurred_on: payDate || isoDate(new Date()),
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
      if (isCurrent) await toggleRecurringPaid(r.id, false);
      toast.success(`Volvió a impago: ${r.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo deshacer");
    }
  }

  async function bringLeftover() {
    if (!leftover || alreadyCarried || !canEdit) return;
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
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-3 md:max-w-2xl">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => goMonth(-1)}>
            ←
          </Button>
          <p className="text-center text-xs font-medium capitalize">{format(cursor, "MMMM yyyy", { locale: es })}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            disabled={!canGoNext}
            onClick={() => goMonth(1)}
          >
            →
          </Button>
        </div>
        <p className="text-[11px] font-medium text-muted-foreground">
          {isFuture
            ? "Te quedaría de tu sueldo"
            : isCurrent
              ? "Te queda de tu sueldo"
              : "Te quedó de tu sueldo"}
          {estimated ? " (estimado)" : ""}
        </p>
        <p className="text-xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
          {formatMoney(wallet.queda, "ARS")}
        </p>
        {isFuture && visaMia > 0 ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Si pagás tu Visa, te quedarían {formatMoney(quedaSiPagaVisa, "ARS")}
          </p>
        ) : null}
      </div>

      {isPast && !unlocked ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
          <p className="text-[11px] font-medium text-amber-950 dark:text-amber-100">
            {sealed ? "Mes cerrado · clave para editar" : "Mes anterior · clave para editar"}
          </p>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => guard(() => undefined, true)}>
            Clave
          </Button>
        </div>
      ) : null}

      {isFuture ? (
        <p className="text-xs text-muted-foreground">
          Estimado con tu sueldo típico, los fijos de cada mes y las cuotas que todavía faltan.
        </p>
      ) : null}

      {leftover > 0 && !alreadyCarried && !isFuture ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
          <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
            Sobra {format(shiftMonth(cursor, -1), "MMMM", { locale: es })} {formatMoney(leftover, "ARS")}
          </p>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => guard(() => void bringLeftover(), isPast)}>
            Traer
          </Button>
        </div>
      ) : null}

      <WalletBalances />

      <div className="grid grid-cols-3 gap-1">
        <Link
          href={`/resumen/origen/plata?mes=${mes}`}
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight text-amber-800 dark:text-amber-200">De tu sueldo</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums text-amber-950 dark:text-amber-100">
            {formatMoney(wallet.gastadoContado, "ARS")}
          </p>
        </Link>
        <Link
          href={`/resumen/origen/tarjeta?mes=${mes}`}
          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight text-violet-800 dark:text-violet-200">
            {isFuture ? "Tarjeta · cuotas" : isPast ? "Tarjeta" : "Tarjeta · próximo"}
          </p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums text-violet-950 dark:text-violet-100">
            {formatMoney(tarjetaAbierta, "ARS")}
          </p>
        </Link>
        {mine ? (
          <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1">
            <p className="truncate text-[11px] font-medium leading-tight text-violet-950 dark:text-violet-100">Tu Visa</p>
            <p className="text-[11px] font-semibold leading-tight tabular-nums text-violet-950 dark:text-violet-50">
              {formatMoney(visaMia, "ARS")}
            </p>
            {liveStatement ? (
              <p className="truncate text-[9px] leading-tight text-muted-foreground">
                cierra {format(liveStatement.cycle.end, "d/M")}
              </p>
            ) : null}
          </div>
        ) : (
          <div />
        )}
      </div>

      {mine ? (
        <div className="grid grid-cols-2 gap-1">
          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
            <Link href={`/resumen/origen/visa?mes=${mes}`}>Tu Visa {formatMoney(visaMia, "ARS")}</Link>
          </Button>
          {papa ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
              <Link href={`/resumen/origen/papa?mes=${mes}`}>Papá {formatMoney(visaPapa, "ARS")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {cats.length > 0 ? (
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium">Por categoría</h2>
          <div className="grid grid-cols-3 gap-1">
          {cats.map((row) => (
            <Link
              key={row.name}
              href={`/resumen/categoria/${categorySlug(row.name)}?mes=${mes}`}
              className={cn("rounded-md border px-1.5 py-1", categoryChipClass(groupCategory(row.name)))}
            >
              <p className="truncate text-[11px] font-medium leading-tight">{row.name}</p>
              <p className="text-[11px] font-semibold leading-tight tabular-nums">{formatMoney(row.total, "ARS")}</p>
              <p className="truncate text-[9px] leading-tight text-muted-foreground">
                {[row.sueldo > 0 ? "Sueldo" : null, row.visa > 0 ? "Visa" : null, row.papa > 0 ? "Papá" : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </Link>
          ))}
          </div>
        </div>
      ) : null}

      {unpaid.length > 0 || paid.length > 0 || cardServices.length > 0 ? (
        <div className="space-y-1">
          <h2 className="text-xs font-medium">Servicios del mes</h2>
          {cardServices.map((r) => {
            const via = recurringVia(r);
            const card = cards.find((c) => c.id === via.cardId);
            const onCard = cardCoversRecurring(r, transactions, cursor);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectFixed(r)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium">{r.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {card?.name ?? MY_CARD_NAME}
                    {onCard ? " · en el resumen" : " · se debita"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium">{formatMoney(Number(r.amount), r.currency)}</span>
              </button>
            );
          })}
          {unpaid.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1">
              <button type="button" className="min-w-0 text-left" onClick={() => selectFixed(r)}>
                <p className="truncate text-[11px] font-medium">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Día {r.due_day} · {formatMoney(Number(r.amount), r.currency)}
                  {isFuture ? " · se descuenta" : ""}
                </p>
              </button>
              {!isFuture ? (
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    guard(() => {
                      setPayDate(isoDate(new Date()));
                      setPayMethod("transferencia");
                      setPayAsk(r);
                    }, isPast)
                  }
                >
                  Pagué
                </Button>
              ) : null}
            </div>
          ))}
          {paid.map((r) => {
            const linked = linkedPay(r);
            return (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
              <button type="button" className="min-w-0 text-left" onClick={() => selectFixed(r)}>
                <p className="truncate text-[11px] font-medium">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Pagado{linked ? ` el ${format(parseISO(linked.occurred_on), "d/M")}` : ""} · {formatMoney(Number(r.amount), r.currency)}
                </p>
              </button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => guard(() => setUnpayAsk(r), isPast)}>
                Deshacer
              </Button>
            </div>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-1.5 pb-4">
        <h2 className="text-xs font-medium">Cada movimiento</h2>
        <p className="text-[11px] text-muted-foreground">
          {isFuture
            ? "Cuotas y fijos que se van a descontar."
            : "Buscá con la lupa de arriba. Acá está el mes."}
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
              onSelect={selectTx}
            />
          ))
        )}
      </div>

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <RecurringEdit item={editingFixed} open={Boolean(editingFixed)} onOpenChange={(v) => !v && setEditingFixed(null)} />
      <PinGate open={askPin} error={pinError} onClose={closePin} onSubmit={submitPin} />

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
          <div className="mt-3 space-y-2">
            <div>
              <Label>Fecha del pago</Label>
              <Input className="mt-1.5" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <Label>Salió de</Label>
              <Select className="mt-1.5" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                <option value="transferencia">Caja ICBC</option>
                <option value="billetera">Mercado Pago</option>
              </Select>
            </div>
          </div>
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

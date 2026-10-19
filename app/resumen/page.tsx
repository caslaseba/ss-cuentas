"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PinGate } from "@/components/entry/pin-gate";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { MonthMoves } from "@/components/dashboard/month-moves";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useEditGate } from "@/hooks/use-edit-gate";
import { useMonthView } from "@/hooks/use-month-view";
import { cashRecurringPaid, categoryOriginSplit, cursorFromMes, isProjectedTx } from "@/lib/finance/month-view";
import { cardCoversRecurring, recurringVia } from "@/lib/finance/recurring";
import { categoryChipClass, groupCategory } from "@/lib/finance/style";
import { carryOverNote, inCurrentMonth, shiftMonth } from "@/lib/finance/wallet";
import { spendOnCard } from "@/lib/finance/month-view";
import { dueAfterClosing, statementRefForMonth } from "@/lib/finance/settlement";
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
    cashMoves,
    openCardTx,
    monthMoves,
    tarjetaAbierta,
    visaMia,
    visaPapa,
    closingDay,
    billBefore,
    billAfter,
    billMine,
    sumsNext,
    sumsLater,
    updateCard,
    quedaSiPagaVisa,
  } = view;
  const { unlocked, askPin, pinError, guard, submitPin, closePin } = useEditGate();
  const canEdit = !isPast || unlocked;
  const [hideSueldo, setHideSueldo] = useState(true);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [closeDay, setCloseDay] = useState(String(closingDay));
  const [savingClose, setSavingClose] = useState(false);

  useEffect(() => {
    setCloseDay(String(closingDay));
  }, [closingDay]);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const [payAsk, setPayAsk] = useState<RecurringPayment | null>(null);
  const [payDate, setPayDate] = useState(isoDate(new Date()));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [unpayAsk, setUnpayAsk] = useState<RecurringPayment | null>(null);

  const mes = monthKey(cursor);
  const closeDate = mine ? statementRefForMonth(mine, cursor) : null;
  const dueDate = mine && closeDate ? dueAfterClosing(mine, closeDate) : null;
  const prevName = format(shiftMonth(cursor, -1), "MMMM", { locale: es });
  const nextName = format(shiftMonth(cursor, 1), "MMMM", { locale: es });
  const laterName = format(shiftMonth(cursor, 2), "MMMM", { locale: es });
  const olderName = format(shiftMonth(cursor, -2), "MMMM", { locale: es });
  const beforeTotal = billBefore.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const afterTotal = billAfter.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const nextTotal = sumsNext.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const laterTotal = sumsLater.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const beforeMine = spendOnCard(billBefore, mine?.id ?? null, toArs);
  const beforePapa = spendOnCard(billBefore, papa?.id ?? null, toArs);
  const closeLabel = closeDate ? format(closeDate, "d/M") : null;
  const dueLabel = dueDate ? format(dueDate, "d/M") : null;
  const cats = categoryOriginSplit(cashMoves, openCardTx, categories, mine?.id ?? null, papa?.id ?? null, toArs);
  const services = [...recurring].sort((a, b) => a.name.localeCompare(b.name, "es"));

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

  function toggleName(current: string[], name: string) {
    return current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
  }

  function movesFor(name: string) {
    const papaId = papa?.id ?? null;
    const matched = monthMoves.filter((t) => {
      const raw = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
      return groupCategory(raw) === name;
    });
    return {
      plata: matched.filter((t) => t.payment_method !== "tarjeta_credito"),
      mia: matched.filter((t) => t.payment_method === "tarjeta_credito" && t.credit_card_id !== papaId),
      extension: matched.filter((t) => Boolean(papaId) && t.credit_card_id === papaId),
    };
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

  function serviceCard(r: RecurringPayment) {
    const via = recurringVia(r);
    if (via.onCard) {
      const onCard = cardCoversRecurring(r, transactions, cursor);
      const extension = Boolean(papa && via.cardId === papa.id);
      return (
        <button
          key={r.id}
          type="button"
          onClick={() => selectFixed(r)}
          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight">{r.name}</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums">
            {formatMoney(Number(r.amount), r.currency)}
          </p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">
            {extension ? "Extensión" : "Mi tarjeta"}
            {onCard ? " · en resumen" : " · se debita"}
          </p>
        </button>
      );
    }
    const isPaid = cashRecurringPaid(r, transactions, cursor, isCurrent);
    const linked = linkedPay(r);
    return (
      <div
        key={r.id}
        className={cn(
          "rounded-md border px-1.5 py-1",
          isPaid ? "border-emerald-500/30 bg-emerald-500/10" : "border-teal-500/30 bg-teal-500/10",
        )}
      >
        <button type="button" className="w-full text-left" onClick={() => selectFixed(r)}>
          <p className="truncate text-[11px] font-medium leading-tight">{r.name}</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums">
            {formatMoney(Number(r.amount), r.currency)}
          </p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">
            {isPaid
              ? `PAGADO${linked ? ` ${format(parseISO(linked.occurred_on), "d/M")}` : ""}`
              : `Día ${r.due_day}`}
          </p>
        </button>
        {!isFuture && !isPaid ? (
          <Button
            size="sm"
            className="mt-1 h-6 w-full px-1 text-[10px]"
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
        {isPaid ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-6 w-full px-1 text-[10px]"
            onClick={() => guard(() => setUnpayAsk(r), isPast)}
          >
            Deshacer
          </Button>
        ) : null}
      </div>
    );
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

  async function saveClose(event: FormEvent) {
    event.preventDefault();
    if (!mine) return;
    const day = Math.min(28, Math.max(1, Number(closeDay) || closingDay));
    setSavingClose(true);
    try {
      await updateCard(mine.id, { closing_day: day, due_day: mine.due_day });
      toast.success(`Cierre guardado: día ${day}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el cierre");
    } finally {
      setSavingClose(false);
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {isFuture
                ? "Te quedaría de tu sueldo"
                : isCurrent
                  ? "Te queda de tu sueldo"
                  : "Te quedó de tu sueldo"}
              {estimated ? " (estimado)" : ""}
            </p>
            <p className="text-xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
              {hideSueldo ? "••••••" : formatMoney(wallet.queda, "ARS")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label={hideSueldo ? "Mostrar sueldo" : "Ocultar sueldo"}
            onClick={() => setHideSueldo((v) => !v)}
          >
            {hideSueldo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
        {billMine > 0 ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Si pagás el resumen que llegó ({formatMoney(billMine, "ARS")}), te quedarían {formatMoney(quedaSiPagaVisa, "ARS")}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-2">
        <p className="text-[11px] font-medium text-violet-950 dark:text-violet-100">
          En {prevName}, antes del cierre
        </p>
        {papa ? (
          <div className="mt-1 grid grid-cols-2 gap-1">
            <div>
              <p className="text-[10px] text-violet-900/80 dark:text-violet-100/80">Mi tarjeta</p>
              <p className="text-sm font-semibold tabular-nums text-violet-950 dark:text-violet-50">
                {formatMoney(beforeMine, "ARS")}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-fuchsia-900/80 dark:text-fuchsia-100/80">Extensión</p>
              <p className="text-sm font-semibold tabular-nums text-fuchsia-950 dark:text-fuchsia-50">
                {formatMoney(beforePapa, "ARS")}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold tabular-nums text-violet-950 dark:text-violet-50">
            {formatMoney(beforeTotal, "ARS")}
          </p>
        )}
        <p className="text-[10px] leading-tight text-violet-900/80 dark:text-violet-100/80">
          {papa ? `Juntas ${formatMoney(beforeTotal, "ARS")}. ` : ""}
          Eso se suma en este mes.
        </p>
        {afterTotal > 0 ? (
          <p className="mt-1 text-[10px] leading-tight text-violet-900/80 dark:text-violet-100/80">
            De {olderName}, después del cierre: {formatMoney(afterTotal, "ARS")}. También entra en este mes.
          </p>
        ) : null}
        <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
          Lo que cargás ahora se ve en este mes.
          {nextTotal > 0 ? ` ${formatMoney(nextTotal, "ARS")} de antes del día ${closingDay} se suma en ${nextName}.` : ""}
          {laterTotal > 0 ? ` ${formatMoney(laterTotal, "ARS")} de después del cierre se suma en ${laterName}.` : ""}
        </p>
        {mine ? (
          <form className="mt-2 flex items-end gap-2" onSubmit={(e) => void saveClose(e)}>
            <label className="min-w-0 flex-1 text-[10px] text-muted-foreground">
              Día de cierre
              <Input
                className="mt-1 h-8"
                inputMode="numeric"
                value={closeDay}
                onChange={(e) => setCloseDay(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" className="h-8 px-2 text-xs" disabled={savingClose}>
              Guardar cierre
            </Button>
          </form>
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

      <div className="grid grid-cols-2 gap-1">
        <Link
          href={`/resumen/origen/plata?mes=${mes}`}
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight text-amber-800 dark:text-amber-200">Mi sueldo</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums text-amber-950 dark:text-amber-100">
            {hideSueldo ? "••••" : formatMoney(wallet.gastadoContado, "ARS")}
          </p>
        </Link>
        <Link
          href={`/resumen/origen/visa?mes=${mes}`}
          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight text-violet-800 dark:text-violet-200">Mi tarjeta</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums text-violet-950 dark:text-violet-100">
            {formatMoney(visaMia, "ARS")}
          </p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">
            este mes
            {closeLabel ? ` · cierra ${closeLabel}` : ""}
          </p>
        </Link>
        {papa ? (
          <Link
            href={`/resumen/origen/papa?mes=${mes}`}
            className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-1 text-left"
          >
            <p className="truncate text-[11px] font-medium leading-tight text-fuchsia-800 dark:text-fuchsia-200">Extensión</p>
            <p className="text-[11px] font-semibold leading-tight tabular-nums text-fuchsia-950 dark:text-fuchsia-100">
              {formatMoney(visaPapa, "ARS")}
            </p>
            <p className="truncate text-[9px] leading-tight text-muted-foreground">
              papá · este mes
              {closeLabel ? ` · cierra ${closeLabel}` : ""}
            </p>
          </Link>
        ) : null}
        {papa ? (
          <div className="rounded-md border border-border bg-muted/40 px-1.5 py-1 text-left">
            <p className="truncate text-[11px] font-medium leading-tight">Juntas</p>
            <p className="text-[11px] font-semibold leading-tight tabular-nums">{formatMoney(tarjetaAbierta, "ARS")}</p>
            <p className="truncate text-[9px] leading-tight text-muted-foreground">
              mi tarjeta y la extensión van aparte
              {dueLabel ? ` · vence ${dueLabel}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {cats.length > 0 ? (
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium">Por categoría</h2>
          <div className="grid grid-cols-3 gap-1">
            {cats.map((row) => {
              const open = openCats.includes(row.name);
              const moves = open ? movesFor(row.name) : null;
              const parts = [
                row.ingreso > 0 ? `Entró ${formatMoney(row.ingreso, "ARS")}` : null,
                row.sueldo > 0 ? `Sueldo ${formatMoney(row.sueldo, "ARS")}` : null,
                row.visa > 0 ? `Mía ${formatMoney(row.visa, "ARS")}` : null,
                row.papa > 0 ? `Ext. ${formatMoney(row.papa, "ARS")}` : null,
              ].filter(Boolean);
              return (
                <div key={row.name} className={open ? "col-span-3" : ""}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCats((current) => toggleName(current, row.name))}
                    className={cn(
                      "flex w-full items-start justify-between gap-1 rounded-md border px-1.5 py-1 text-left",
                      categoryChipClass(groupCategory(row.name)),
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium leading-tight">{row.name}</span>
                      <span className="block text-[11px] font-semibold leading-tight tabular-nums">
                        {row.total > 0 ? formatMoney(row.total, "ARS") : row.ingreso > 0 ? `+${formatMoney(row.ingreso, "ARS")}` : formatMoney(0, "ARS")}
                      </span>
                      <span className="block truncate text-[9px] leading-tight text-muted-foreground">
                        {parts.join(" · ") || "—"}
                      </span>
                    </span>
                    {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  </button>
                  {open && moves ? (
                    <div className="mt-1 space-y-2 rounded-md border border-border bg-background p-1.5">
                      {moves.plata.length === 0 && moves.mia.length === 0 && moves.extension.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Nada de esta categoría en este mes.</p>
                      ) : null}
                      {moves.plata.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground">En plata</p>
                          {moves.plata.map((t) => (
                            <MovementRow
                              key={t.id}
                              tx={t}
                              categories={categories}
                              cards={cards}
                              installments={installments}
                              onSelect={selectTx}
                            />
                          ))}
                        </div>
                      ) : null}
                      {moves.mia.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-violet-800 dark:text-violet-200">Mi tarjeta</p>
                          {moves.mia.map((t) => (
                            <MovementRow
                              key={t.id}
                              tx={t}
                              categories={categories}
                              cards={cards}
                              installments={installments}
                              onSelect={selectTx}
                            />
                          ))}
                        </div>
                      ) : null}
                      {moves.extension.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-fuchsia-800 dark:text-fuchsia-200">Extensión</p>
                          {moves.extension.map((t) => (
                            <MovementRow
                              key={t.id}
                              tx={t}
                              categories={categories}
                              cards={cards}
                              installments={installments}
                              onSelect={selectTx}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {services.length > 0 ? (
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium">Servicios</h2>
          <p className="text-[11px] text-muted-foreground">
            Gastos de cada mes, como luz, gas o YouTube. Las cuotas no entran acá.
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">{services.map((item) => serviceCard(item))}</div>
        </div>
      ) : null}

      <div className="space-y-1.5 pb-4">
        <h2 className="text-xs font-medium">Cada movimiento</h2>
        <p className="text-[11px] text-muted-foreground">
          {isFuture
            ? "Cuotas y fijos que se van a descontar."
            : "Orden A-Z. Filtrá por tipo, valor o categoría. Plata ahora no es lo de la tarjeta."}
        </p>
        <MonthMoves
          transactions={monthMoves}
          categories={categories}
          cards={cards}
          installments={installments}
          toArs={toArs}
          onSelect={selectTx}
        />
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
                <option value="transferencia">Transferencia</option>
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

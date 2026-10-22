"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PinGate } from "@/components/entry/pin-gate";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useDropInstallment } from "@/hooks/use-drop-installment";
import { useEditGate } from "@/hooks/use-edit-gate";
import { useMonthView } from "@/hooks/use-month-view";
import { parseCloseOn, shortMonth } from "@/lib/finance/close-cycle";
import { planIdFromProjectedCuota } from "@/lib/finance/installment-drop";
import { cashRecurringPaid, cursorFromMes, isProjectedTx } from "@/lib/finance/month-view";
import { monthIncomeSplit } from "@/lib/finance/month-brief";
import { cardCoversRecurring, findRecurringByName, recurringVia, shownRecurring } from "@/lib/finance/recurring";
import { categoryChipClass, groupCategory } from "@/lib/finance/style";
import { carryOverNote, inCurrentMonth, shiftMonth } from "@/lib/finance/wallet";
import { cn, formatMoney, isoDate, monthKey } from "@/lib/utils";
import type { CreditCard, PaymentMethod, RecurringPayment, Transaction } from "@/lib/types";

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
    monthMoves,
    closeOn,
    prevClose,
    periodStart,
    periodEnd,
    laterStart,
    laterEnd,
    cardHitsNext,
    cardHitsLater,
    cardDue,
    visaMia,
    visaPapa,
    tarjetaAbierta,
    canGoPrev,
    salaryMonthFor,
    saveMonthClose,
    cycleCard,
  } = view;
  const { unlocked, askPin, pinError, guard, submitPin, closePin } = useEditGate();
  const dropInstallment = useDropInstallment();
  const canEdit = !isPast || unlocked;
  const [hideSueldo, setHideSueldo] = useState(true);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [source, setSource] = useState("todas");

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const [payAsk, setPayAsk] = useState<RecurringPayment | null>(null);
  const [payDate, setPayDate] = useState(isoDate(new Date()));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [unpayAsk, setUnpayAsk] = useState<RecurringPayment | null>(null);

  const viewedMonth = monthKey(cursor);
  const services = [...recurring]
    .filter((item) => shownRecurring(item, viewedMonth, transactions))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  function labelFor(card: CreditCard) {
    if (mine && card.id === mine.id) return "Visa mía";
    if (papa && card.id === papa.id) return "Extensión";
    if (card.kind === "extension") return card.name;
    return card.name;
  }

  function sourceOf(tx: Transaction) {
    if (tx.payment_method !== "tarjeta_credito") return { id: "plata", label: "Plata" };
    const card = cards.find((item) => item.id === tx.credit_card_id);
    if (!card) return { id: tx.credit_card_id || "otra", label: "Otra tarjeta" };
    return { id: card.id, label: labelFor(card) };
  }

  const chipCards = [
    ...(mine ? [mine] : []),
    ...(papa && papa.id !== mine?.id ? [papa] : []),
    ...cards.filter((card) => card.id !== mine?.id && card.id !== papa?.id),
  ];

  function spendOf(id: string) {
    return monthMoves
      .filter((tx) => tx.type === "egreso" && sourceOf(tx).id === id)
      .reduce((sum, tx) => sum + toArs(Number(tx.amount), tx.currency), 0);
  }

  const filteredMoves = monthMoves.filter((tx) => source === "todas" || sourceOf(tx).id === source);

  const categoryRows = (() => {
    const buckets = new Map<
      string,
      { name: string; total: number; ingreso: number; cardBySalary: Map<string, number>; txs: Transaction[] }
    >();
    for (const tx of filteredMoves) {
      const raw = categories.find((item) => item.id === tx.category_id)?.name ?? (tx.type === "ingreso" ? "Ingresos" : "Sin categoría");
      const name = groupCategory(raw);
      const row = buckets.get(name) ?? {
        name,
        total: 0,
        ingreso: 0,
        cardBySalary: new Map<string, number>(),
        txs: [] as Transaction[],
      };
      const amount = toArs(Number(tx.amount), tx.currency);
      if (tx.type === "ingreso") row.ingreso += amount;
      else {
        row.total += amount;
        if (tx.payment_method === "tarjeta_credito") {
          const salary = salaryMonthFor(tx.occurred_on);
          if (salary) {
            const key = monthKey(salary);
            row.cardBySalary.set(key, (row.cardBySalary.get(key) ?? 0) + amount);
          }
        }
      }
      row.txs.push(tx);
      buckets.set(name, row);
    }
    return [...buckets.values()].sort((a, b) => Math.max(b.total, b.ingreso) - Math.max(a.total, a.ingreso));
  })();

  function splitLine(txs: Transaction[]) {
    const sums = new Map<string, { label: string; amount: number; order: number }>();
    for (const tx of txs) {
      if (tx.type === "ingreso") continue;
      const src = sourceOf(tx);
      const order = src.id === mine?.id ? 0 : src.id === papa?.id ? 1 : src.id === "plata" ? 9 : 2;
      const current = sums.get(src.id) ?? { label: src.label, amount: 0, order };
      current.amount += toArs(Number(tx.amount), tx.currency);
      sums.set(src.id, current);
    }
    return [...sums.values()]
      .filter((item) => item.amount > 0)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"))
      .map((item) => `${item.label} ${formatMoney(item.amount, "ARS")}`);
  }

  function rhythmOf(tx: Transaction) {
    const item = findRecurringByName(recurring, tx.concept);
    if (!item) return null;
    if (item.frequency === "semanal") return "Semanal";
    if (item.frequency === "anual") return "Anual";
    return "Mensual";
  }

  function groupsFor(txs: Transaction[]) {
    const groups = new Map<string, { label: string; order: number; txs: Transaction[] }>();
    for (const tx of txs) {
      const src = sourceOf(tx);
      const order = src.id === mine?.id ? 0 : src.id === papa?.id ? 1 : src.id === "plata" ? 9 : 2;
      const group = groups.get(src.id) ?? { label: src.label, order, txs: [] };
      group.txs.push(tx);
      groups.set(src.id, group);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"));
  }

  const linkedPay = (r: RecurringPayment) =>
    transactions.find(
      (t) =>
        t.source === "recurrente" &&
        t.concept === r.name &&
        t.type === "egreso" &&
        t.payment_method !== "tarjeta_credito" &&
        inCurrentMonth(t.occurred_on, cursor),
    );

  const nextName = format(shiftMonth(cursor, 1), "MMMM", { locale: es });
  const income = monthIncomeSplit(transactions, categories, toArs, cursor);
  const sueldoMes = estimated && income.sueldo <= 0 ? wallet.cobrado : income.sueldo;
  const ingresosMes = estimated ? 0 : income.ingresos;
  const masked = (amount: number) => (hideSueldo ? "••••••" : formatMoney(amount, "ARS"));
  const laterName = format(shiftMonth(cursor, 2), "MMMM", { locale: es });
  const periodOk = periodStart <= periodEnd;

  function dayLabel(iso: string) {
    const [year, month, day] = iso.split("-").map(Number);
    return format(new Date(year, (month || 1) - 1, day || 1), "dd/MM", { locale: es });
  }

  function salaryLabel(key: string) {
    const [year, month] = key.split("-").map(Number);
    return shortMonth(new Date(year, (month || 1) - 1, 1));
  }

  function onCloseDate(month: Date, value: string) {
    if (!cycleCard || !value) return;
    const closingOn = parseCloseOn(value);
    if (!closingOn) return;
    guard(() => {
      void saveMonthClose(cycleCard.id, monthKey(month), closingOn)
        .then(() => toast.success("Cierre guardado"))
        .catch((err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar el cierre"));
    }, isPast);
  }

  function goMonth(delta: number) {
    const next = shiftMonth(cursor, delta);
    setCursor(next);
    router.replace(`/resumen?mes=${monthKey(next)}`, { scroll: false });
  }

  function toggleName(current: string[], name: string) {
    return current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
  }

  function selectTx(tx: Transaction) {
    if (planIdFromProjectedCuota(tx.id)) {
      guard(() => {
        void dropInstallment(tx);
      }, isPast);
      return;
    }
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
    const shown = shownRecurring(r, viewedMonth, transactions);
    if (!shown) return null;
    const via = recurringVia(r);
    const catName = categories.find((item) => item.id === r.category_id)?.name;
    if (shown.voided) {
      return (
        <button
          key={r.id}
          type="button"
          onClick={() => selectFixed(r)}
          className="rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight">{r.name}</p>
          <p className="text-[11px] font-semibold leading-tight">Anulado</p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">Mensual · no se descuenta</p>
        </button>
      );
    }
    if (via.onCard) {
      const onCard = cardCoversRecurring(r, transactions, cursor);
      const card = cards.find((item) => item.id === via.cardId) ?? (via.cardId === papa?.id ? papa : mine);
      return (
        <button
          key={r.id}
          type="button"
          onClick={() => selectFixed(r)}
          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-left"
        >
          <p className="truncate text-[11px] font-medium leading-tight">{r.name}</p>
          <p className="text-[11px] font-semibold leading-tight tabular-nums">
            {formatMoney(shown.amount, shown.currency)}
          </p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">
            {catName ? `${catName} · ` : ""}
            {r.frequency === "semanal" ? "Semanal · " : "Mensual · "}
            {card ? labelFor(card) : "Tarjeta"}
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
            {formatMoney(shown.amount, shown.currency)}
          </p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">
            {catName ? `${catName} · ` : ""}
            {r.frequency === "semanal" ? "Semanal · " : "Mensual · "}
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
      const shown = shownRecurring(r, viewedMonth, transactions);
      await saveTransaction({
        type: "egreso",
        amount: shown?.amount ?? Number(r.amount),
        currency: shown?.currency ?? r.currency,
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            disabled={!canGoPrev}
            onClick={() => goMonth(-1)}
          >
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
            <p className="text-[11px] text-muted-foreground">
              Sueldo, ingresos, las dos tarjetas y la transferencia, abajo.
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
      </div>

      <section className="rounded-md border border-border px-2 py-2">
        <h2 className="text-xs font-medium">Resumen</h2>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Entra</p>
            <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span>Sueldo{estimated ? " estimado" : ""}</span>
              <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">{masked(sueldoMes)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2 text-[11px]">
              <span>Ingresos</span>
              <span className="font-semibold tabular-nums">{ingresosMes > 0 ? masked(ingresosMes) : "—"}</span>
            </p>
            {ingresosMes > 0 && income.detalle.length > 0 ? (
              <p className="truncate text-[10px] text-muted-foreground">{income.detalle.slice(0, 3).join(" · ")}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">Además del sueldo.</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sale</p>
            <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span>Las dos tarjetas</span>
              <span className="font-semibold tabular-nums">{formatMoney(tarjetaAbierta, "ARS")}</span>
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Visa mía {formatMoney(visaMia, "ARS")} · Extensión {formatMoney(visaPapa, "ARS")}
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {tarjetaAbierta > 0 ? `Se abonan en ${nextName}.` : "Sin consumo en las tarjetas."}
            </p>
            {cardDue.total > 0 ? (
              <p className="mt-1 text-[11px] leading-tight">
                Este mes se debitan{" "}
                <span className="font-semibold tabular-nums">{formatMoney(cardDue.total, "ARS")}</span>
                <span className="block text-[10px] text-muted-foreground">
                  Visa mía {formatMoney(cardDue.visa, "ARS")} · Extensión {formatMoney(cardDue.extension, "ARS")}
                </span>
              </p>
            ) : null}
            <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span>Efectivo y transferencia</span>
              <span className="font-semibold tabular-nums">{formatMoney(wallet.gastadoContado, "ARS")}</span>
            </p>
          </div>
        </div>
      </section>

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

      {cycleCard ? (
        <section className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs font-medium" htmlFor="cierre-anterior">
              Cierre anterior
              <input
                id="cierre-anterior"
                type="date"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={prevClose}
                onChange={(event) => onCloseDate(shiftMonth(cursor, -1), event.target.value)}
              />
            </label>
            <label className="min-w-0 text-xs font-medium" htmlFor="cierre-tarjeta">
              Este cierre
              <input
                id="cierre-tarjeta"
                type="date"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={closeOn}
                onChange={(event) => onCloseDate(cursor, event.target.value)}
              />
            </label>
          </div>
          {periodOk ? (
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              Del {dayLabel(periodStart)} al {dayLabel(periodEnd)} lo ves en el mes del consumo y descuenta en {nextName}.
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-snug text-destructive">
              El cierre anterior tiene que ser antes de este cierre.
            </p>
          )}
          <p className="mt-1 text-sm font-semibold">
            Descuenta en {nextName} {formatMoney(cardHitsNext, "ARS")}
          </p>
          {cardHitsLater > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Del {dayLabel(laterStart)} al {dayLabel(laterEnd)} descuenta en {laterName}{" "}
              {formatMoney(cardHitsLater, "ARS")}.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSource("todas")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
            source === "todas" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
          )}
        >
          Todas
        </button>
        {chipCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setSource(card.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              source === card.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {labelFor(card)} {formatMoney(spendOf(card.id), "ARS")}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSource("plata")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
            source === "plata" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
          )}
        >
          Plata {formatMoney(spendOf("plata"), "ARS")}
        </button>
      </div>

      {categoryRows.length > 0 ? (
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium">Categorías</h2>
          <div className="space-y-1">
            {categoryRows.map((row) => {
              const open = openCats.includes(row.name);
              const egresos = row.txs.filter((tx) => tx.type === "egreso");
              const marks = [...new Set(egresos.map((tx) => rhythmOf(tx) ?? ""))].filter(Boolean);
              const onlyMark = marks.length === 1 && egresos.every((tx) => rhythmOf(tx) === marks[0]) ? marks[0].toUpperCase() : null;
              const parts = source === "todas" ? splitLine(row.txs) : [];
              const detail = [onlyMark, ...parts].filter(Boolean).join(" · ");
              const groups = open ? groupsFor(row.txs) : [];
              return (
                <div key={row.name}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCats((current) => toggleName(current, row.name))}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left",
                      categoryChipClass(groupCategory(row.name)),
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium leading-tight">{row.name}</span>
                      {detail ? (
                        <span className="block truncate text-[11px] leading-tight text-muted-foreground">{detail}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-right text-sm font-semibold tabular-nums">
                      <span>
                        {row.ingreso > 0 && row.total === 0
                          ? `+${formatMoney(row.ingreso, "ARS")}`
                          : row.total > 0
                            ? formatMoney(row.total, "ARS")
                            : null}
                        {[...row.cardBySalary.entries()]
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, amount]) => (
                            <span key={key} className="block text-[11px] font-medium text-violet-800 dark:text-violet-200">
                              Descuenta en {salaryLabel(key)} {formatMoney(amount, "ARS")}
                            </span>
                          ))}
                      </span>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                  {open ? (
                    <div className="mt-1 space-y-2 rounded-md border border-border bg-background p-1.5">
                      {groups.map((group) => (
                        <div key={group.label} className="space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground">{group.label}</p>
                          {group.txs.map((tx) => (
                            <MovementRow
                              key={tx.id}
                              tx={tx}
                              categories={categories}
                              cards={cards}
                              installments={installments}
                              tag={rhythmOf(tx)}
                              onSelect={selectTx}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nada en este mes para ese filtro.</p>
      )}

      {services.length > 0 || cardDue.total > 0 ? (
        <div className="space-y-1.5 pb-4">
          <h2 className="text-xs font-medium">Mensual</h2>
          <p className="text-[11px] text-muted-foreground">
            Siguen en su categoría. Acá los marcás pagados. El total de la tarjeta cae en el mes en que se abona.
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {cardDue.total > 0 ? (
              <div className="rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-1">
                <p className="truncate text-[11px] font-medium leading-tight">TARJETA TOTAL</p>
                <p className="text-[11px] font-semibold leading-tight tabular-nums">{formatMoney(cardDue.total, "ARS")}</p>
                <p className="text-[9px] leading-tight text-muted-foreground">
                  Visa mía {formatMoney(cardDue.visa, "ARS")}
                </p>
                <p className="text-[9px] leading-tight text-muted-foreground">
                  Extensión {formatMoney(cardDue.extension, "ARS")}
                </p>
                <p className="text-[9px] leading-tight text-muted-foreground">Mensual · se abona este mes</p>
              </div>
            ) : null}
            {services.map((item) => serviceCard(item))}
          </div>
        </div>
      ) : null}

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <RecurringEdit
        item={editingFixed}
        asOfMonth={viewedMonth}
        open={Boolean(editingFixed)}
        onOpenChange={(v) => !v && setEditingFixed(null)}
      />
      <PinGate open={askPin} error={pinError} onClose={closePin} onSubmit={submitPin} />

      <Dialog open={Boolean(payAsk)} onOpenChange={(v) => !v && setPayAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Lo marcás pagado?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {payAsk
              ? `Se descuenta ${formatMoney(shownRecurring(payAsk, viewedMonth, transactions)?.amount ?? Number(payAsk.amount), shownRecurring(payAsk, viewedMonth, transactions)?.currency ?? payAsk.currency)} de tu sueldo por ${payAsk.name}.`
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

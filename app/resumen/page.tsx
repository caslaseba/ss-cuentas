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
import { EdesurMeterPhotos } from "@/components/dashboard/edesur-photos";
import { EdesurSplitDialog } from "@/components/dashboard/edesur-split";
import { EdesurInvoice } from "@/components/dashboard/edesur-invoice";
import { MonthReport } from "@/components/dashboard/month-report";
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
import { brotherSettlement, isEdesurName, splitBillByKwh, type EdesurMonth } from "@/lib/finance/edesur";
import { monthIncomeLines, monthIncomeSplit } from "@/lib/finance/month-brief";
import { BOOKS_START_ISO, cardCoversRecurring, findRecurringByName, recurringVia, shownRecurring } from "@/lib/finance/recurring";
import { categoryChipClass, groupCategory } from "@/lib/finance/style";
import { cardBillNotes, isCardBillPayment } from "@/lib/finance/tx-notes";
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
    cardBillTx,
    salaryCardTx,
    salaryCardFrom,
    salaryCardTo,
    cashMoves,
    settledCardIds,
    visaMia,
    visaPapa,
    tarjetaAbierta,
    canGoPrev,
    salaryMonthFor,
    saveMonthClose,
    cycleCard,
    edesurMonths,
    saveEdesurMonth,
    salarySamples,
  } = view;
  const { unlocked, askPin, pinError, guard, submitPin, closePin } = useEditGate();
  const dropInstallment = useDropInstallment();
  const canEdit = !isPast || unlocked;
  const [hideSueldo, setHideSueldo] = useState(true);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [source, setSource] = useState("todas");
  const [listOrder, setListOrder] = useState<"fecha" | "categoria" | "monto">("monto");
  const [picking, setPicking] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const [payAsk, setPayAsk] = useState<RecurringPayment | null>(null);
  const [cardPayAsk, setCardPayAsk] = useState(false);
  const [payDate, setPayDate] = useState(isoDate(new Date()));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [unpayAsk, setUnpayAsk] = useState<RecurringPayment | null>(null);
  const [edesurAsk, setEdesurAsk] = useState<RecurringPayment | null>(null);

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

  const filteredMoves = monthMoves.filter((tx) => {
    if (source === "ingresos") return tx.type === "ingreso";
    if (source === "todas") return true;
    return sourceOf(tx).id === source;
  });

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
    return [...buckets.values()].sort((a, b) => {
      if (listOrder === "categoria") return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      return Math.max(b.total, b.ingreso) - Math.max(a.total, a.ingreso);
    });
  })();

  const datedMoves = [...filteredMoves].sort(
    (a, b) => b.occurred_on.localeCompare(a.occurred_on) || a.concept.localeCompare(b.concept, "es"),
  );
  const dateGroups = datedMoves.reduce<{ day: string; txs: Transaction[] }[]>((groups, tx) => {
    const last = groups[groups.length - 1];
    if (last?.day === tx.occurred_on) last.txs.push(tx);
    else groups.push({ day: tx.occurred_on, txs: [tx] });
    return groups;
  }, []);

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
    for (const group of groups.values()) {
      group.txs.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || a.concept.localeCompare(b.concept, "es"));
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
  const incomeLines = monthIncomeLines(transactions, toArs, cursor);
  const incomeTotal = incomeLines.reduce((sum, line) => sum + line.amount, 0);
  const edesurReceived = incomeLines
    .filter((line) => isEdesurName(`${line.concept} ${line.note}`))
    .reduce((sum, line) => sum + line.amount, 0);
  const savedEdesur = edesurMonths.find((item) => item.month === viewedMonth) ?? null;
  const edesurSplit = savedEdesur
    ? splitBillByKwh({
        totalKwh: savedEdesur.totalKwh,
        totalBill: savedEdesur.totalBill,
        mineKwh: savedEdesur.mineKwh,
        brotherKwh: savedEdesur.brotherKwh,
      })
    : null;
  const edesurBalance = edesurSplit ? brotherSettlement(edesurSplit.brother, edesurReceived) : null;
  const monthName = format(cursor, "MMMM", { locale: es });
  const salaryNote = estimated
    ? salarySamples.length
      ? `El sueldo estimado sale del promedio de tu sueldo cobrado: ${salarySamples
          .map((sample) => {
            const [year, month] = sample.month.split("-").map(Number);
            const name = format(new Date(year, (month || 1) - 1, 1), "MMMM yyyy", { locale: es });
            return `${name} ${formatMoney(sample.amount, "ARS")}`;
          })
          .join(", ")}. Mira hasta 6 meses atrás y usa como máximo 3 cobros. Los otros ingresos no entran.`
      : "Todavía no hay un sueldo cobrado para estimar este mes."
    : null;
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

  function edesurLine(name: string) {
    if (!isEdesurName(name) || !edesurSplit || !edesurBalance) return null;
    const status =
      edesurBalance.kind === "cubierto"
        ? "cubrió su parte"
        : edesurBalance.kind === "demas"
          ? `pasó de más ${formatMoney(edesurBalance.amount, "ARS")}`
          : `le faltan ${formatMoney(edesurBalance.amount, "ARS")}`;
    return (
      <p className="text-[9px] leading-tight text-muted-foreground">
        Yo {formatMoney(edesurSplit.mine, "ARS")} · Hermano {formatMoney(edesurSplit.brother, "ARS")} · {status}
      </p>
    );
  }

  async function saveEdesur(input: Pick<EdesurMonth, "totalKwh" | "totalBill" | "mineKwh" | "brotherKwh">) {
    await saveEdesurMonth({ month: viewedMonth, ...input });
    toast.success(`Reparto de EDESUR guardado en ${monthName}`);
  }

  function repartirKwh(r: RecurringPayment) {
    if (!isEdesurName(r.name)) return null;
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-1 h-6 w-full px-1 text-[10px]"
        onClick={() => setEdesurAsk(r)}
      >
        Repartir kWh
      </Button>
    );
  }

  function serviceCard(r: RecurringPayment) {
    const shown = shownRecurring(r, viewedMonth, transactions);
    if (!shown) return null;
    const via = recurringVia(r);
    const catName = categories.find((item) => item.id === r.category_id)?.name;
    if (shown.voided) {
      const voidedBody = (
        <>
          <p className="truncate text-[11px] font-medium leading-tight">{r.name}</p>
          <p className="text-[11px] font-semibold leading-tight">Anulado</p>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">Mensual · no se descuenta</p>
        </>
      );
      if (isEdesurName(r.name)) {
        return (
          <div key={r.id} className="rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-1">
            <button type="button" className="w-full text-left" onClick={() => selectFixed(r)}>
              {voidedBody}
            </button>
            {repartirKwh(r)}
          </div>
        );
      }
      return (
        <button
          key={r.id}
          type="button"
          onClick={() => selectFixed(r)}
          className="rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-1 text-left"
        >
          {voidedBody}
        </button>
      );
    }
    if (via.onCard) {
      const onCard = cardCoversRecurring(r, transactions, cursor);
      const card = cards.find((item) => item.id === via.cardId) ?? (via.cardId === papa?.id ? papa : mine);
      const body = (
        <>
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
          {edesurLine(r.name)}
        </>
      );
      if (isEdesurName(r.name)) {
        return (
          <div key={r.id} className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1">
            <button type="button" className="w-full text-left" onClick={() => selectFixed(r)}>
              {body}
            </button>
            {repartirKwh(r)}
          </div>
        );
      }
      return (
        <button
          key={r.id}
          type="button"
          onClick={() => selectFixed(r)}
          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-left"
        >
          {body}
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
          {edesurLine(r.name)}
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
        {repartirKwh(r)}
      </div>
    );
  }

  function dateInViewedMonth(iso: string) {
    if (iso.slice(0, 7) === viewedMonth) return iso;
    const day = Math.min(28, Math.max(1, Number(iso.slice(8, 10)) || 1));
    return `${viewedMonth}-${String(day).padStart(2, "0")}`;
  }

  const cardPayments = transactions.filter(
    (tx) => tx.type === "egreso" && tx.payment_method !== "tarjeta_credito" && isCardBillPayment(tx.notes, viewedMonth),
  );
  const cardPaid = cardDue.total <= 0 && cardPayments.length > 0;
  const cardPaidAmount = cardPayments.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const reportCardPaid = cardPayments.reduce((sum, tx) => sum + toArs(Number(tx.amount), tx.currency), 0);
  const reportOutflows = cashMoves.filter((tx) => tx.type === "egreso" && !isCardBillPayment(tx.notes, viewedMonth));
  const cardCoverage =
    salaryCardTo < BOOKS_START_ISO
      ? "Este sueldo no arrastra tarjeta: el período anterior cerró antes de octubre de 2026. El primer informe completo es noviembre, con la tarjeta de octubre."
      : salaryCardFrom < BOOKS_START_ISO
        ? "En los libros entra el consumo desde el 01/10 hasta el cierre. Noviembre es el primer mes con el resumen completo de esa tarjeta."
        : "";
  const cardPaymentNote =
    reportCardPaid > 0 && cardDue.total <= 0
      ? "La transferencia de esta tarjeta ya salió de este sueldo."
      : cardDue.total > 0
        ? "Todavía no está toda transferida. Lo que falta se descuenta igual, porque se paga con este sueldo."
        : "No hay consumos de tarjeta cargados para este sueldo.";
  const cardNote = [cardCoverage, cardPaymentNote].filter(Boolean).join(" ");

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
        occurred_on: dateInViewedMonth(payDate || isoDate(new Date())),
        source: "recurrente",
      });
      toast.success(`Marcado pagado: ${r.name}. Descuenta el sueldo de este mes.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar pagado");
    }
  }

  async function confirmCardPay() {
    if (cardDue.total <= 0 || cardPaid) return;
    setCardPayAsk(false);
    try {
      await saveTransaction({
        type: "egreso",
        amount: cardDue.total,
        currency: "ARS",
        concept: "TARJETA TOTAL",
        payment_method: "transferencia",
        occurred_on: dateInViewedMonth(payDate || isoDate(new Date())),
        notes: cardBillNotes(viewedMonth, cardBillTx.map((tx) => tx.id)),
        source: "manual",
      });
      toast.success("Tarjeta pagada. Descuenta el sueldo de este mes.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar la tarjeta");
    }
  }

  async function confirmCardUnpay() {
    if (!cardPayments.length) return;
    try {
      for (const tx of cardPayments) await deleteTransaction(tx.id);
      toast.success("Pago de la tarjeta anulado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo deshacer");
    }
  }

  function togglePick(tx: Transaction) {
    setPickedIds((current) => (current.includes(tx.id) ? current.filter((id) => id !== tx.id) : [...current, tx.id]));
  }

  function togglePickIds(ids: string[]) {
    setPickedIds((current) => {
      const allOn = ids.every((id) => current.includes(id));
      if (allOn) return current.filter((id) => !ids.includes(id));
      return [...new Set([...current, ...ids])];
    });
  }

  const pickedRows = filteredMoves.filter((tx) => pickedIds.includes(tx.id));
  const pickedCards = pickedRows.filter((tx) => tx.type === "egreso" && tx.payment_method === "tarjeta_credito");
  const pickedCash = pickedRows.filter((tx) => tx.type === "egreso" && tx.payment_method !== "tarjeta_credito");
  const settledCardSet = new Set(settledCardIds);
  const pickedPayable = pickedCards.filter((tx) => !isProjectedTx(tx) && !settledCardSet.has(tx.id));
  const pickedPayableSum = pickedPayable.reduce((sum, tx) => sum + toArs(Number(tx.amount), tx.currency), 0);
  const pickedCashSum = pickedCash.reduce((sum, tx) => sum + toArs(Number(tx.amount), tx.currency), 0);
  const allVisiblePicked = filteredMoves.length > 0 && filteredMoves.every((tx) => pickedIds.includes(tx.id));

  async function payPickedCards() {
    if (!pickedPayable.length) {
      toast.error(
        pickedCards.some((tx) => isProjectedTx(tx))
          ? "Esos gastos todavía no se debitaron."
          : "Esos gastos de tarjeta ya descuentan el sueldo.",
      );
      return;
    }
    try {
      await saveTransaction({
        type: "egreso",
        amount: pickedPayableSum,
        currency: "ARS",
        concept: pickedPayable.length === 1 ? `TARJETA ${pickedPayable[0].concept}` : `TARJETA · ${pickedPayable.length} gastos`,
        payment_method: "transferencia",
        occurred_on: dateInViewedMonth(isoDate(new Date())),
        notes: cardBillNotes(viewedMonth, pickedPayable.map((tx) => tx.id)),
        source: "manual",
      });
      setPickedIds((current) => current.filter((id) => !pickedPayable.some((tx) => tx.id === id)));
      toast.success("Esos gastos de tarjeta descuentan el sueldo de este mes.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descontar");
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

  function downloadPdf() {
    const previous = document.title;
    document.body.dataset.print = "sueldo";
    document.title = `SS Cuentas ${format(cursor, "MMMM yyyy", { locale: es })}`;
    const restore = () => {
      document.title = previous;
      delete document.body.dataset.print;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <>
    <div className={cn("no-print mx-auto w-full min-w-0 max-w-lg space-y-3 md:max-w-2xl", picking && "pb-24")}>
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
            {salaryNote ? <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{salaryNote}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              title="PDF de lo que se paga con este sueldo"
              onClick={downloadPdf}
            >
              PDF
            </Button>
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
              <span>Otros ingresos</span>
              <span className="font-semibold tabular-nums">{ingresosMes > 0 ? masked(ingresosMes) : "—"}</span>
            </p>
            {incomeLines.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {incomeLines.map((line) => (
                  <li key={line.id} className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {dayLabel(line.on)} {line.concept}
                      {line.note ? ` · ${line.note}` : ""}
                    </span>
                    <span className="shrink-0 tabular-nums">{masked(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-muted-foreground">Todavía no hay ingresos en este mes.</p>
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
              {tarjetaAbierta > 0
                ? `Del ${dayLabel(prevClose)} al ${dayLabel(closeOn)}. Se abonan en ${nextName}.`
                : "Sin consumo en las tarjetas."}
            </p>
            {cardDue.total > 0 ? (
              <p className="mt-1 text-[11px] leading-tight">
                {cardPaid ? "Tarjeta del mes anterior pagada " : "Tarjeta del mes anterior "}
                <span className="font-semibold tabular-nums">
                  {formatMoney(cardPaid ? cardPaidAmount : cardDue.total, "ARS")}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {cardPaid
                    ? "Ya descuenta el sueldo de este mes."
                    : "Cuando la pagues, o elijas algunos gastos, descuenta el sueldo de este mes."}
                </span>
              </p>
            ) : null}
            <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span>Efectivo y transferencia</span>
              <span className="font-semibold tabular-nums">{formatMoney(wallet.gastadoContado, "ARS")}</span>
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Transferencias y mensuales ya pagados descuentan este sueldo.
            </p>
          </div>
        </div>
      </section>

      {edesurSplit && edesurBalance ? (
        <section className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
          <h2 className="text-xs font-medium">Tu hermano · EDESUR de {monthName}</h2>
          <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span>Le corresponde</span>
            <span className="font-semibold tabular-nums">{formatMoney(edesurSplit.brother, "ARS")}</span>
          </p>
          <p className="flex items-baseline justify-between gap-2 text-[11px]">
            <span>Ya te pasó</span>
            <span className="font-semibold tabular-nums">{formatMoney(edesurReceived, "ARS")}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {edesurBalance.kind === "cubierto"
              ? "Con eso cubre su parte de este mes."
              : edesurBalance.kind === "demas"
                ? `Te pasó ${formatMoney(edesurBalance.amount, "ARS")} de más en este mes.`
                : `Le faltan ${formatMoney(edesurBalance.amount, "ARS")} de este mes.`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {savedEdesur ? `${savedEdesur.mineKwh.toLocaleString("es-AR")} kWh tuyos y ${savedEdesur.brotherKwh.toLocaleString("es-AR")} kWh de él, sobre ${savedEdesur.totalKwh.toLocaleString("es-AR")} kWh.` : null}
          </p>
        </section>
      ) : edesurReceived > 0 ? (
        <section className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
          <h2 className="text-xs font-medium">Tu hermano · EDESUR de {monthName}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ya te entró {formatMoney(edesurReceived, "ARS")}. El reparto de esta factura todavía no está guardado.
          </p>
        </section>
      ) : null}

      <section className="rounded-md border border-border px-2 py-2">
        <EdesurMeterPhotos month={viewedMonth} monthLabel={monthName} />
      </section>

      <EdesurInvoice
        month={viewedMonth}
        monthLabel={monthName}
        split={edesurSplit}
        totalKwh={savedEdesur?.totalKwh ?? 0}
        totalBill={savedEdesur?.totalBill ?? 0}
        mineKwh={savedEdesur?.mineKwh ?? 0}
        brotherKwh={savedEdesur?.brotherKwh ?? 0}
        onNeedNumbers={() => {
          const item = recurring.find((row) => isEdesurName(row.name));
          if (item) setEdesurAsk(item);
          toast.error("Primero indicá el total de la factura y los kWh de cada uno, y guardalo en este mes.");
        }}
      />

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
              Del {dayLabel(prevClose)} al {dayLabel(closeOn)} es el período de las tarjetas. Se abona en {nextName}.
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
        <button
          type="button"
          onClick={() => {
            setSource("ingresos");
            setListOrder("fecha");
          }}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
            source === "ingresos" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
          )}
        >
          Ingresos{hideSueldo ? "" : ` ${formatMoney(incomeTotal, "ARS")}`}
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium">{listOrder === "fecha" ? "Por fecha" : "Categorías"}</h2>
            <div className="flex gap-1">
              {(
                [
                  ["fecha", "Fecha"],
                  ["categoria", "Categoría"],
                  ["monto", "Monto"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListOrder(id)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    listOrder === id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPicking((on) => !on);
                  setPickedIds([]);
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  picking ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {picking ? "Listo" : "Elegir"}
              </button>
            </div>
          </div>
          {picking ? (
            <p className="text-[10px] text-muted-foreground">
              Tocá uno o varios. Si son de tarjeta, los descontás juntos de este sueldo.
            </p>
          ) : null}
          {listOrder === "fecha" && source !== "plata" && source !== "ingresos" ? (
            <p className="text-[10px] text-muted-foreground">
              Tarjetas del {dayLabel(prevClose)} al {dayLabel(closeOn)}, el cierre anterior inclusive.
            </p>
          ) : null}
          {listOrder === "fecha" ? (
            <div className="space-y-2">
              {dateGroups.map((group) => (
                <div key={group.day} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-medium capitalize text-muted-foreground">
                      {format(parseISO(group.day), "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                    {picking ? (
                      <button
                        type="button"
                        onClick={() => togglePickIds(group.txs.map((tx) => tx.id))}
                        className="text-[10px] font-medium text-primary"
                      >
                        {group.txs.every((tx) => pickedIds.includes(tx.id)) ? "Quitar día" : "Elegir día"}
                      </button>
                    ) : null}
                  </div>
                  {group.txs.map((tx) => (
                    <MovementRow
                      key={tx.id}
                      tx={tx}
                      categories={categories}
                      cards={cards}
                      installments={installments}
                      tag={rhythmOf(tx)}
                      onSelect={selectTx}
                      picked={pickedIds.includes(tx.id)}
                      onPick={picking ? togglePick : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {listOrder === "fecha" ? null : (
          <div className="space-y-1">
            {categoryRows.map((row) => {
              const open = openCats.includes(row.name);
              const egresos = row.txs.filter((tx) => tx.type === "egreso");
              const marks = [...new Set(egresos.map((tx) => rhythmOf(tx) ?? ""))].filter(Boolean);
              const onlyMark = marks.length === 1 && egresos.every((tx) => rhythmOf(tx) === marks[0]) ? marks[0].toUpperCase() : null;
              const parts = source === "todas" ? splitLine(row.txs) : [];
              const detail = [onlyMark, ...parts].filter(Boolean).join(" · ");
              const groups = open ? groupsFor(row.txs) : [];
              const categoryPicked = row.txs.length > 0 && row.txs.every((tx) => pickedIds.includes(tx.id));
              return (
                <div key={row.name}>
                  <div className="flex items-stretch gap-1">
                    {picking ? (
                      <button
                        type="button"
                        aria-pressed={categoryPicked}
                        aria-label={categoryPicked ? `Quitar ${row.name}` : `Elegir ${row.name}`}
                        onClick={() => togglePickIds(row.txs.map((tx) => tx.id))}
                        className={cn(
                          "grid w-8 shrink-0 place-items-center rounded-md border text-xs",
                          categoryPicked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                        )}
                      >
                        {categoryPicked ? "✓" : ""}
                      </button>
                    ) : null}
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCats((current) => toggleName(current, row.name))}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left",
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
                  </div>
                  {open ? (
                    <div className="mt-1 space-y-2 rounded-md border border-border bg-background p-1.5">
                      {groups.map((group) => (
                        <div key={group.label} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-medium text-muted-foreground">{group.label}</p>
                            {picking ? (
                              <button
                                type="button"
                                onClick={() => togglePickIds(group.txs.map((tx) => tx.id))}
                                className="text-[10px] font-medium text-primary"
                              >
                                {group.txs.every((tx) => pickedIds.includes(tx.id)) ? "Quitar" : "Elegir"}
                              </button>
                            ) : null}
                          </div>
                          {group.txs.map((tx) => (
                            <MovementRow
                              key={tx.id}
                              tx={tx}
                              categories={categories}
                              cards={cards}
                              installments={installments}
                              tag={rhythmOf(tx)}
                              onSelect={selectTx}
                              picked={pickedIds.includes(tx.id)}
                              onPick={picking ? togglePick : undefined}
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
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {source === "ingresos" ? "Este mes no tiene ingresos." : "Nada en este mes para ese filtro."}
        </p>
      )}

      {services.length > 0 || cardDue.total > 0 || cardPaid ? (
        <div className="space-y-1.5 pb-4">
          <h2 className="text-xs font-medium">Mensual</h2>
          <p className="text-[11px] text-muted-foreground">
            Siguen en su categoría. Acá los marcás pagados. El total de la tarjeta cae en el mes en que se abona.
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {cardDue.total > 0 || cardPaid ? (
              <div
                className={cn(
                  "rounded-md border px-1.5 py-1",
                  cardPaid ? "border-emerald-500/40 bg-emerald-500/10" : "border-violet-500/40 bg-violet-500/10",
                )}
              >
                <p className="truncate text-[11px] font-medium leading-tight">TARJETA TOTAL</p>
                <p className="text-[11px] font-semibold leading-tight tabular-nums">
                  {formatMoney(cardPaid ? cardPaidAmount : cardDue.total, "ARS")}
                </p>
                <p className="text-[9px] leading-tight text-muted-foreground">
                  Visa mía {formatMoney(cardDue.visa, "ARS")}
                </p>
                <p className="text-[9px] leading-tight text-muted-foreground">
                  Extensión {formatMoney(cardDue.extension, "ARS")}
                </p>
                <p className="text-[9px] leading-tight text-muted-foreground">
                  {cardPaid ? "Pagada · descuenta este sueldo" : "Mes anterior · se paga este mes"}
                </p>
                {!isFuture && !cardPaid ? (
                  <Button
                    size="sm"
                    className="mt-1 h-6 w-full px-1 text-[10px]"
                    onClick={() =>
                      guard(() => {
                        setPayDate(dateInViewedMonth(isoDate(new Date())));
                        setCardPayAsk(true);
                      }, isPast)
                    }
                  >
                    Pagué
                  </Button>
                ) : null}
                {cardPaid ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-6 w-full px-1 text-[10px]"
                    onClick={() => guard(() => void confirmCardUnpay(), isPast)}
                  >
                    Deshacer
                  </Button>
                ) : null}
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
      <EdesurSplitDialog
        open={Boolean(edesurAsk)}
        onOpenChange={(open) => !open && setEdesurAsk(null)}
        month={viewedMonth}
        monthLabel={monthName}
        billAmount={
          edesurAsk
            ? (shownRecurring(edesurAsk, viewedMonth, transactions)?.amount ?? Number(edesurAsk.amount))
            : 0
        }
        received={edesurReceived}
        saved={savedEdesur}
        onSave={saveEdesur}
      />

      {picking ? (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-1.5 md:max-w-2xl">
            <p className="text-xs font-medium">
              {pickedRows.length === 0
                ? "Nada elegido"
                : `${pickedRows.length} ${pickedRows.length === 1 ? "elegido" : "elegidos"}`}
            </p>
            {pickedPayableSum > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Tarjeta a descontar {formatMoney(pickedPayableSum, "ARS")}
              </p>
            ) : null}
            {pickedCashSum > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Efectivo y transferencia {formatMoney(pickedCashSum, "ARS")} · ya descuenta el sueldo
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => togglePickIds(filteredMoves.map((tx) => tx.id))}
              >
                {allVisiblePicked ? "Ninguno" : "Todos"}
              </Button>
              {pickedPayableSum > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => guard(() => void payPickedCards(), isPast)}
                >
                  Descontar tarjetas
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={cardPayAsk} onOpenChange={setCardPayAsk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Pagaste las dos tarjetas?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se descuentan {formatMoney(cardDue.total, "ARS")} del sueldo de este mes. Visa mía{" "}
            {formatMoney(cardDue.visa, "ARS")} y Extensión {formatMoney(cardDue.extension, "ARS")}.
          </p>
          <div className="mt-3">
            <Label>Fecha del pago</Label>
            <Input className="mt-1.5" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => void confirmCardPay()}>
              Sí, pagué
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setCardPayAsk(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    <MonthReport
      monthLabel={format(cursor, "MMMM yyyy", { locale: es })}
      estimated={estimated}
      salaryNote={salaryNote}
      sueldo={sueldoMes}
      otros={ingresosMes}
      incomeLines={incomeLines}
      cardFrom={salaryCardFrom}
      cardTo={salaryCardTo}
      cardNote={cardNote}
      cardCharges={salaryCardTx.filter((tx) => tx.type === "egreso")}
      cardPaidAmount={reportCardPaid}
      cardUnpaid={cardDue.total}
      outflows={reportOutflows}
      categories={categories}
      cards={cards}
      papaId={papa?.id ?? null}
      toArs={toArs}
    />
    </>
  );
}

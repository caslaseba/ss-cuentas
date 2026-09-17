"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { QuickManual } from "@/components/entry/quick-manual";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { StatementPanel } from "@/components/cards/statement-panel";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDolarRate } from "@/hooks/use-dolar-rate";
import { MY_CARD_NAME, householdCards } from "@/lib/finance/cards";
import {
  currentInstallmentForCycle,
  inCycle,
  planProgress,
  statementRefForMonth,
  summarizeCard,
  usdToLocal,
} from "@/lib/finance/settlement";
import { paymentMethodLabel } from "@/lib/finance/match";
import {
  categoryChipClass,
  groupedCategorySplit,
  groupCategory,
  methodBarClass,
  methodBoxClass,
  methodChipClass,
  movementAmountClass,
  movementRowClass,
} from "@/lib/finance/style";
import { cardCoversRecurring, isCardRecurring, recurringVia } from "@/lib/finance/recurring";
import { withCardCharge, isLeftoverTx, observationOf } from "@/lib/finance/tx-notes";
import { carryOverNote, hasCarryOver, methodBreakdown, monthWallet, shiftMonth } from "@/lib/finance/wallet";
import { cn, formatMoney, isoDate, startOfMonth } from "@/lib/utils";
import type { Installment, RecurringPayment, Transaction } from "@/lib/types";

export default function DashboardPage() {
  const {
    transactions,
    categories,
    cards,
    installments,
    profile,
    recurring,
    toggleRecurringPaid,
    saveTransaction,
  } = useFinance();
  const now = new Date();
  const [cursor, setCursor] = useState(() => startOfMonth(now));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingFixed, setEditingFixed] = useState<RecurringPayment | null>(null);
  const quote = useDolarRate();

  const isCurrent = cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear();
  const { mine, papa, visible } = householdCards(cards, transactions);
  const visibleIds = new Set(visible.map((c) => c.id));

  const toArs = (amount: number, currency: "ARS" | "USD") => {
    if (currency === "ARS") return amount;
    return usdToLocal(
      amount,
      Number(profile?.usd_exchange_rate ?? 0),
      0,
    );
  };

  const wallet = monthWallet(transactions, toArs, cursor);
  const prevWallet = monthWallet(transactions, toArs, shiftMonth(cursor, -1));
  const alreadyCarried = hasCarryOver(transactions, cursor);
  const leftover = Math.max(0, prevWallet.queda);
  const cashPending = isCurrent ? recurring.filter((r) => !isCardRecurring(r) && !r.is_paid) : [];
  const cardServices = isCurrent ? recurring.filter((r) => isCardRecurring(r)) : [];
  const cashMonthTx = wallet.monthTx.filter((t) => t.payment_method !== "tarjeta_credito");
  const cashTx = cashMonthTx.filter((t) => t.type === "egreso");

  const cuotaPlans = installments
    .filter((plan) => visibleIds.has(plan.credit_card_id))
    .map((plan) => ({ plan, progress: planProgress(plan, cursor) }));

  const monthCardRef = mine ? statementRefForMonth(mine, cursor) : cursor;
  const monthStatement =
    mine && profile ? summarizeCard(mine, transactions, installments, profile, cards, monthCardRef) : null;
  const liveStatement =
    mine && profile ? summarizeCard(mine, transactions, installments, profile, cards, now) : null;
  const showNextStatement =
    Boolean(
      isCurrent &&
        monthStatement &&
        liveStatement &&
        monthStatement.cycle.end.getTime() !== liveStatement.cycle.end.getTime(),
    );
  const lastNavigable = startOfMonth(liveStatement?.cycle.end ?? now);
  const canGoNext = startOfMonth(cursor).getTime() < lastNavigable.getTime();
  const tarjetaMes = monthStatement?.totalLocal ?? 0;

  const cardMonthTx = wallet.monthTx.filter((t) => t.type === "egreso" && t.payment_method === "tarjeta_credito");
  const spendTx = uniqueById([
    ...cashTx,
    ...cardMonthTx,
    ...(monthStatement?.tx ?? []),
  ]);
  const spendCategories = groupedCategorySplit(spendTx, categories, toArs);
  const cashMethods = methodBreakdown(cashMonthTx, toArs).filter((row) => row.name !== "Tarjeta");
  const methods = [
    ...cashMethods,
    ...(tarjetaMes > 0 ? [{ name: "Tarjeta", amount: tarjetaMes }] : []),
  ].sort((a, b) => b.amount - a.amount);
  const methodMax = Math.max(...methods.map((m) => m.amount), 1);
  const monthMoves = uniqueById([
    ...cashMonthTx,
    ...cardMonthTx,
    ...(monthStatement?.tx ?? []),
  ]).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const orphanCuotas = monthStatement
    ? cuotaPlans.filter(({ plan }) => {
        const slot = currentInstallmentForCycle(plan, monthStatement.cycle);
        if (!slot) return false;
        return !monthStatement.tx.some((t) => t.installment_id === plan.id);
      })
    : [];
  const nextCategories = showNextStatement && liveStatement
    ? groupedCategorySplit(liveStatement.tx, categories, toArs)
    : [];
  const nextCuotas = liveStatement
    ? cuotaPlans.filter(({ plan, progress }) => {
        if (progress.isLast) return false;
        const slot = currentInstallmentForCycle(plan, liveStatement.cycle);
        if (!slot) return progress.remainingAfterThis > 0 && showNextStatement;
        if (!showNextStatement) return false;
        return !liveStatement.tx.some((t) => t.installment_id === plan.id);
      })
    : [];

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
      toast.success("Sobra del mes anterior sumada como saldo a favor");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo traer la sobra");
    }
  }

  function openCuota(plan: Installment) {
    const linked = transactions.find((t) => t.installment_id === plan.id);
    if (linked) {
      setEditing(linked);
      return;
    }
    toast.message("No hay un movimiento ligado a esa cuota. Cargala de nuevo o editá el gasto de tarjeta.");
  }

  const usdRate = quote?.tarjeta || quote?.oficial || Number(profile?.usd_exchange_rate ?? 0);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setCursor((d) => shiftMonth(d, -1))}
          >
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
        <p className="text-sm font-medium text-muted-foreground">{isCurrent ? "Te queda" : "Te quedó"}</p>
        <p className="text-3xl font-semibold tracking-tight break-words text-emerald-800 dark:text-emerald-300 sm:text-4xl">{formatMoney(wallet.queda, "ARS")}</p>
        {usdRate > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Dólar tarjeta {formatMoney(usdRate, "ARS")}
            {quote?.source ? ` · ${quote.source}` : ""}
          </p>
        ) : null}
      </div>

      {leftover > 0 && !alreadyCarried ? (
        <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-900">Sobra del mes anterior</p>
            <p className="text-xs text-muted-foreground">
              En {format(shiftMonth(cursor, -1), "MMMM", { locale: es })} te quedó {formatMoney(leftover, "ARS")}.
              Traelo como saldo a favor.
            </p>
          </div>
          <Button size="sm" onClick={() => void bringLeftover()}>
            Traer
          </Button>
        </div>
      ) : null}
      {alreadyCarried ? (
        <p className="text-xs text-muted-foreground">Ya está sumada la sobra del mes anterior.</p>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <StatBox
          label="Entró"
          value={formatMoney(wallet.cobrado, "ARS")}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
        />
        <StatBox
          label="Efectivo"
          value={formatMoney(wallet.gastadoContado, "ARS")}
          className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        />
        <StatBox
          label="Tarjeta"
          value={formatMoney(tarjetaMes, "ARS")}
          className="border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300"
        />
      </div>

      <div className="space-y-5 xl:grid xl:grid-cols-2 xl:items-start xl:gap-8 xl:space-y-0">
        <div className="space-y-5">
      {isCurrent ? (
        <>
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6">
            <VoiceEntry />
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Tocá el micrófono y hablá. Ej: “Cobré 2 millones” o “Compré 2 kgs de milanesa por 15 mil”.
            </p>
          </div>

          <Card>
            <CardContent className="pt-5">
              <p className="mb-3 text-sm font-medium">O cargalo a mano</p>
              <QuickManual />
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          Estás viendo un mes anterior. Volvé al mes actual para cargar gastos nuevos.
        </p>
      )}
        </div>
        <div className="space-y-5 min-w-0">

      {spendCategories.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Categorías de este mes</h2>
          <p className="text-xs text-muted-foreground">
            Incluye súper, comida, etc. Lo que compraste con tarjeta después del cierre también está acá, y se imputa al próximo resumen.
          </p>
          {spendCategories.map((row) => (
            <CategoryBar key={row.name} name={row.name} amount={row.total} split={row.split} />
          ))}
        </div>
      ) : null}

      {methods.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Por dónde salió este mes</h2>
          {methods.map((row) => (
            <div key={row.name} className={cn("space-y-1 rounded-xl border px-3 py-2", methodBoxClass(row.name))}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.name}</span>
                <span className="font-semibold">{formatMoney(row.amount, "ARS")}</span>
              </div>
              {row.name === "Tarjeta" && monthStatement && mine ? (
                <p className="text-[11px] text-muted-foreground">
                  Tuya {formatMoney(monthStatement.byCard.find((c) => c.id === mine.id)?.amount ?? 0, "ARS")}
                  {papa
                    ? ` · ${papa.name} ${formatMoney(monthStatement.byCard.find((c) => c.id === papa.id)?.amount ?? 0, "ARS")}`
                    : ""}
                </p>
              ) : null}
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className={cn("h-full rounded-full", methodBarClass(row.name))}
                  style={{ width: `${Math.max(8, (row.amount / methodMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cashPending.length > 0 || cardServices.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Servicios del mes</h2>
          <p className="text-xs text-muted-foreground">
            Los de tarjeta se ven acá para marcarlos, pero el monto ya está en el resumen: no se suma otra vez.
          </p>
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
                  <p className="text-sm font-medium text-violet-950 dark:text-violet-100">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {card?.name ?? MY_CARD_NAME}
                    {onCard ? " · ya está en el resumen, no duplica" : " · se debita con el pago de la tarjeta"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-violet-900 dark:text-violet-200">
                  {formatMoney(Number(r.amount), r.currency)}
                </span>
              </button>
            );
          })}
          {cashPending.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2"
            >
              <button type="button" className="min-w-0 text-left" onClick={() => setEditingFixed(r)}>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Día {r.due_day} · {formatMoney(Number(r.amount), r.currency)}</p>
              </button>
              <Button
                size="sm"
                onClick={() => {
                  void (async () => {
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
                  })();
                }}
              >
                Pagué
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Movimientos de {format(cursor, "MMMM", { locale: es })}</h2>
        <p className="text-xs text-muted-foreground">
          Incluye cuotas y consumos de tarjeta de este resumen. Tocá para editar.
        </p>
        {monthMoves.length === 0 && orphanCuotas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isCurrent ? "Todavía no hay nada este mes. Dictá un cobro para empezar." : "No hay movimientos en este mes."}
          </p>
        ) : null}
        {orphanCuotas.map(({ plan, progress }) => (
          <button
            key={`cuota-${plan.id}`}
            type="button"
            onClick={() => openCuota(plan)}
            className="w-full rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-left text-sm"
          >
            <p className="font-medium">{plan.concept}</p>
            <p className="text-xs text-muted-foreground">
              Cuota {progress.current}/{progress.total}
              {progress.isLast
                ? " · última"
                : ` · faltan ${progress.remainingAfterThis} (${formatMoney(progress.remainingAmount, plan.currency)})`}
              {" · "}
              {formatMoney(Number(plan.installment_amount), plan.currency)}
            </p>
          </button>
        ))}
        {monthMoves.map((t) => {
          const cat = categories.find((c) => c.id === t.category_id)?.name;
          const catGroup = groupCategory(cat);
          const sign = t.type === "ingreso" ? "+" : "−";
          const card = cards.find((c) => c.id === t.credit_card_id);
          const plan = t.installment_id ? installments.find((i) => i.id === t.installment_id) : null;
          const progress = plan ? planProgress(plan, cursor) : null;
          const methodName =
            t.type === "ingreso"
              ? isLeftoverTx(t.notes)
                ? "Sobra"
                : "Entrada"
              : t.payment_method === "tarjeta_credito"
                ? card?.kind === "extension"
                  ? card.name
                  : "Tarjeta"
                : paymentMethodLabel(t.payment_method);
          const obs = observationOf(t.notes);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditing(t)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm",
                movementRowClass(t),
              )}
            >
              <div className="min-w-0">
                <p className="font-medium">{t.concept}</p>
                {obs ? <p className="truncate text-[11px] text-muted-foreground">{obs}</p> : null}
                {progress && plan ? (
                  <p className="text-[11px] text-violet-800 dark:text-violet-200">
                    Cuota {progress.current}/{progress.total}
                    {progress.isLast
                      ? " · última"
                      : ` · faltan ${progress.remainingAfterThis} (${formatMoney(progress.remainingAmount, plan.currency)})`}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodChipClass(t.payment_method, t.type))}>
                    {methodName}
                  </span>
                  {t.type === "egreso" ? (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", categoryChipClass(catGroup))}>
                      {catGroup}
                    </span>
                  ) : null}
                  {t.payment_method === "tarjeta_credito" && monthStatement && !inCycle(t.occurred_on, monthStatement.cycle) ? (
                    <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-900 dark:text-violet-100">
                      Próximo resumen
                    </span>
                  ) : null}
                  <span className="text-[10px] text-muted-foreground">
                    {format(parseISO(t.occurred_on), "d MMM", { locale: es })}
                  </span>
                </div>
              </div>
              <span className={cn("shrink-0 font-semibold", movementAmountClass(t))}>
                {sign}
                {formatMoney(Number(t.amount), t.currency)}
              </span>
            </button>
          );
        })}
      </div>

      {showNextStatement && liveStatement && mine ? (
        <div className="space-y-3 pb-4">
          <h2 className="text-sm font-medium">Va al mes siguiente</h2>
          <p className="text-xs text-muted-foreground">
            Este ciclo todavía está abierto: cierra y se imputa al mes que viene.
          </p>
          {nextCategories.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Categorías del próximo resumen</h3>
              {nextCategories.map((row) => (
                <CategoryBar key={`next-${row.name}`} name={row.name} amount={row.total} split={row.split} />
              ))}
            </div>
          ) : null}
          <StatementPanel
            title={`Va a ${format(liveStatement.cycle.end, "MMMM", { locale: es })} · todavía abierto`}
            hint="Cuando cierre, este detalle pasa al mes siguiente como gastos de tarjeta."
            summary={liveStatement}
            mine={mine}
            papa={papa}
            categories={categories}
            cards={cards}
            toArs={toArs}
            now={now}
            hideCategories
            onSelectTx={setEditing}
            onAddCharge={async ({ concept, amount, kind }) => {
              const taxCat = categories.find((c) => c.type === "egreso" && c.name.toLowerCase().includes("impuesto"));
              await saveTransaction({
                type: "egreso",
                amount,
                concept,
                payment_method: "tarjeta_credito",
                credit_card_id: mine.id,
                category_id: taxCat?.id ?? null,
                occurred_on: isoDate(liveStatement.cycle.end),
                notes: withCardCharge(null, kind),
                source: "manual",
              });
            }}
          />
          {nextCuotas.map(({ plan, progress }) => (
            <button
              key={`next-${plan.id}`}
              type="button"
              onClick={() => openCuota(plan)}
              className="w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-sm"
            >
              <p className="font-medium">{plan.concept}</p>
              <p className="text-xs text-muted-foreground">
                Sigue en cuotas: {progress.current}/{progress.total} · faltan {progress.remainingAfterThis} (
                {formatMoney(progress.remainingAmount, plan.currency)})
              </p>
            </button>
          ))}
        </div>
      ) : monthStatement && mine && isCurrent ? (
        <div className="pb-4">
          <StatementPanel
            title={`Resumen abierto · ${MY_CARD_NAME}`}
            hint="Cargos de impuestos o intereses de este cierre. Los consumos ya están arriba."
            summary={monthStatement}
            mine={mine}
            papa={papa}
            categories={categories}
            cards={cards}
            toArs={toArs}
            now={now}
            compact
            onSelectTx={setEditing}
            onAddCharge={async ({ concept, amount, kind }) => {
              const taxCat = categories.find((c) => c.type === "egreso" && c.name.toLowerCase().includes("impuesto"));
              await saveTransaction({
                type: "egreso",
                amount,
                concept,
                payment_method: "tarjeta_credito",
                credit_card_id: mine.id,
                category_id: taxCat?.id ?? null,
                occurred_on: isoDate(monthStatement.cycle.end),
                notes: withCardCharge(null, kind),
                source: "manual",
              });
            }}
          />
        </div>
      ) : (
        <div className="pb-4" />
      )}
        </div>
      </div>

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <RecurringEdit item={editingFixed} open={Boolean(editingFixed)} onOpenChange={(v) => !v && setEditingFixed(null)} />
    </div>
  );
}

function StatBox({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border px-1.5 py-3 text-center sm:px-2", className)}>
      <p className="text-[10px] font-medium opacity-80 sm:text-[11px]">{label}</p>
      <p className="break-words text-xs font-semibold leading-tight sm:text-sm">{value}</p>
    </div>
  );
}

function CategoryBar({
  name,
  amount,
  split,
}: {
  name: string;
  amount: number;
  split: { method: string; amount: number }[];
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", categoryChipClass(groupCategory(name)))}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="font-semibold">{formatMoney(amount, "ARS")}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        {split.map((part) => (
          <div
            key={part.method}
            className={cn("h-full", methodBarClass(part.method))}
            style={{ width: `${Math.max(4, (part.amount / Math.max(amount, 1)) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {split.map((part) => (
          <span
            key={part.method}
            className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodBoxClass(part.method))}
          >
            {part.method} {formatMoney(part.amount, "ARS")}
          </span>
        ))}
      </div>
    </div>
  );
}

function uniqueById(list: Transaction[]) {
  const map = new Map<string, Transaction>();
  for (const t of list) map.set(t.id, t);
  return [...map.values()];
}

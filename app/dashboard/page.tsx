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
  planProgress,
  statementRefForMonth,
  summarizeCard,
  usdToLocal,
} from "@/lib/finance/settlement";
import { paymentMethodLabel } from "@/lib/finance/match";
import {
  categoryChipClass,
  categoryTotals,
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
  const methods = methodBreakdown(cashMonthTx, toArs);
  const methodMax = Math.max(...methods.map((m) => m.amount), 1);
  const cashCategories = categoryTotals(cashTx, categories, toArs);
  const recent = [...cashMonthTx].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

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
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor((d) => shiftMonth(d, -1))}
          >
            ← Mes anterior
          </Button>
          <p className="text-sm font-medium capitalize">{format(cursor, "MMMM yyyy", { locale: es })}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canGoNext}
            onClick={() => setCursor((d) => shiftMonth(d, 1))}
          >
            Mes siguiente →
          </Button>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{isCurrent ? "Te queda" : "Te quedó"}</p>
        <p className="text-4xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">{formatMoney(wallet.queda, "ARS")}</p>
        {usdRate > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Dólar tarjeta {formatMoney(usdRate, "ARS")}
            {quote?.source ? ` · ${quote.source}` : ""}
          </p>
        ) : null}
      </div>

      {leftover > 0 && !alreadyCarried ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
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

      <div className="grid grid-cols-3 gap-2">
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

      {monthStatement && mine ? (
        <StatementPanel
          title={`Resumen de ${format(cursor, "MMMM", { locale: es })} · ${MY_CARD_NAME}`}
          hint={`Cierra el ${mine.closing_day} · vence el ${mine.due_day}. Los consumos del ciclo entran acá, no el día que compraste.`}
          summary={monthStatement}
          mine={mine}
          papa={papa}
          categories={categories}
          cards={cards}
          toArs={toArs}
          now={now}
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
      ) : null}

      {showNextStatement && liveStatement && mine ? (
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
      ) : null}

      {cuotaPlans.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Cuotas</h2>
          <p className="text-xs text-muted-foreground">Tocá una para decir en qué cuota vas y cuánto falta.</p>
          {cuotaPlans.map(({ plan, progress }) => {
            const card = cards.find((c) => c.id === plan.credit_card_id);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => openCuota(plan)}
                className="w-full rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-sm"
              >
                <p className="font-medium">{plan.concept}</p>
                <p className="text-xs text-muted-foreground">
                  {card?.name ?? "Tarjeta"} · cuota {progress.current}/{progress.total}
                  {progress.isLast
                    ? " · última"
                    : ` · faltan ${progress.remainingAfterThis} (${formatMoney(progress.remainingAmount, plan.currency)})`}
                  {" · termina "}
                  {format(progress.endsOn, "MMMM yyyy", { locale: es })}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

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

      {methods.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Por dónde salió este mes</h2>
          {methods.map((row) => (
            <div key={row.name} className={cn("space-y-1 rounded-xl border px-3 py-2", methodBoxClass(row.name))}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.name}</span>
                <span className="font-semibold">{formatMoney(row.amount, "ARS")}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className={cn("h-full rounded-full", methodBarClass(row.name))}
                  style={{ width: `${Math.max(8, (row.amount / methodMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cashCategories.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Tu plata · categorías</h2>
          {cashCategories.map((row) => (
            <CategoryBar key={row.name} name={row.name} amount={row.amount} max={Math.max(...cashCategories.map((c) => c.amount), 1)} />
          ))}
        </div>
      ) : null}

      {cashPending.length > 0 || cardServices.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Servicios a pagar</h2>
          <p className="text-xs text-muted-foreground">
            Tocá el nombre para editar. Los de Visa ya están en el resumen de la tarjeta: no salen de tu plata.
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
                    Día {r.due_day} · se paga con {card?.name ?? MY_CARD_NAME}
                    {onCard ? " · ya está en el resumen" : " · no suma otra vez en tu plata"}
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

      <div className="space-y-2 pb-4">
        <h2 className="text-sm font-medium">Movimientos de {format(cursor, "MMMM", { locale: es })}</h2>
        <p className="text-xs text-muted-foreground">
          Cobros y gastos de tu plata. Los de tarjeta están en el resumen de arriba. Tocá para editar.
        </p>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isCurrent ? "Todavía no hay nada este mes. Dictá un cobro para empezar." : "No hay movimientos en este mes."}
          </p>
        ) : null}
        {recent.map((t) => {
          const cat = categories.find((c) => c.id === t.category_id)?.name;
          const catGroup = groupCategory(cat);
          const sign = t.type === "ingreso" ? "+" : "−";
          const methodName =
            t.type === "ingreso"
              ? isLeftoverTx(t.notes)
                ? "Sobra"
                : "Entrada"
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
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodChipClass(t.payment_method, t.type))}>
                    {methodName}
                  </span>
                  {t.type === "egreso" ? (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", categoryChipClass(catGroup))}>
                      {cat ?? "Sin categoría"}
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

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <RecurringEdit item={editingFixed} open={Boolean(editingFixed)} onOpenChange={(v) => !v && setEditingFixed(null)} />
    </div>
  );
}

function StatBox({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={cn("rounded-2xl border px-2 py-3 text-center", className)}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="text-sm font-semibold leading-tight">{value}</p>
    </div>
  );
}

function CategoryBar({ name, amount, max }: { name: string; amount: number; max: number }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", categoryChipClass(groupCategory(name)))}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="font-semibold">{formatMoney(amount, "ARS")}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-current opacity-70"
          style={{ width: `${Math.max(8, (amount / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

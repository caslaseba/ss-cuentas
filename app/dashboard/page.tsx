"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { QuickManual } from "@/components/entry/quick-manual";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  closeMessage,
  dueMessage,
  planProgress,
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
import { methodBreakdown, monthWallet } from "@/lib/finance/wallet";
import { cn, formatMoney } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

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
  const [editing, setEditing] = useState<Transaction | null>(null);

  const toArs = (amount: number, currency: "ARS" | "USD") => {
    if (currency === "ARS") return amount;
    return usdToLocal(
      amount,
      Number(profile?.usd_exchange_rate ?? 0),
      Number(profile?.tax_surcharge_pct ?? 0),
    );
  };

  const wallet = monthWallet(transactions, toArs, now);
  const pendingFixed = recurring.filter((r) => !r.is_paid);
  const principals = cards.filter((c) => c.kind === "principal");
  const cashTx = wallet.monthTx.filter((t) => t.type === "egreso" && t.payment_method !== "tarjeta_credito");
  const methods = methodBreakdown(wallet.monthTx, toArs);
  const methodMax = Math.max(...methods.map((m) => m.amount), 1);
  const cashCategories = categoryTotals(cashTx, categories, toArs);
  const recent = [...wallet.monthTx].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 14);

  const cuotaAlerts = installments
    .map((plan) => ({ plan, progress: planProgress(plan, now) }))
    .filter(({ progress }) => progress.isLast || progress.remainingAfterThis <= 2);

  const cardSummaries = principals.map((card) => ({
    card,
    summary: profile ? summarizeCard(card, transactions, installments, profile, cards) : null,
  }));
  const cardCycleTotal = cardSummaries.reduce((s, row) => s + (row.summary?.totalLocal ?? 0), 0);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{format(now, "MMMM yyyy", { locale: es })}</p>
        <p className="text-sm font-medium text-muted-foreground">Te queda</p>
        <p className="text-4xl font-semibold tracking-tight text-emerald-800">{formatMoney(wallet.queda, "ARS")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox
          label="Entró"
          value={formatMoney(wallet.cobrado, "ARS")}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
        />
        <StatBox
          label="Efectivo"
          value={formatMoney(wallet.gastadoContado, "ARS")}
          className="border-amber-500/30 bg-amber-500/10 text-amber-800"
        />
        <StatBox
          label="Tarjeta"
          value={formatMoney(cardCycleTotal || wallet.gastadoTarjeta, "ARS")}
          className="border-violet-500/30 bg-violet-500/10 text-violet-800"
        />
      </div>

      {cardSummaries.map(({ card, summary }) => {
        if (!summary) return null;
        const cats = categoryTotals(summary.tx, categories, toArs);
        const catMax = Math.max(...cats.map((c) => c.amount), summary.totalLocal, 1);
        return (
          <Card key={card.id} className="border-violet-500/25 bg-violet-500/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-violet-900">Este resumen · {card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Cierra el {card.closing_day} · vence el {card.due_day}
                  </p>
                </div>
                <Badge tone={summary.schedule.daysToClose <= 3 ? "danger" : "usd"}>
                  {closeMessage(summary.schedule)}
                </Badge>
              </div>
              <p className="mt-2 text-3xl font-semibold text-violet-900">{formatMoney(summary.totalLocal, "ARS")}</p>
              <p className="text-xs text-muted-foreground">{dueMessage(summary.schedule)}</p>

              {summary.byCard.map((row) => (
                <p key={row.id} className="mt-1 text-sm text-violet-900/80">
                  {row.kind === "extension" ? row.name : "Tuya"}: {formatMoney(row.amount, "ARS")}
                </p>
              ))}

              {cats.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-800/80">En qué se va</p>
                  {cats.map((row) => (
                    <CategoryBar key={row.name} name={row.name} amount={row.amount} max={catMax} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Todavía no hay consumos en este cierre.</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {cuotaAlerts.length > 0 ? (
        <div className="space-y-2">
          {cuotaAlerts.map(({ plan, progress }) => (
            <div key={plan.id} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">
              {progress.isLast
                ? `Última cuota de ${plan.concept} (${progress.current}/${progress.total})`
                : `Quedan ${progress.remainingAfterThis} cuotas de ${plan.concept} (${progress.current}/${progress.total})`}
            </div>
          ))}
        </div>
      ) : null}

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

      {pendingFixed.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Servicios a pagar</h2>
          {pendingFixed.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Día {r.due_day}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-teal-900">{formatMoney(Number(r.amount), r.currency)}</span>
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
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 pb-4">
        <h2 className="text-sm font-medium">Últimos movimientos</h2>
        <p className="text-xs text-muted-foreground">
          Verde entra · ámbar efectivo · celeste MP · violeta tarjeta. Tocá para editar.
        </p>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay nada este mes. Dictá un cobro para empezar.</p>
        ) : null}
        {recent.map((t) => {
          const cat = categories.find((c) => c.id === t.category_id)?.name;
          const catGroup = groupCategory(cat);
          const sign = t.type === "ingreso" ? "+" : "−";
          const card = cards.find((c) => c.id === t.credit_card_id);
          const methodName =
            t.type === "ingreso"
              ? "Entrada"
              : t.payment_method === "tarjeta_credito"
                ? card?.kind === "extension"
                  ? card.name
                  : "Tarjeta"
                : paymentMethodLabel(t.payment_method);
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
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodChipClass(t.payment_method, t.type))}>
                    {methodName}
                  </span>
                  {t.type === "egreso" ? (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", categoryChipClass(catGroup))}>
                      {cat ? catGroup : "Sin categoría"}
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
    <div className={cn("rounded-xl border px-3 py-2", categoryChipClass(name))}>
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

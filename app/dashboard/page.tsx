"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { QuickManual } from "@/components/entry/quick-manual";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeCard, usdToLocal } from "@/lib/finance/settlement";
import { categoryLabel } from "@/lib/finance/match";
import { monthWallet } from "@/lib/finance/wallet";
import { formatMoney } from "@/lib/utils";

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

  const byCategory = wallet.monthTx
    .filter((t) => t.type === "egreso")
    .reduce<Record<string, number>>((acc, t) => {
      const name = categoryLabel(categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría");
      acc[name] = (acc[name] ?? 0) + toArs(Number(t.amount), t.currency);
      return acc;
    }, {});

  const recent = [...wallet.monthTx].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 12);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{format(now, "MMMM yyyy", { locale: es })}</p>
        <p className="text-sm font-medium text-muted-foreground">Te queda</p>
        <p className="text-4xl font-semibold tracking-tight">{formatMoney(wallet.queda, "ARS")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobraste {formatMoney(wallet.cobrado, "ARS")} · gastaste {formatMoney(wallet.gastadoContado, "ARS")}
        </p>
      </div>

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

      {Object.keys(byCategory).length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Gastos del mes</h2>
          {Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => (
              <div key={name} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <span>{name}</span>
                <span className="font-medium">{formatMoney(value, "ARS")}</span>
              </div>
            ))}
        </div>
      ) : null}

      {cards.map((card) => {
        const summary = profile ? summarizeCard(card, transactions, installments, profile) : null;
        if (!summary) return null;
        return (
          <Card key={card.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Cierra el {card.closing_day} · vence el {card.due_day}
                  </p>
                </div>
                <Badge tone="usd">Este resumen</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(summary.totalLocal, "ARS")}</p>
              <p className="text-xs text-muted-foreground">{summary.cycle.label}</p>
            </CardContent>
          </Card>
        );
      })}

      {pendingFixed.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Servicios a pagar</h2>
          {pendingFixed.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Día {r.due_day}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatMoney(Number(r.amount), r.currency)}</span>
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
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay nada este mes. Dictá un cobro para empezar.</p>
        ) : null}
        {recent.map((t) => {
          const cat = categories.find((c) => c.id === t.category_id)?.name;
          const catLabel = cat ? categoryLabel(cat) : null;
          const sign = t.type === "ingreso" ? "+" : "−";
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{t.concept}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(t.occurred_on), "d MMM", { locale: es })}
                  {catLabel ? ` · ${catLabel}` : ""}
                  {t.payment_method === "tarjeta_credito" ? " · tarjeta" : ""}
                </p>
              </div>
              <span className={t.type === "ingreso" ? "font-medium text-emerald-700" : "font-medium"}>
                {sign}
                {formatMoney(Number(t.amount), t.currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

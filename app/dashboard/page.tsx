"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ExpensePie, MonthlyBars, StatCard } from "@/components/dashboard/charts";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { useFinance } from "@/components/providers/finance-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBillingCycle, inCycle, usdToLocal } from "@/lib/finance/settlement";
import { formatMoney } from "@/lib/utils";

export default function DashboardPage() {
  const { transactions, categories, cards, installments, profile } = useFinance();
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthTx = transactions.filter((t) => {
    const d = parseISO(t.occurred_on);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const toArs = (amount: number, currency: "ARS" | "USD") => {
    if (currency === "ARS") return amount;
    return usdToLocal(
      amount,
      Number(profile?.usd_exchange_rate ?? 0),
      Number(profile?.tax_surcharge_pct ?? 0),
    );
  };

  const ingresos = monthTx
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0);
  const egresos = monthTx
    .filter((t) => t.type === "egreso")
    .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0);

  const pieMap = monthTx
    .filter((t) => t.type === "egreso")
    .reduce<Record<string, number>>((acc, t) => {
      const name = categories.find((c) => c.id === t.category_id)?.name ?? "Sin categoría";
      acc[name] = (acc[name] ?? 0) + toArs(Number(t.amount), t.currency);
      return acc;
    }, {});
  const pieData = Object.entries(pieMap).map(([name, value]) => ({ name, value }));

  const bars = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(year, month - (5 - idx), 1);
    const label = format(d, "MMM", { locale: es });
    const subset = transactions.filter((t) => {
      const dt = parseISO(t.occurred_on);
      return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear();
    });
    return {
      name: label,
      ingresos: subset
        .filter((t) => t.type === "ingreso")
        .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0),
      egresos: subset
        .filter((t) => t.type === "egreso")
        .reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0),
    };
  });

  const cardDebt = cards.reduce((sum, card) => {
    const cycle = getBillingCycle(card);
    const tx = transactions.filter(
      (t) => t.credit_card_id === card.id && t.type === "egreso" && inCycle(t.occurred_on, cycle),
    );
    return (
      sum +
      tx.reduce((s, t) => s + toArs(Number(t.amount), t.currency), 0)
    );
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "MMMM yyyy", { locale: es })} · cotización USD {profile?.usd_exchange_rate ?? "—"}
          </p>
        </div>
        <div className="hidden sm:block">
          <VoiceEntry compact />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Ingresos del mes" value={formatMoney(ingresos, "ARS")} />
        <StatCard title="Egresos del mes" value={formatMoney(egresos, "ARS")} />
        <StatCard
          title="Balance"
          value={formatMoney(ingresos - egresos, "ARS")}
          hint="Ingresos menos egresos (USD convertido)"
        />
        <StatCard
          title="Saldo en tarjetas"
          value={formatMoney(cardDebt, "ARS")}
          hint={`${cards.length} tarjetas · ${installments.length} planes de cuotas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribución de egresos</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpensePie data={pieData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={bars} />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center sm:hidden">
        <VoiceEntry />
      </div>
    </div>
  );
}

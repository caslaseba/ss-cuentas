"use client";

import { parseISO } from "date-fns";
import { useFinance } from "@/components/providers/finance-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { budgetTone, usdToLocal } from "@/lib/finance/settlement";
import { formatMoney } from "@/lib/utils";

export default function PresupuestosPage() {
  const { categories, transactions, profile, updateCategoryLimit } = useFinance();
  const now = new Date();

  const expenses = categories.filter((c) => c.type === "egreso");

  function spent(categoryId: string) {
    return transactions
      .filter((t) => {
        const d = parseISO(t.occurred_on);
        return (
          t.category_id === categoryId &&
          t.type === "egreso" &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .reduce((s, t) => {
        const n = Number(t.amount);
        if (t.currency === "USD") {
          return s + usdToLocal(n, Number(profile?.usd_exchange_rate ?? 0), Number(profile?.tax_surcharge_pct ?? 0));
        }
        return s + n;
      }, 0);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Presupuestos</h1>
        <p className="text-sm text-muted-foreground">
          Verde &lt; 70% · Amarillo 70–90% · Rojo &gt; 90% del límite mensual.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {expenses.map((c) => {
          const used = spent(c.id);
          const limit = c.monthly_limit ? Number(c.monthly_limit) : null;
          const tone = budgetTone(used, limit);
          const pct = limit ? (used / limit) * 100 : 0;
          return (
            <Card key={c.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{c.name}</CardTitle>
                <span className="text-xs text-muted-foreground">{tone === "ok" ? "OK" : tone === "warn" ? "Atención" : tone === "danger" ? "Excedido" : "Sin tope"}</span>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={pct} tone={tone === "neutral" ? "neutral" : tone} />
                <p className="text-sm">
                  {formatMoney(used, "ARS")}
                  {limit ? ` / ${formatMoney(limit, "ARS")}` : " · sin límite"}
                </p>
                <Input
                  defaultValue={limit ?? ""}
                  placeholder="Límite mensual ARS"
                  onBlur={(e) => {
                    const n = e.target.value ? Number(e.target.value) : null;
                    void updateCategoryLimit(c.id, n);
                  }}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

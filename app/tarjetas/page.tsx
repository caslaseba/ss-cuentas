"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  currentInstallmentForCycle,
  getBillingCycle,
  installmentDueDates,
  summarizeCard,
} from "@/lib/finance/settlement";
import { formatMoney } from "@/lib/utils";
import type { CardKind } from "@/lib/types";

export default function TarjetasPage() {
  const { cards, transactions, installments, profile, saveCard } = useFinance();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CardKind>("principal");
  const [parent, setParent] = useState("");
  const [closing, setClosing] = useState("10");
  const [due, setDue] = useState("20");
  const [limit, setLimit] = useState("");
  const [usdTax, setUsdTax] = useState("0");

  const principals = cards.filter((c) => c.kind === "principal");

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveCard({
        name,
        kind,
        parent_card_id: kind === "extension" ? parent || null : null,
        closing_day: Number(closing),
        due_day: Number(due),
        credit_limit: Number(limit) || 0,
        available_limit: Number(limit) || 0,
        usd_tax_pct: Number(usdTax) || 0,
      });
      toast.success("Tarjeta creada");
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tarjetas y cuotas</h1>
        <p className="text-sm text-muted-foreground">
          La liquidación usa el día de cierre: lo posterior al cierre entra en el próximo resumen.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const summary = profile
            ? summarizeCard(card, transactions, installments, profile)
            : null;
          const cycle = getBillingCycle(card);
          const plans = installments.filter((i) => i.credit_card_id === card.id);
          return (
            <Card key={card.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>{card.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cierre {card.closing_day} · Vence {card.due_day} · {cycle.label}
                  </p>
                </div>
                <Badge tone={card.kind === "principal" ? "ok" : "usd"}>
                  {card.kind === "principal" ? "Principal" : "Extensión"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>
                    Disponible:{" "}
                    <strong>{formatMoney(Number(card.available_limit), "ARS")}</strong>
                  </p>
                  <p>
                    Límite: <strong>{formatMoney(Number(card.credit_limit), "ARS")}</strong>
                  </p>
                  <p>
                    Consumos ARS: <strong>{formatMoney(summary?.ars ?? 0, "ARS")}</strong>
                  </p>
                  <p>
                    Consumos USD:{" "}
                    <strong>{formatMoney(summary?.usd ?? 0, "USD")}</strong>
                  </p>
                </div>
                <div className="rounded-xl bg-muted p-3 text-sm">
                  USD a pesos (cotización {profile?.usd_exchange_rate} + {card.usd_tax_pct || profile?.tax_surcharge_pct}% imp.):{" "}
                  <strong>{formatMoney(summary?.usdLocal ?? 0, "ARS")}</strong>
                  <div className="mt-1 text-muted-foreground">
                    Total estimado del ciclo: {formatMoney(summary?.totalLocal ?? 0, "ARS")}
                  </div>
                </div>
                {plans.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      Cuotas
                    </p>
                    <ul className="space-y-2">
                      {plans.map((plan) => {
                        const current = currentInstallmentForCycle(plan, cycle);
                        const remaining = installmentDueDates(plan).filter((x) => !x.isPaid).length;
                        return (
                          <li key={plan.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                            <div className="flex justify-between gap-2">
                              <span>{plan.concept}</span>
                              <span>
                                {formatMoney(Number(plan.installment_amount), plan.currency)} ×{" "}
                                {plan.installment_count}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Este resumen: cuota {current?.number ?? "—"} · quedan {remaining} · total{" "}
                              {formatMoney(Number(plan.total_amount), plan.currency)}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva tarjeta</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void addCard(e)}>
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select className="mt-1.5" value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
                <option value="principal">Principal</option>
                <option value="extension">Extensión</option>
              </Select>
            </div>
            <div>
              <Label>Padre (si es extensión)</Label>
              <Select className="mt-1.5" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">—</option>
                {principals.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Día de cierre</Label>
              <Input className="mt-1.5" value={closing} onChange={(e) => setClosing(e.target.value)} />
            </div>
            <div>
              <Label>Día de vencimiento</Label>
              <Input className="mt-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <Label>Límite</Label>
              <Input className="mt-1.5" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <div>
              <Label>% impuestos USD</Label>
              <Input className="mt-1.5" value={usdTax} onChange={(e) => setUsdTax(e.target.value)} />
            </div>
            <Button className="sm:col-span-2" type="submit">
              Guardar tarjeta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

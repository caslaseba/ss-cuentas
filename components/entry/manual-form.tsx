"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useFinance } from "@/components/providers/finance-provider";
import { isoDate } from "@/lib/utils";
import type { CurrencyCode, PaymentMethod, TransactionType } from "@/lib/types";

export function ManualEntryForm() {
  const { categories, accounts, cards, saveTransaction, saveInstallmentPurchase } = useFinance();
  const [type, setType] = useState<TransactionType>("egreso");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [concept, setConcept] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [cardId, setCardId] = useState("");
  const [cuotas, setCuotas] = useState("1");
  const [date, setDate] = useState(isoDate(new Date()));
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = Number(amount);
      if (!concept || !n) {
        toast.error("Completá concepto y monto.");
        return;
      }
      const cuotaN = Number(cuotas) || 1;
      if (cuotaN >= 2) {
        if (!cardId) {
          toast.error("Las cuotas requieren una tarjeta.");
          return;
        }
        await saveInstallmentPurchase({
          concept,
          installmentAmount: n,
          count: cuotaN,
          currency,
          credit_card_id: cardId,
          category_id: categoryId || null,
          occurred_on: date,
          source: "manual",
        });
      } else {
        await saveTransaction({
          type,
          amount: n,
          currency,
          concept,
          payment_method: method,
          category_id: categoryId || null,
          account_id: accountId || null,
          credit_card_id: method === "tarjeta_credito" ? cardId || null : null,
          occurred_on: date,
          source: "manual",
        });
      }
      toast.success("Guardado");
      setAmount("");
      setConcept("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga rápida</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              <option value="egreso">Egreso</option>
              <option value="ingreso">Ingreso</option>
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Concepto" className="sm:col-span-2">
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Carne, Netflix, sueldo…"
            />
          </Field>
          <Field label="Monto">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="20000"
            />
          </Field>
          <Field label="Moneda">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <Field label="Medio de pago">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta_credito">Tarjeta de crédito</option>
            </Select>
          </Field>
          <Field label="Cuotas">
            <Input value={cuotas} onChange={(e) => setCuotas(e.target.value)} />
          </Field>
          <Field label="Categoría">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Cuenta / caja">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tarjeta" className="sm:col-span-2">
            <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">—</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.kind}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="sm:col-span-2" disabled={busy} type="submit">
            {busy ? "Guardando…" : "Registrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

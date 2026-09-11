"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import type { RecurrenceFrequency } from "@/lib/types";

export default function FijosPage() {
  const { recurring, categories, saveRecurring, toggleRecurringPaid, saveTransaction } = useFinance();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("10");
  const [freq, setFreq] = useState<RecurrenceFrequency>("mensual");
  const [categoryId, setCategoryId] = useState("");

  const pending = recurring.filter((r) => !r.is_paid);
  const paid = recurring.filter((r) => r.is_paid);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveRecurring({
        name,
        amount: Number(amount),
        due_day: Number(due),
        frequency: freq,
        category_id: categoryId || null,
      });
      toast.success("Servicio agregado");
      setName("");
      setAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos fijos</h1>
        <p className="text-sm text-muted-foreground">
          Checklist mensual: Netflix, luz, alquiler y el resto de suscripciones.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendientes ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.map((r) => (
            <label key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="flex items-center gap-3">
                <Checkbox
                  checked={false}
                  onCheckedChange={async (v) => {
                    await toggleRecurringPaid(r.id, Boolean(v));
                    if (v) {
                      await saveTransaction({
                        type: "egreso",
                        amount: Number(r.amount),
                        currency: r.currency,
                        concept: r.name,
                        payment_method: "transferencia",
                        category_id: r.category_id,
                        source: "recurrente",
                      });
                    }
                  }}
                />
                <span>
                  <span className="block font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Vence el día {r.due_day} · {r.frequency}
                  </span>
                </span>
              </span>
              <span className="text-sm font-semibold">{formatMoney(Number(r.amount), r.currency)}</span>
            </label>
          ))}
          {!pending.length && <p className="text-sm text-muted-foreground">Nada pendiente.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abonados este mes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {paid.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <button className="text-left text-muted-foreground underline" onClick={() => void toggleRecurringPaid(r.id, false)}>
                {r.name}
              </button>
              <span>{formatMoney(Number(r.amount), r.currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo fijo</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void add(e)}>
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix, Luz, Alquiler" required />
            </div>
            <div>
              <Label>Monto</Label>
              <Input className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label>Día de vencimiento</Label>
              <Input className="mt-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <Label>Frecuencia</Label>
              <Select className="mt-1.5" value={freq} onChange={(e) => setFreq(e.target.value as RecurrenceFrequency)}>
                <option value="mensual">Mensual</option>
                <option value="semanal">Semanal</option>
                <option value="anual">Anual</option>
              </Select>
            </div>
            <div>
              <Label>Categoría</Label>
              <Select className="mt-1.5" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Servicios / otras</option>
                {categories
                  .filter((c) => c.type === "egreso")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </div>
            <Button className="sm:col-span-2" type="submit">
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

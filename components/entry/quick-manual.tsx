"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFinance } from "@/components/providers/finance-provider";
import { matchCategory } from "@/lib/finance/match";
import { isoDate } from "@/lib/utils";

export function QuickManual() {
  const { categories, cards, saveTransaction, saveCard } = useFinance();
  const [mode, setMode] = useState<"ingreso" | "egreso" | "tarjeta">("egreso");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!n) {
      toast.error("Poné el monto.");
      return;
    }
    setBusy(true);
    try {
      const type = mode === "ingreso" ? "ingreso" : "egreso";
      const label = concept.trim() || (type === "ingreso" ? "Sueldo" : "Gasto");
      const cat = matchCategory(categories, type, label);
      let cardId: string | null = cards[0]?.id ?? null;
      if (mode === "tarjeta" && !cardId) {
        const created = await saveCard({ name: "Visa", kind: "principal", closing_day: 10, due_day: 20 });
        cardId = created.id;
      }
      await saveTransaction({
        type,
        amount: n,
        concept: label,
        payment_method: mode === "tarjeta" ? "tarjeta_credito" : type === "ingreso" ? "transferencia" : "efectivo",
        category_id: cat?.id ?? null,
        credit_card_id: mode === "tarjeta" ? cardId : null,
        occurred_on: isoDate(new Date()),
        source: "manual",
      });
      toast.success(mode === "ingreso" ? "Cobro sumado" : mode === "tarjeta" ? "Sumado a la tarjeta" : "Descontado");
      setConcept("");
      setAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["ingreso", "Cobré"],
            ["egreso", "Gasté"],
            ["tarjeta", "Con tarjeta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-xl px-2 py-2 text-sm font-medium ${
              mode === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Input
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder={mode === "ingreso" ? "Sueldo, freelance…" : "Milanesa, cigarrillos, asado…"}
      />
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="15000"
      />
      <Button className="h-11 w-full" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Listo"}
      </Button>
    </form>
  );
}

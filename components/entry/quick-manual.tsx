"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFinance } from "@/components/providers/finance-provider";
import { matchCategory } from "@/lib/finance/match";
import { isoDate } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

type Mode = "ingreso" | "efectivo" | "mp" | "tarjeta";

export function QuickManual() {
  const { categories, cards, saveTransaction, saveInstallmentPurchase, saveCard } = useFinance();
  const [mode, setMode] = useState<Mode>("efectivo");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [cardId, setCardId] = useState(cards.find((c) => c.kind === "principal")?.id ?? cards[0]?.id ?? "");
  const [cuotas, setCuotas] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cardId) {
      const fallback = cards.find((c) => c.kind === "principal")?.id ?? cards[0]?.id ?? "";
      if (fallback) setCardId(fallback);
    }
  }, [cards, cardId]);

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
      const method: PaymentMethod =
        mode === "tarjeta" ? "tarjeta_credito" : mode === "mp" ? "billetera" : type === "ingreso" ? "transferencia" : "efectivo";
      let resolvedCard = cardId;
      if (mode === "tarjeta" && !resolvedCard) {
        const created = await saveCard({ name: "Visa", kind: "principal", closing_day: 10, due_day: 20 });
        resolvedCard = created.id;
      }
      const cuotaN = Number(cuotas);
      if (mode === "tarjeta" && cuotaN >= 2 && resolvedCard) {
        await saveInstallmentPurchase({
          concept: label,
          installmentAmount: n,
          count: cuotaN,
          currency: "ARS",
          credit_card_id: resolvedCard,
          category_id: cat?.id ?? null,
          occurred_on: isoDate(new Date()),
          source: "manual",
        });
        toast.success(`${cuotaN} cuotas en la tarjeta`);
      } else {
        await saveTransaction({
          type,
          amount: n,
          concept: label,
          payment_method: method,
          category_id: cat?.id ?? null,
          credit_card_id: mode === "tarjeta" ? resolvedCard : null,
          occurred_on: isoDate(new Date()),
          source: "manual",
        });
        toast.success(
          mode === "ingreso" ? "Cobro sumado" : mode === "tarjeta" ? "Sumado a la tarjeta" : "Descontado",
        );
      }
      setConcept("");
      setAmount("");
      setCuotas("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <div className="grid grid-cols-4 gap-1">
        {(
          [
            ["ingreso", "Cobré"],
            ["efectivo", "Efectivo"],
            ["mp", "MP"],
            ["tarjeta", "Tarjeta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-xl px-1 py-2 text-xs font-medium ${
              mode === id
                ? id === "ingreso"
                  ? "bg-emerald-600 text-white"
                  : id === "efectivo"
                    ? "bg-amber-600 text-white"
                    : id === "mp"
                      ? "bg-sky-600 text-white"
                      : "bg-violet-700 text-white"
                : "bg-muted text-muted-foreground"
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
        placeholder={mode === "tarjeta" && Number(cuotas) >= 2 ? "Monto de cada cuota" : "15000"}
      />
      {mode === "tarjeta" ? (
        <>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cards.length === 0 ? <option value="">Nueva Visa</option> : null}
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === "extension" ? `${c.name} · extensión` : c.name}
              </option>
            ))}
          </Select>
          <Input
            value={cuotas}
            onChange={(e) => setCuotas(e.target.value)}
            inputMode="numeric"
            placeholder="Cuotas (opcional, ej 12)"
          />
        </>
      ) : null}
      <Button className="h-11 w-full" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Listo"}
      </Button>
    </form>
  );
}

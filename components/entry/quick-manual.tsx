"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFinance } from "@/components/providers/finance-provider";
import { householdCards } from "@/lib/finance/cards";
import { matchCategory } from "@/lib/finance/match";
import { parseAmountInput } from "@/lib/finance/amount";
import { withObservation } from "@/lib/finance/tx-notes";
import { addMonths, usdToLocal } from "@/lib/finance/settlement";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMoney, isoDate } from "@/lib/utils";
import type { CurrencyCode, PaymentMethod } from "@/lib/types";

type Mode = "ingreso" | "efectivo" | "mp" | "tarjeta";

export function QuickManual() {
  const {
    categories,
    cards,
    transactions,
    profile,
    saveTransaction,
    saveInstallmentPurchase,
    saveCard,
    linkCardService,
  } = useFinance();
  const { mine, visible } = householdCards(cards, transactions);
  const conceptRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("efectivo");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [categoryId, setCategoryId] = useState("");
  const [cardId, setCardId] = useState(mine?.id ?? visible[0]?.id ?? "");
  const [enCuotas, setEnCuotas] = useState(false);
  const [cuotas, setCuotas] = useState("");
  const [currentCuota, setCurrentCuota] = useState("1");
  const [asFixed, setAsFixed] = useState(false);
  const [observation, setObservation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cardId || !visible.some((c) => c.id === cardId)) {
      const fallback = mine?.id ?? visible[0]?.id ?? "";
      if (fallback) setCardId(fallback);
    }
  }, [visible, mine, cardId]);

  useEffect(() => {
    if (mode !== "tarjeta") {
      setCurrency("ARS");
      setAsFixed(false);
      setEnCuotas(false);
      setCuotas("");
      setCurrentCuota("1");
    }
    setCategoryId("");
  }, [mode]);

  const cuotaN = enCuotas ? Number(cuotas) : 0;
  const currentN = Math.min(Math.max(Number(currentCuota) || 1, 1), Math.max(cuotaN, 1));
  const remaining = cuotaN >= 2 ? Math.max(0, cuotaN - currentN) : 0;
  const parsedAmount = parseAmountInput(amount);
  const usdRate = Number(profile?.usd_exchange_rate ?? 0);
  const arsFromUsd = currency === "USD" && parsedAmount ? usdToLocal(parsedAmount, usdRate, 0) : 0;
  const typeCats = categories.filter((c) => c.type === (mode === "ingreso" ? "ingreso" : "egreso"));

  function focusConcept() {
    const go = () => conceptRef.current?.focus();
    requestAnimationFrame(go);
    setTimeout(go, 50);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parsedAmount;
    if (!n) {
      toast.error("Poné el monto.");
      return;
    }
    setBusy(true);
    try {
      const type = mode === "ingreso" ? "ingreso" : "egreso";
      const label = concept.trim() || (type === "ingreso" ? "Sueldo" : "Gasto");
      const cat = categories.find((c) => c.id === categoryId) ?? matchCategory(categories, type, label);
      const method: PaymentMethod =
        mode === "tarjeta" ? "tarjeta_credito" : mode === "mp" ? "billetera" : type === "ingreso" ? "transferencia" : "efectivo";
      let resolvedCard = cardId;
      if (mode === "tarjeta" && !resolvedCard) {
        const created = await saveCard({ name: "Visa ICBC", kind: "principal", closing_day: 1, due_day: 14 });
        resolvedCard = created.id;
      }
      const txCurrency: CurrencyCode = mode === "tarjeta" ? currency : "ARS";
      const notes = withObservation(null, observation);
      if (mode === "tarjeta" && cuotaN >= 2 && resolvedCard) {
        await saveInstallmentPurchase({
          concept: label,
          installmentAmount: n,
          count: cuotaN,
          current: currentN,
          currency: txCurrency,
          credit_card_id: resolvedCard,
          category_id: cat?.id ?? null,
          occurred_on: isoDate(new Date()),
          source: "manual",
          notes,
        });
        toast.success(`Cuota ${currentN}/${cuotaN} en la tarjeta`);
      } else {
        await saveTransaction({
          type,
          amount: n,
          currency: txCurrency,
          concept: label,
          payment_method: method,
          category_id: cat?.id ?? null,
          credit_card_id: mode === "tarjeta" ? resolvedCard : null,
          occurred_on: isoDate(new Date()),
          source: "manual",
          notes,
        });
        toast.success(
          mode === "ingreso" ? "Cobro sumado" : mode === "tarjeta" ? "Sumado a la tarjeta" : "Descontado",
        );
      }
      if (mode === "tarjeta" && asFixed && cuotaN < 2 && resolvedCard) {
        await linkCardService({
          name: label,
          amount: n,
          currency: txCurrency,
          credit_card_id: resolvedCard,
          category_id: cat?.id ?? null,
        });
        toast.message("Quedó como servicio fijo: se debita de la tarjeta, no de tu plata.");
      }
      setConcept("");
      setAmount("");
      setCategoryId("");
      setEnCuotas(false);
      setCuotas("");
      setCurrentCuota("1");
      setAsFixed(false);
      setObservation("");
      focusConcept();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const pickedCard = visible.find((c) => c.id === cardId);

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
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
        ref={conceptRef}
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder={mode === "ingreso" ? "Sueldo, freelance…" : "Milanesa, cigarrillos, asado…"}
      />
      <div className={mode === "tarjeta" ? "grid grid-cols-[1fr_auto] gap-2" : ""}>
        <AmountInput
          value={amount}
          onChange={setAmount}
          placeholder={mode === "tarjeta" && cuotaN >= 2 ? "Monto de cada cuota" : "15.000"}
        />
        {mode === "tarjeta" ? (
          <Select
            className="w-[5.5rem]"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </Select>
        ) : null}
      </div>
      {mode === "tarjeta" && currency === "USD" && parsedAmount > 0 && usdRate > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatMoney(parsedAmount, "USD")} → {formatMoney(arsFromUsd, "ARS")} (dólar tarjeta)
        </p>
      ) : null}
      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Categoría automática</option>
        {typeCats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {mode === "tarjeta" ? (
        <>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {visible.length === 0 ? <option value="">Visa ICBC</option> : null}
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === "extension" ? `${c.name} · extensión` : c.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enCuotas}
              onChange={(e) => {
                const on = e.target.checked;
                setEnCuotas(on);
                if (on) setAsFixed(false);
                else {
                  setCuotas("");
                  setCurrentCuota("1");
                }
              }}
              className="h-4 w-4 accent-violet-700"
            />
            Va en cuotas
          </label>
          {enCuotas ? (
            <>
              <Input
                value={cuotas}
                onChange={(e) => setCuotas(e.target.value)}
                inputMode="numeric"
                placeholder="Total de cuotas (ej 18)"
              />
              {cuotaN >= 2 ? (
                <>
                  <Input
                    value={currentCuota}
                    onChange={(e) => setCurrentCuota(e.target.value)}
                    inputMode="numeric"
                    placeholder="Voy por la cuota (ej 14)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cuota {currentN}/{cuotaN}
                    {remaining > 0
                      ? ` · faltan ${remaining} (${formatMoney(remaining * parsedAmount, currency)})`
                      : " · última"}
                    {" · termina "}
                    {format(addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), remaining), "MMMM yyyy", { locale: es })}
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asFixed}
                onChange={(e) => setAsFixed(e.target.checked)}
                className="h-4 w-4 accent-violet-700"
              />
              Es un servicio fijo mensual
            </label>
          )}
          {asFixed && pickedCard ? (
            <p className="text-xs text-muted-foreground">
              Aparece en Servicios a pagar · se paga con {pickedCard.name}, sin duplicar el gasto.
            </p>
          ) : null}
        </>
      ) : null}
      <Textarea
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
        placeholder="Observación (opcional)"
        className="min-h-16"
      />
      <Button className="h-11 w-full" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Listo"}
      </Button>
    </form>
  );
}

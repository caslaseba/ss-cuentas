"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategorySuggest } from "@/components/entry/category-suggest";
import { useEdition } from "@/components/providers/edition-provider";
import { useFinance } from "@/components/providers/finance-provider";
import { cardChoiceLabel, householdCards } from "@/lib/finance/cards";
import { chargePlacement, closeOnForMonth, shortMonth } from "@/lib/finance/close-cycle";
import { matchCategory } from "@/lib/finance/match";
import { describeCategoryChoice } from "@/lib/finance/similar-category";
import { parseAmountInput } from "@/lib/finance/amount";
import { withObservation } from "@/lib/finance/tx-notes";
import { addMonths, cycleSourceCard, usdToLocal } from "@/lib/finance/settlement";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMoney, isoDate } from "@/lib/utils";
import type { CurrencyCode, PaymentMethod } from "@/lib/types";

type Mode = "ingreso" | "transferencia" | "tarjeta" | "servicio";

type DraftLine = {
  key: string;
  mode: Mode;
  concept: string;
  amount: string;
  currency: CurrencyCode;
  categoryId: string;
  categoryName: string;
  cardId: string;
  enCuotas: boolean;
  cuotas: string;
  currentCuota: string;
  asFixed: boolean;
  observation: string;
  occurredOn: string;
};

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
    saveRecurring,
    saveCategory,
    monthCloses,
  } = useFinance();
  const { beta } = useEdition();
  const { mine, visible } = householdCards(cards, transactions);
  const conceptRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("ingreso");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [cardId, setCardId] = useState(mine?.id ?? visible[0]?.id ?? "");
  const [enCuotas, setEnCuotas] = useState(false);
  const [cuotas, setCuotas] = useState("");
  const [currentCuota, setCurrentCuota] = useState("1");
  const [asFixed, setAsFixed] = useState(false);
  const [observation, setObservation] = useState("");
  const [occurredOn, setOccurredOn] = useState(isoDate(new Date()));
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cardId || !visible.some((c) => c.id === cardId)) {
      const fallback = mine?.id ?? visible[0]?.id ?? "";
      if (fallback) setCardId(fallback);
    }
  }, [visible, mine, cardId]);

  useEffect(() => {
    if (mode !== "tarjeta" && !(beta && (mode === "ingreso" || mode === "servicio"))) {
      setCurrency("ARS");
    }
    if (mode !== "tarjeta") {
      setAsFixed(false);
      setEnCuotas(false);
      setCuotas("");
      setCurrentCuota("1");
    }
    setCategoryId("");
    setCategoryName("");
  }, [mode, beta]);

  const chargeDate = (() => {
    if (!occurredOn) return new Date();
    const parsed = new Date(`${occurredOn}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();
  const cuotaN = enCuotas ? Number(cuotas) : 0;
  const currentN = Math.min(Math.max(Number(currentCuota) || 1, 1), Math.max(cuotaN, 1));
  const remaining = cuotaN >= 2 ? Math.max(0, cuotaN - currentN) : 0;
  const parsedAmount = parseAmountInput(amount);
  const usdRate = Number(profile?.usd_exchange_rate ?? 0);
  const arsFromUsd = currency === "USD" && parsedAmount ? usdToLocal(parsedAmount, usdRate, 0) : 0;
  const typeCats = categories.filter((c) => c.type === (mode === "ingreso" ? "ingreso" : "egreso"));

  useEffect(() => {
    if (!beta && mode === "servicio") setMode("ingreso");
  }, [beta, mode]);

  function focusConcept() {
    const go = () => conceptRef.current?.focus();
    requestAnimationFrame(go);
    setTimeout(go, 50);
  }

  function lineFromForm(): DraftLine | null {
    if (!amount.trim()) return null;
    const n = parseAmountInput(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("El monto no puede ser negativo.");
      return null;
    }
    return {
      key: `${occurredOn}-${Date.now()}-${concept}`,
      mode,
      concept,
      amount,
      currency,
      categoryId,
      categoryName,
      cardId,
      enCuotas,
      cuotas,
      currentCuota,
      asFixed,
      observation,
      occurredOn,
    };
  }

  function clearItem() {
    setConcept("");
    setAmount("");
    setCategoryId("");
    setCategoryName("");
    setEnCuotas(false);
    setCuotas("");
    setCurrentCuota("1");
    setAsFixed(false);
    setObservation("");
  }

  function addDraft() {
    const line = lineFromForm();
    if (!line) {
      if (!amount.trim()) toast.error("Poné el monto. Puede ser 0.");
      return;
    }
    setDrafts((list) => [...list, line]);
    clearItem();
    focusConcept();
  }

  async function persistLine(line: DraftLine, quiet: boolean) {
    const n = parseAmountInput(line.amount);
    const type = line.mode === "ingreso" ? "ingreso" : "egreso";
    let categoryRecord =
      categories.find((c) => c.id === line.categoryId) ??
      matchCategory(categories, type, line.concept.trim() || (type === "ingreso" ? "Ingreso" : "Gasto"));
    if (beta && line.categoryName.trim()) {
      const choice = describeCategoryChoice(categories, type, line.categoryName);
      if (choice.kind === "exact" || choice.kind === "similar") {
        categoryRecord = choice.category;
        if (choice.kind === "similar") toast.message(`Ya existe “${choice.category.name}”. La uso en lugar de crear otra.`);
      } else if (choice.kind === "create") {
        categoryRecord = await saveCategory({ name: choice.name, type });
        toast.success(`Categoría nueva: ${categoryRecord.name}`);
      }
    } else if (beta && line.mode === "servicio" && line.concept.trim()) {
      const choice = describeCategoryChoice(categories, "egreso", line.concept);
      if (choice.kind === "exact" || choice.kind === "similar") {
        categoryRecord = choice.category;
        if (choice.kind === "similar") toast.message(`Ya existe “${choice.category.name}”. La uso en lugar de crear otra.`);
      } else if (choice.kind === "create") {
        categoryRecord = await saveCategory({ name: choice.name, type: "egreso" });
        toast.success(`Categoría nueva: ${categoryRecord.name}`);
      }
    }
    const cat = categoryRecord;
    const label = line.concept.trim() || cat?.name || (type === "ingreso" ? "Ingreso" : "Gasto");
    const method: PaymentMethod = line.mode === "tarjeta" ? "tarjeta_credito" : "transferencia";
    let resolvedCard = line.cardId;
    if (line.mode === "tarjeta" && !resolvedCard) {
      const created = await saveCard({ name: "Visa ICBC", kind: "principal", closing_day: 1, due_day: 14 });
      resolvedCard = created.id;
    }
    const txCurrency: CurrencyCode =
      line.mode === "tarjeta" || (beta && (line.mode === "ingreso" || line.mode === "servicio")) ? line.currency : "ARS";
    const notes = withObservation(null, line.observation);
    const when = line.occurredOn || isoDate(new Date());
    const lineCuotas = line.enCuotas ? Number(line.cuotas) : 0;
    const lineCurrent = Math.min(Math.max(Number(line.currentCuota) || 1, 1), Math.max(lineCuotas, 1));
    const lineDate = new Date(`${when}T12:00:00`);
    if (line.mode === "servicio") {
      await saveRecurring({
        name: label,
        amount: n,
        currency: txCurrency,
        frequency: "mensual",
        due_day: Math.min(28, lineDate.getDate() || 1),
        category_id: cat?.id ?? null,
        notes,
      });
      if (!quiet) toast.success("Mensual guardado");
      return;
    }
    if (line.mode === "tarjeta" && lineCuotas >= 2 && resolvedCard) {
      await saveInstallmentPurchase({
        concept: label,
        installmentAmount: n,
        count: lineCuotas,
        current: lineCurrent,
        currency: txCurrency,
        credit_card_id: resolvedCard,
        category_id: cat?.id ?? null,
        occurred_on: when,
        source: "manual",
        notes,
      });
      if (!quiet) toast.success(`Cuota ${lineCurrent}/${lineCuotas} en la tarjeta`);
    } else {
      await saveTransaction({
        type,
        amount: n,
        currency: txCurrency,
        concept: label,
        payment_method: method,
        category_id: cat?.id ?? null,
        credit_card_id: line.mode === "tarjeta" ? resolvedCard : null,
        occurred_on: when,
        source: "manual",
        notes,
      });
      if (!quiet) {
        toast.success(line.mode === "ingreso" ? "Ingreso sumado" : line.mode === "tarjeta" ? "Sumado a la tarjeta" : "Descontado");
      }
    }
    if (line.mode === "tarjeta" && line.asFixed && lineCuotas < 2 && resolvedCard) {
      await linkCardService({
        name: label,
        amount: n,
        currency: txCurrency,
        credit_card_id: resolvedCard,
        category_id: cat?.id ?? null,
      });
      toast.message("Quedó como mensual: se debita de la tarjeta y sigue en su categoría.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pending = [...drafts];
    if (amount.trim()) {
      const line = lineFromForm();
      if (!line) return;
      pending.push(line);
    } else if (!pending.length) {
      toast.error("Poné el monto. Puede ser 0.");
      return;
    }
    setBusy(true);
    const quiet = pending.length > 1;
    let saved = 0;
    try {
      for (const line of pending) {
        await persistLine(line, quiet);
        saved += 1;
      }
      if (quiet) toast.success(`${saved} movimientos del mismo día`);
      setDrafts([]);
      clearItem();
      setOccurredOn(isoDate(new Date()));
      focusConcept();
    } catch (err) {
      setDrafts(pending.slice(saved));
      if (saved > 0) clearItem();
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const pickedCard = visible.find((c) => c.id === cardId);
  const placement = (() => {
    if (mode !== "tarjeta" || !pickedCard) return null;
    const source = cycleSourceCard(pickedCard, cards);
    const closeOf = (month: Date) => closeOnForMonth(month, source.closing_day, monthCloses, source.id);
    return chargePlacement(occurredOn, closeOf);
  })();
  const readyCount = drafts.length + (amount.trim() ? 1 : 0);

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <div className={beta ? "grid grid-cols-2 gap-1 sm:grid-cols-4" : "grid grid-cols-3 gap-1"}>
        {(
          [
            ["ingreso", "Ingreso"],
            ["transferencia", beta ? "Gasto" : "Transferencia"],
            ["tarjeta", "Tarjeta"],
            ...(beta ? ([["servicio", "Mensual"]] as const) : []),
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
                  : id === "transferencia"
                    ? "bg-indigo-600 text-white"
                    : id === "servicio"
                      ? "bg-amber-700 text-white"
                      : "bg-violet-700 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="block text-[11px] text-muted-foreground">
        Fecha
        <Input
          className="mt-1"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        {mode === "servicio"
          ? "Figura hoy. El día de esta fecha es el vencimiento de cada mes. La categoría no cambia."
          : "Figura hoy. Cambiala si el gasto o el ingreso fue otro día. Podés sumar varios del mismo día antes de guardar."}
      </p>
      {placement ? (
        <p className="text-[11px] leading-snug text-violet-800 dark:text-violet-200">
          {placement.afterClose
            ? `Ya pasó el cierre. Aparece en ${shortMonth(placement.window)} y descuenta en ${shortMonth(placement.salary)}.`
            : `Entra en el período ${placement.period.start.slice(8)}/${placement.period.start.slice(5, 7)} → ${placement.period.end.slice(8)}/${placement.period.end.slice(5, 7)}. Descuenta en ${shortMonth(placement.salary)}.`}
        </p>
      ) : null}
      <Input
        ref={conceptRef}
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder={
          mode === "servicio" ? "Aysa, luz, Netflix…" : mode === "ingreso" ? "Cumpleaños, sueldo…" : "Milanesa, cigarrillos, asado…"
        }
      />
      <div className={mode === "tarjeta" || (beta && (mode === "ingreso" || mode === "servicio")) ? "grid grid-cols-[1fr_auto] gap-2" : ""}>
        <AmountInput
          value={amount}
          onChange={setAmount}
          placeholder={mode === "tarjeta" && cuotaN >= 2 ? "Monto de cada cuota" : "15.000"}
        />
        {mode === "tarjeta" || (beta && (mode === "ingreso" || mode === "servicio")) ? (
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
      {beta ? (
        <CategorySuggest
          categories={categories}
          type={mode === "ingreso" ? "ingreso" : "egreso"}
          value={categoryName}
          onChange={setCategoryName}
          placeholder={mode === "servicio" ? "Categoría, por ejemplo Casa" : "Categoría nueva o existente"}
        />
      ) : (
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Categoría automática</option>
          {typeCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      {mode === "tarjeta" ? (
        <>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {visible.length === 0 ? <option value="">Visa ICBC</option> : null}
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {cardChoiceLabel(c)}
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
                    {format(addMonths(new Date(chargeDate.getFullYear(), chargeDate.getMonth(), 1), remaining), "MMMM yyyy", { locale: es })}
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
              Es mensual
            </label>
          )}
          {asFixed && pickedCard ? (
            <p className="text-xs text-muted-foreground">
              Sigue en su categoría y figura en Mensual. Se paga con {pickedCard.name}, sin duplicar el gasto.
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
      {drafts.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-border p-2">
          {drafts.map((line) => (
            <li key={line.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                {line.mode === "ingreso" ? "Ingreso" : line.mode === "tarjeta" ? "Tarjeta" : line.mode === "servicio" ? "Mensual" : "Gasto"}
                {" · "}
                {line.concept.trim() || "Sin concepto"}
                {" · "}
                {line.amount}
              </span>
              <button
                type="button"
                className="shrink-0 text-[11px] font-medium text-muted-foreground"
                onClick={() => setDrafts((list) => list.filter((item) => item.key !== line.key))}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" disabled={busy} type="button" variant="outline" onClick={addDraft}>
          Otro del día
        </Button>
        <Button className="h-11" disabled={busy} type="submit">
          {busy ? "Guardando…" : readyCount > 1 ? `Guardar ${readyCount}` : "Listo"}
        </Button>
      </div>
    </form>
  );
}

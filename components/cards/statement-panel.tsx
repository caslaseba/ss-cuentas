"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AmountInput } from "@/components/ui/amount-input";
import { Select } from "@/components/ui/select";
import { parseAmountInput } from "@/lib/finance/amount";
import { DAD_CARD_NAME, MY_CARD_NAME } from "@/lib/finance/cards";
import { categoryChipClass, categoryTotals, groupCategory } from "@/lib/finance/style";
import { cardChargeOf, observationOf, type CardChargeKind } from "@/lib/finance/tx-notes";
import { closeMessage, isCycleClosed, type CardSummary } from "@/lib/finance/settlement";
import { cn, formatMoney } from "@/lib/utils";
import type { Category, CreditCard, Transaction } from "@/lib/types";

type Summary = CardSummary;

export function StatementPanel({
  title,
  hint,
  summary,
  mine,
  papa,
  categories,
  cards,
  toArs,
  now,
  onSelectTx,
  onAddCharge,
}: {
  title: string;
  hint: string;
  summary: Summary;
  mine: CreditCard;
  papa: CreditCard | null;
  categories: Category[];
  cards: CreditCard[];
  toArs: (amount: number, currency: Transaction["currency"]) => number;
  now: Date;
  onSelectTx: (tx: Transaction) => void;
  onAddCharge: (input: { concept: string; amount: number; kind: CardChargeKind }) => Promise<void>;
}) {
  const closed = isCycleClosed(summary.cycle, now);
  const papaSpent = summary.byCard.find((r) => r.id === papa?.id)?.amount ?? 0;
  const mineSpent = summary.byCard.find((r) => r.id === mine.id)?.amount ?? 0;
  const cats = categoryTotals(summary.tx, categories, toArs);
  const catMax = Math.max(...cats.map((c) => c.amount), summary.totalLocal, 1);
  const items = [...summary.tx].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const [kind, setKind] = useState<CardChargeKind>("impuesto");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function addCharge() {
    const n = parseAmountInput(amount);
    if (!n) {
      toast.error("Poné el monto del cargo.");
      return;
    }
    setBusy(true);
    try {
      const concept =
        kind === "impuesto" ? "Impuestos de la tarjeta" : kind === "interes" ? "Intereses de la tarjeta" : "Cargo de la tarjeta";
      await onAddCharge({ concept, amount: n, kind });
      setAmount("");
      toast.success("Cargo sumado al resumen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-violet-500/25 bg-violet-500/5">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-violet-900 dark:text-violet-200">{title}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <Badge tone={closed ? "usd" : summary.schedule.daysToClose <= 3 ? "danger" : "usd"}>
            {closed ? "Cerrado" : closeMessage(summary.schedule)}
          </Badge>
        </div>
        <p className="mt-2 text-3xl font-semibold text-violet-900 dark:text-violet-200">
          {formatMoney(summary.totalLocal, "ARS")}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.cycle.label}
          {closed ? " · ya cerrado" : " · todavía abierto"}
        </p>
        <p className="mt-1 text-sm text-violet-900/80 dark:text-violet-200/80">
          Tuya: {formatMoney(mineSpent, "ARS")}
        </p>
        <p className="text-sm text-violet-900/80 dark:text-violet-200/80">
          {DAD_CARD_NAME}: {formatMoney(papaSpent, "ARS")}
        </p>

        {cats.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-800/80 dark:text-violet-200/80">
              En qué se va
            </p>
            {cats.map((row) => (
              <div key={row.name} className={cn("rounded-xl border px-3 py-2", categoryChipClass(groupCategory(row.name)))}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="font-semibold">{formatMoney(row.amount, "ARS")}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-current opacity-70"
                    style={{ width: `${Math.max(8, (row.amount / catMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Todavía no hay consumos en este cierre.</p>
        )}

        {items.length > 0 ? (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-800/80 dark:text-violet-200/80">
              Detalle de consumos
            </p>
            {items.map((t) => {
              const card = cards.find((c) => c.id === t.credit_card_id);
              const charge = cardChargeOf(t.notes);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTx(t)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-background/60 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.concept}</p>
                    {observationOf(t.notes) ? (
                      <p className="truncate text-[11px] text-muted-foreground">{observationOf(t.notes)}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {format(parseISO(t.occurred_on), "d MMM", { locale: es })}
                      {" · "}
                      {card?.kind === "extension" ? card.name : MY_CARD_NAME}
                      {charge === "impuesto" ? " · impuesto" : charge === "interes" ? " · interés" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-violet-900 dark:text-violet-200">
                    {formatMoney(Number(t.amount), t.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 space-y-2 rounded-xl border border-violet-500/20 p-3">
          <p className="text-sm font-medium">Agregar impuesto o interés</p>
          <p className="text-xs text-muted-foreground">
            Lo que te cobra la Visa en el resumen. Queda en este cierre, no sale de tu plata.
          </p>
          <Select value={kind} onChange={(e) => setKind(e.target.value as CardChargeKind)}>
            <option value="impuesto">Impuestos de la tarjeta</option>
            <option value="interes">Intereses</option>
            <option value="otro">Otro cargo</option>
          </Select>
          <div className="flex gap-2">
            <AmountInput value={amount} onChange={setAmount} placeholder="Monto" />
            <Button type="button" disabled={busy} onClick={() => void addCharge()}>
              Sumar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

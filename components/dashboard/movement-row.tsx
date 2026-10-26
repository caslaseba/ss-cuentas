"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useFinance } from "@/components/providers/finance-provider";
import { sumNoteForCharge } from "@/lib/finance/close-cycle";
import { paymentMethodLabel } from "@/lib/finance/match";
import { cardOfTx, isProjectedTx } from "@/lib/finance/month-view";
import { cleanConceptName } from "@/lib/finance/recurring";
import { planProgress } from "@/lib/finance/settlement";
import {
  categoryChipClass,
  groupCategory,
  methodChipClass,
  movementAmountClass,
  movementRowClass,
} from "@/lib/finance/style";
import { isLeftoverTx, observationOf } from "@/lib/finance/tx-notes";
import { cn, formatMoney } from "@/lib/utils";
import type { Category, CreditCard, Installment, Transaction } from "@/lib/types";

export function MovementRow({
  tx,
  categories,
  cards,
  installments,
  tag = null,
  onSelect,
  picked = false,
  onPick,
}: {
  tx: Transaction;
  categories: Category[];
  cards: CreditCard[];
  installments: Installment[];
  cycleEnd?: Date | null;
  tag?: string | null;
  onSelect: (tx: Transaction) => void;
  picked?: boolean;
  onPick?: (tx: Transaction) => void;
}) {
  const { monthCloses } = useFinance();
  const sumNote = sumNoteForCharge(tx, cards, monthCloses);
  const cat = categories.find((c) => c.id === tx.category_id)?.name;
  const catGroup = groupCategory(cat);
  const sign = tx.type === "ingreso" ? "+" : "−";
  const card = cardOfTx(tx, cards);
  const plan = tx.installment_id ? installments.find((i) => i.id === tx.installment_id) : null;
  const progress = plan ? planProgress(plan, new Date()) : null;
  const methodName =
    tx.type === "ingreso"
      ? isLeftoverTx(tx.notes)
        ? "Sobra"
        : "Entrada"
      : tx.payment_method === "tarjeta_credito"
        ? card?.kind === "extension"
          ? card.name
          : "Tu Visa"
        : paymentMethodLabel(tx.payment_method);
  const projected = isProjectedTx(tx);
  const obs = observationOf(tx.notes);

  return (
    <button
      type="button"
      onClick={() => (onPick ? onPick(tx) : onSelect(tx))}
      aria-pressed={onPick ? picked : undefined}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border px-1.5 py-1 text-left",
        movementRowClass(tx),
        picked && "ring-2 ring-primary",
      )}
    >
      {onPick ? (
        <span
          className={cn(
            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] leading-none",
            picked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
          )}
          aria-hidden
        >
          {picked ? "✓" : ""}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight">{cleanConceptName(tx.concept)}</p>
        {obs ? <p className="truncate text-[9px] leading-tight text-muted-foreground">{obs}</p> : null}
        {plan && (tx.installment_number || progress) ? (
          <p className="text-[9px] leading-tight text-violet-800 dark:text-violet-200">
            Cuota {tx.installment_number ?? progress?.current}/{plan.installment_count}
            {progress && !tx.installment_number
              ? progress.isLast
                ? " · última"
                : ` · faltan ${progress.remainingAfterThis}`
              : null}
          </p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-medium", methodChipClass(tx.payment_method, tx.type))}>
            {methodName}
          </span>
          {tx.type === "egreso" ? (
            <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-medium", categoryChipClass(catGroup))}>
              {catGroup}
            </span>
          ) : null}
          {tag ? (
            <span className="rounded-full border border-teal-500/40 bg-teal-500/15 px-1.5 py-0 text-[9px] font-semibold uppercase text-teal-950 dark:text-teal-100">
              {tag}
            </span>
          ) : null}
          {sumNote ? (
            <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-1.5 py-0 text-[9px] font-medium text-violet-900 dark:text-violet-100">
              {sumNote}
            </span>
          ) : null}
          {projected ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[9px] font-medium text-amber-950 dark:text-amber-100">
              Estimado
            </span>
          ) : null}
          <span className="text-[9px] text-muted-foreground">
            {format(parseISO(tx.occurred_on), "d MMM", { locale: es })}
          </span>
        </div>
      </div>
      <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", movementAmountClass(tx))}>
        {sign}
        {formatMoney(Number(tx.amount), tx.currency)}
      </span>
    </button>
  );
}

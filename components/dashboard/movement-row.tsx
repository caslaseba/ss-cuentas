"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { paymentMethodLabel } from "@/lib/finance/match";
import { cardOfTx } from "@/lib/finance/month-view";
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
  onSelect,
}: {
  tx: Transaction;
  categories: Category[];
  cards: CreditCard[];
  installments: Installment[];
  cycleEnd?: Date | null;
  onSelect: (tx: Transaction) => void;
}) {
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
  const obs = observationOf(tx.notes);

  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm",
        movementRowClass(tx),
      )}
    >
      <div className="min-w-0">
        <p className="font-medium">{tx.concept}</p>
        {obs ? <p className="truncate text-[11px] text-muted-foreground">{obs}</p> : null}
        {progress && plan ? (
          <p className="text-[11px] text-violet-800 dark:text-violet-200">
            Cuota {progress.current}/{progress.total}
            {progress.isLast
              ? " · última"
              : ` · faltan ${progress.remainingAfterThis} (${formatMoney(progress.remainingAmount, plan.currency)})`}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1">
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", methodChipClass(tx.payment_method, tx.type))}>
            {methodName}
          </span>
          {tx.type === "egreso" ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", categoryChipClass(catGroup))}>
              {catGroup}
            </span>
          ) : null}
          {tx.payment_method === "tarjeta_credito" ? (
            <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-900 dark:text-violet-100">
              Va al próximo mes
            </span>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(tx.occurred_on), "d MMM", { locale: es })}
          </span>
        </div>
      </div>
      <span className={cn("shrink-0 font-semibold", movementAmountClass(tx))}>
        {sign}
        {formatMoney(Number(tx.amount), tx.currency)}
      </span>
    </button>
  );
}

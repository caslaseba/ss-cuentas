"use client";

import { useEffect, useMemo, useState } from "react";
import { useFinance } from "@/components/providers/finance-provider";
import { householdCards } from "@/lib/finance/cards";
import { cycleSourceCard, familyCardIds, getBillingCycle, summarizeCard, usdToLocal } from "@/lib/finance/settlement";
import {
  cardRefForMonth,
  cashMonthMoves,
  cashMonthSpend,
  cursorFromMes,
  projectedCashTxs,
  projectedInstallmentTxs,
  spendOnCard,
  typicalMonthlySalary,
  uniqueById,
} from "@/lib/finance/month-view";
import { monthIsFuture, monthIsPast, monthIsSealed } from "@/lib/finance/edit-lock";
import { hasCarryOver, monthWallet, shiftMonth } from "@/lib/finance/wallet";
import { monthKey, startOfMonth } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export function useMonthView(initial?: Date) {
  const finance = useFinance();
  const now = useMemo(() => new Date(), []);
  const initialKey = initial ? monthKey(startOfMonth(initial)) : "";
  const [cursor, setCursor] = useState(() => startOfMonth(initial ?? now));
  const { transactions, cards, profile, installments, recurring } = finance;
  const { mine, papa, visible } = householdCards(cards, transactions);
  const visibleIds = new Set(visible.map((c) => c.id));

  useEffect(() => {
    if (!initialKey) return;
    const next = cursorFromMes(initialKey);
    if (!next) return;
    setCursor((prev) => (monthKey(prev) === initialKey ? prev : startOfMonth(next)));
  }, [initialKey]);

  const toArs = (amount: number, currency: Transaction["currency"]) => {
    if (currency === "ARS") return amount;
    return usdToLocal(amount, Number(profile?.usd_exchange_rate ?? 0), 0);
  };

  const isCurrent = cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear();
  const isPast = monthIsPast(cursor, now);
  const isFuture = monthIsFuture(cursor, now);
  const wallet = monthWallet(transactions, toArs, cursor);
  const cardRef = cardRefForMonth(cursor, now);
  const monthStatement =
    mine && profile ? summarizeCard(mine, transactions, installments, profile, cards, cardRef) : null;
  const papaOutsideFamily =
    Boolean(mine && papa && !familyCardIds(mine, cards).includes(papa.id));
  const papaStatement =
    papaOutsideFamily && papa && profile
      ? summarizeCard(papa, transactions, installments, profile, cards, cardRef)
      : null;

  const cardIds = new Set([
    ...(mine ? familyCardIds(mine, cards) : []),
    ...(papa ? [papa.id] : []),
  ]);
  const realCardTx = uniqueById([...(monthStatement?.tx ?? []), ...(papaStatement?.tx ?? [])]);
  const liveCycle = mine ? getBillingCycle(cycleSourceCard(mine, cards), now) : null;
  const monthsAhead = monthStatement && liveCycle
    ? (monthStatement.cycle.end.getFullYear() - liveCycle.end.getFullYear()) * 12 +
      (monthStatement.cycle.end.getMonth() - liveCycle.end.getMonth())
    : 0;
  const projectedCuotas = monthStatement
    ? projectedInstallmentTxs(
        installments,
        monthStatement.cycle,
        realCardTx,
        transactions,
        cardIds,
        monthsAhead,
      )
    : [];
  const openCardTx = uniqueById([...realCardTx, ...projectedCuotas]);

  const realCashMoves = cashMonthMoves(wallet.monthTx);
  const projectedFijos =
    isFuture && profile
      ? projectedCashTxs(recurring, cursor, realCashMoves, profile.id)
      : [];
  const cashMoves = uniqueById([...realCashMoves, ...projectedFijos]);
  const cashSpend = cashMonthSpend(cashMoves);
  const monthMoves = uniqueById([...cashMoves, ...openCardTx]).sort((a, b) =>
    b.occurred_on.localeCompare(a.occurred_on),
  );

  const leftover = Math.max(0, monthWallet(transactions, toArs, shiftMonth(cursor, -1)).queda);
  const alreadyCarried = hasCarryOver(transactions, cursor);
  const canGoNext = startOfMonth(cursor).getTime() < startOfMonth(shiftMonth(now, 12)).getTime();

  const visaMia = spendOnCard(openCardTx, mine?.id ?? null, toArs);
  const visaPapa = spendOnCard(openCardTx, papa?.id ?? null, toArs);
  const tarjetaAbierta = openCardTx
    .filter((t) => t.type === "egreso")
    .reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);

  const typicalSalary = typicalMonthlySalary(transactions, toArs, now);
  const extraFijos = projectedFijos.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const cobrado = isFuture && wallet.cobrado <= 0 ? typicalSalary : wallet.cobrado;
  const gastadoContado = wallet.gastadoContado + extraFijos;
  const queda = cobrado - gastadoContado;
  const quedaSiPagaVisa = queda - visaMia;
  const estimated = isFuture && wallet.cobrado <= 0;
  const sealed = monthIsSealed(cursor, now, monthStatement?.cycle, recurring, transactions);

  return {
    ...finance,
    now,
    cursor,
    setCursor,
    isCurrent,
    isPast,
    isFuture,
    sealed,
    mine,
    papa,
    visible,
    visibleIds,
    toArs,
    wallet: { ...wallet, cobrado, gastadoContado, queda, monthTx: cashMoves },
    liveStatement: monthStatement,
    monthStatement,
    cashMoves,
    cashSpend,
    openCardTx,
    monthMoves,
    leftover,
    alreadyCarried,
    canGoNext,
    tarjetaAbierta,
    visaMia,
    visaPapa,
    typicalSalary,
    quedaSiPagaVisa,
    estimated,
  };
}

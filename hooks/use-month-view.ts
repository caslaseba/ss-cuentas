"use client";

import { useEffect, useMemo, useState } from "react";
import { useFinance } from "@/components/providers/finance-provider";
import { householdCards } from "@/lib/finance/cards";
import {
  cycleSourceCard,
  getBillingCycle,
  inCycle,
  statementRefForMonth,
  summarizeCard,
  usdToLocal,
} from "@/lib/finance/settlement";
import {
  cardChargesInMonth,
  cardRefForMonth,
  cashMonthMoves,
  cashMonthSpend,
  cursorFromMes,
  isOnOrBeforeClose,
  projectedCardRecurringTxs,
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

  const cardIds = new Set(cards.map((card) => card.id));
  const cycleCard = mine
    ? cycleSourceCard(mine, cards)
    : papa
      ? cycleSourceCard(papa, cards)
      : null;
  const liveCycle = cycleCard ? getBillingCycle(cycleCard, now) : null;
  const closingDay = Math.min(28, Math.max(1, Number(cycleCard?.closing_day || 1)));

  function projectFor(monthCursor: Date) {
    if (!cycleCard || !liveCycle) return [];
    const ref = statementRefForMonth(cycleCard, monthCursor);
    const cycle = getBillingCycle(cycleCard, ref);
    const ahead =
      (cycle.end.getFullYear() - liveCycle.end.getFullYear()) * 12 +
      (cycle.end.getMonth() - liveCycle.end.getMonth());
    if (ahead < 0) return [];
    const existing = transactions.filter(
      (t) => t.credit_card_id && cardIds.has(t.credit_card_id) && inCycle(t.occurred_on, cycle),
    );
    return projectedInstallmentTxs(installments, cycle, existing, transactions, cardIds, ahead);
  }

  const openCardTx = uniqueById([
    ...cardChargesInMonth(transactions, cursor, cardIds),
    ...projectFor(cursor),
    ...projectedCardRecurringTxs(recurring, transactions, cards, cursor, profile?.id ?? "", mine?.id ?? null),
  ]);
  const prevMonth = shiftMonth(cursor, -1);
  const prevPool = uniqueById([
    ...cardChargesInMonth(transactions, prevMonth, cardIds),
    ...projectFor(prevMonth),
  ]);
  const olderPool = uniqueById([
    ...cardChargesInMonth(transactions, shiftMonth(cursor, -2), cardIds),
    ...projectFor(shiftMonth(cursor, -2)),
  ]);
  const billBefore = prevPool.filter((t) => isOnOrBeforeClose(t.occurred_on, closingDay));
  const billAfter = olderPool.filter((t) => !isOnOrBeforeClose(t.occurred_on, closingDay));
  const sumsNext = openCardTx.filter((t) => isOnOrBeforeClose(t.occurred_on, closingDay));
  const sumsLater = openCardTx.filter((t) => !isOnOrBeforeClose(t.occurred_on, closingDay));

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
  const billMine =
    spendOnCard(billBefore, mine?.id ?? null, toArs) + spendOnCard(billAfter, mine?.id ?? null, toArs);
  const billPapa =
    spendOnCard(billBefore, papa?.id ?? null, toArs) + spendOnCard(billAfter, papa?.id ?? null, toArs);

  const typicalSalary = typicalMonthlySalary(transactions, toArs, now);
  const extraFijos = projectedFijos.reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const cobrado = isFuture && wallet.cobrado <= 0 ? typicalSalary : wallet.cobrado;
  const gastadoContado = wallet.gastadoContado + extraFijos;
  const queda = cobrado - gastadoContado;
  const quedaSiPagaVisa = queda - billMine;
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
    closingDay,
    billBefore,
    billAfter,
    billMine,
    billPapa,
    sumsNext,
    sumsLater,
    typicalSalary,
    quedaSiPagaVisa,
    estimated,
  };
}

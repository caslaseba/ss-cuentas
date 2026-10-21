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
  PROJECTED_FIJO_PREFIX,
  cardChargesInMonth,
  cardRefForMonth,
  cashMonthMoves,
  cashMonthSpend,
  cashRecurringPaid,
  cursorFromMes,
  projectedCardRecurringTxs,
  projectedCashTxs,
  projectedInstallmentTxs,
  spendOnCard,
  typicalMonthlySalary,
  uniqueById,
} from "@/lib/finance/month-view";
import { closeOnForMonth } from "@/lib/finance/close-cycle";
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
  const closingDayDefault = Math.min(28, Math.max(1, Number(cycleCard?.closing_day || 1)));
  const closes = finance.monthCloses;

  function closeOf(monthCursor: Date) {
    if (!cycleCard) return closeOnForMonth(monthCursor, closingDayDefault, [], "");
    return closeOnForMonth(monthCursor, closingDayDefault, closes, cycleCard.id);
  }

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

  function pool(monthCursor: Date) {
    return uniqueById([
      ...cardChargesInMonth(transactions, monthCursor, cardIds),
      ...projectFor(monthCursor),
      ...projectedCardRecurringTxs(recurring, transactions, cards, monthCursor, profile?.id ?? "", mine?.id ?? null),
    ]);
  }

  function parted(monthCursor: Date) {
    const closeOn = closeOf(monthCursor);
    const txs = pool(monthCursor);
    return {
      closeOn,
      next: txs.filter((t) => t.occurred_on <= closeOn),
      later: txs.filter((t) => t.occurred_on > closeOn),
    };
  }

  const currentPart = parted(cursor);
  const prevPart = parted(shiftMonth(cursor, -1));
  const olderPart = parted(shiftMonth(cursor, -2));
  const oldestPart = parted(shiftMonth(cursor, -3));
  const openCardTx = currentPart.next.concat(currentPart.later);
  const closeOn = currentPart.closeOn;
  const closingDay = Number(closeOn.slice(8, 10)) || closingDayDefault;
  const sumsNext = currentPart.next;
  const sumsLater = currentPart.later;
  const statementTx = uniqueById([...prevPart.next, ...olderPart.later]);
  const payableTx = uniqueById([...olderPart.next, ...oldestPart.later]);
  const billBefore = prevPart.next;
  const billAfter = olderPart.later;

  const realCashMoves = cashMonthMoves(wallet.monthTx);
  const projectedFijos =
    profile && !isPast
      ? projectedCashTxs(recurring, cursor, realCashMoves, profile.id).filter((tx) => {
          const item = recurring.find((r) => tx.id.startsWith(`${PROJECTED_FIJO_PREFIX}${r.id}-`));
          if (!item) return true;
          return !cashRecurringPaid(item, transactions, cursor, isCurrent);
        })
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
  const billMine = spendOnCard(payableTx, mine?.id ?? null, toArs);
  const billPapa = spendOnCard(payableTx, papa?.id ?? null, toArs);

  const typicalSalary = typicalMonthlySalary(transactions, toArs, now);
  const extraFijos = (isFuture ? projectedFijos : []).reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
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
    cycleCard,
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
    closeOn,
    billBefore,
    billAfter,
    billMine,
    billPapa,
    sumsNext,
    sumsLater,
    statementTx,
    payableTx,
    typicalSalary,
    quedaSiPagaVisa,
    estimated,
  };
}

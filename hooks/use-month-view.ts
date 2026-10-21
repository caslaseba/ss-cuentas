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
import { closeOnForMonth, describedPeriod, salaryMonthOf } from "@/lib/finance/close-cycle";
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

  const closeOn = closeOf(cursor);
  const prevClose = closeOf(shiftMonth(cursor, -1));
  const closingDay = Number(closeOn.slice(8, 10)) || closingDayDefault;
  const period = describedPeriod(cursor, closeOf);
  const laterPeriod = describedPeriod(shiftMonth(cursor, 1), closeOf);

  const projectedSpan = [-3, -2, -1, 0, 1, 2].flatMap((delta) => {
    const monthCursor = shiftMonth(cursor, delta);
    return [
      ...projectFor(monthCursor),
      ...projectedCardRecurringTxs(recurring, transactions, cards, monthCursor, profile?.id ?? "", mine?.id ?? null),
    ];
  });
  const cardUniverse = uniqueById([
    ...transactions.filter((tx) => tx.type === "egreso" && tx.payment_method === "tarjeta_credito"),
    ...projectedSpan,
  ]);

  function hitsSalary(monthCursor: Date) {
    const key = monthKey(monthCursor);
    return cardUniverse.filter((tx) => {
      const salary = salaryMonthOf(tx.occurred_on, closeOf);
      return Boolean(salary && monthKey(salary) === key);
    });
  }

  const openCardTx = pool(cursor);
  const hitsNow = hitsSalary(cursor);
  const hitsNext = hitsSalary(shiftMonth(cursor, 1));
  const hitsLater = hitsSalary(shiftMonth(cursor, 2));

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

  function cardSum(txs: Transaction[]) {
    return txs
      .filter((tx) => tx.type === "egreso")
      .reduce((sum, tx) => sum + toArs(Number(tx.amount), tx.currency), 0);
  }

  const prevWallet = monthWallet(transactions, toArs, shiftMonth(cursor, -1));
  const prevCardHit = cardSum(hitsSalary(shiftMonth(cursor, -1)));
  const leftover = Math.max(0, prevWallet.cobrado - prevWallet.gastadoContado - prevCardHit);
  const alreadyCarried = hasCarryOver(transactions, cursor);
  const canGoNext = startOfMonth(cursor).getTime() < startOfMonth(shiftMonth(now, 12)).getTime();

  const visaMia = spendOnCard(openCardTx, mine?.id ?? null, toArs);
  const visaPapa = spendOnCard(openCardTx, papa?.id ?? null, toArs);
  const tarjetaAbierta = openCardTx
    .filter((t) => t.type === "egreso")
    .reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const cardHitsNow = cardSum(hitsNow);
  const cardHitsNext = cardSum(hitsNext);
  const cardHitsLater = cardSum(hitsLater);

  const typicalSalary = typicalMonthlySalary(transactions, toArs, now);
  const extraFijos = (isFuture ? projectedFijos : []).reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const cobrado = isFuture && wallet.cobrado <= 0 ? typicalSalary : wallet.cobrado;
  const gastadoContado = wallet.gastadoContado + extraFijos;
  const queda = cobrado - gastadoContado - cardHitsNow;
  const quedaSiPagaVisa = queda;
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
    prevClose,
    periodStart: period.start,
    periodEnd: period.end,
    laterStart: laterPeriod.start,
    laterEnd: laterPeriod.end,
    cardHitsNow,
    cardHitsNext,
    cardHitsLater,
    salaryMonthFor: (iso: string) => salaryMonthOf(iso, closeOf),
    typicalSalary,
    quedaSiPagaVisa,
    estimated,
  };
}

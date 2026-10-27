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
import { amountForMonth, BOOKS_START_ISO, BOOKS_START_MONTH, isCardRecurring, recurringApplies } from "@/lib/finance/recurring";
import { cardBillItemIds, cardBillMonthOf, isCardBillPayment, isUnpaidCarryPayment } from "@/lib/finance/tx-notes";
import { walkUnpaidCarry } from "@/lib/finance/unpaid-carry";
import { closeOnForMonth, describedPeriod, salaryMonthOf } from "@/lib/finance/close-cycle";
import { monthIsFuture, monthIsPast, monthIsSealed } from "@/lib/finance/edit-lock";
import { hasCarryOver, monthWallet, shiftMonth } from "@/lib/finance/wallet";
import { monthKey, startOfMonth } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export function useMonthView(initial?: Date) {
  const finance = useFinance();
  const now = useMemo(() => new Date(), []);
  const initialKey = initial ? monthKey(startOfMonth(initial)) : "";
  const [cursor, setCursorState] = useState(() => {
    const start = startOfMonth(initial ?? now);
    return monthKey(start) < BOOKS_START_MONTH ? new Date(2026, 9, 1) : start;
  });
  const setCursor = (value: Date | ((prev: Date) => Date)) => {
    setCursorState((prev) => {
      const next = startOfMonth(typeof value === "function" ? value(prev) : value);
      if (monthKey(next) < BOOKS_START_MONTH) return prev;
      return next;
    });
  };
  const { transactions: allTransactions, cards, profile, installments, recurring, categories } = finance;
  const transactions = allTransactions.filter((tx) => tx.occurred_on >= BOOKS_START_ISO);
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
    const start = closeOf(shiftMonth(monthCursor, -1));
    const end = closeOf(monthCursor);
    const inPeriod = (iso: string) => Boolean(start && end && start <= end && iso >= start && iso <= end);
    const real = transactions.filter(
      (tx) =>
        tx.type === "egreso" &&
        tx.payment_method === "tarjeta_credito" &&
        tx.credit_card_id != null &&
        cardIds.has(tx.credit_card_id) &&
        inPeriod(tx.occurred_on),
    );
    return uniqueById([
      ...real,
      ...projectFor(monthCursor).filter((tx) => inPeriod(tx.occurred_on)),
      ...projectedCardRecurringTxs(recurring, transactions, cards, monthCursor, profile?.id ?? "", mine?.id ?? null).filter(
        (tx) => inPeriod(tx.occurred_on),
      ),
    ]);
  }

  const closeOn = closeOf(cursor);
  const prevClose = closeOf(shiftMonth(cursor, -1));
  const salaryPeriod = describedPeriod(shiftMonth(cursor, -1), closeOf);
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

  const previousMonth = shiftMonth(cursor, -1);
  const previousInBooks = monthKey(previousMonth) >= BOOKS_START_MONTH;
  const prevWallet = monthWallet(transactions, toArs, previousMonth);
  const leftover = previousInBooks ? Math.max(0, prevWallet.cobrado - prevWallet.gastadoContado) : 0;
  const alreadyCarried = hasCarryOver(transactions, cursor);
  const canGoNext = startOfMonth(cursor).getTime() < startOfMonth(shiftMonth(now, 12)).getTime();

  const visaMia = spendOnCard(openCardTx, mine?.id ?? null, toArs);
  const visaPapa = spendOnCard(openCardTx, papa?.id ?? null, toArs);
  const tarjetaAbierta = openCardTx
    .filter((t) => t.type === "egreso")
    .reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const paidCardIds = new Set<string>();
  const fullPaidMonths = new Set<string>();
  for (const tx of transactions) {
    if (tx.type !== "egreso" || tx.payment_method === "tarjeta_credito" || !isCardBillPayment(tx.notes)) continue;
    const items = cardBillItemIds(tx.notes);
    const month = cardBillMonthOf(tx.notes);
    if (!items.length && month) fullPaidMonths.add(month);
    for (const id of items) paidCardIds.add(id);
  }
  const settledCardIds = new Set(paidCardIds);
  for (const month of fullPaidMonths) {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) continue;
    for (const tx of hitsSalary(new Date(year, monthNumber - 1, 1))) {
      if (tx.type === "egreso") settledCardIds.add(tx.id);
    }
  }
  const unpaidNow = hitsNow.filter(
    (tx) => tx.type === "egreso" && !fullPaidMonths.has(monthKey(cursor)) && !paidCardIds.has(tx.id),
  );
  const cardHitsNow = cardSum(unpaidNow);
  const cardHitsNext = cardSum(hitsNext);
  const cardHitsLater = cardSum(hitsLater);
  const cardDue = unpaidNow
    .reduce(
      (sum, tx) => {
        const amount = toArs(Number(tx.amount), tx.currency);
        if (papa && tx.credit_card_id === papa.id) sum.extension += amount;
        else sum.visa += amount;
        sum.total += amount;
        return sum;
      },
      { visa: 0, extension: 0, total: 0 },
    );

  const nowMonth = monthKey(now);
  const viewedKey = monthKey(cursor);
  const unpaidCarry = walkUnpaidCarry({
    viewedMonth: viewedKey,
    nowMonth,
    booksStart: BOOKS_START_MONTH,
    born: (key) => {
      const [year, monthNumber] = key.split("-").map(Number);
      const monthDate = new Date(year, (monthNumber || 1) - 1, 1);
      const bill = cardSum(hitsSalary(monthDate));
      const paid = transactions.reduce((sum, tx) => {
        if (tx.type !== "egreso" || tx.payment_method === "tarjeta_credito" || !isCardBillPayment(tx.notes, key)) return sum;
        const amount = toArs(Number(tx.amount), tx.currency);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      const parts = [];
      const cardLeft = Math.round((bill - paid) * 100) / 100;
      if (cardLeft > 0.004) parts.push({ kind: "tarjeta" as const, month: key, name: "Tarjeta sin cubrir", amount: cardLeft });
      for (const item of recurring) {
        if (isCardRecurring(item) || !recurringApplies(item, key)) continue;
        const priced = amountForMonth(item, key);
        if (priced.voided) continue;
        if (cashRecurringPaid(item, transactions, monthDate, key === nowMonth)) continue;
        const amount = toArs(priced.amount, priced.currency);
        if (!(amount > 0.004)) continue;
        parts.push({ kind: "servicio" as const, month: key, name: item.name, amount });
      }
      return parts;
    },
    paidIn: (key, source) =>
      transactions.reduce((sum, tx) => {
        if (tx.type !== "egreso" || tx.payment_method === "tarjeta_credito") return sum;
        if (tx.occurred_on.slice(0, 7) !== key || !isUnpaidCarryPayment(tx.notes, source)) return sum;
        const amount = toArs(Number(tx.amount), tx.currency);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0),
  });

  const salaryEstimate = typicalMonthlySalary(transactions, categories, toArs, now);
  const typicalSalary = salaryEstimate.amount;
  const extraFijos = (isFuture ? projectedFijos : []).reduce((sum, t) => sum + toArs(Number(t.amount), t.currency), 0);
  const cobrado = isFuture && wallet.cobrado <= 0 ? typicalSalary : wallet.cobrado;
  const gastadoContado = wallet.gastadoContado + extraFijos;
  const queda = cobrado - gastadoContado - unpaidCarry.left;
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
    canGoPrev: monthKey(cursor) > BOOKS_START_MONTH,
    cardDue,
    cardBillTx: unpaidNow,
    salaryCardTx: hitsNow,
    salaryCardFrom: salaryPeriod.start,
    salaryCardTo: salaryPeriod.end,
    settledCardIds: [...settledCardIds],
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
    salarySamples: salaryEstimate.samples,
    quedaSiPagaVisa,
    estimated,
    unpaidCarry,
  };
}

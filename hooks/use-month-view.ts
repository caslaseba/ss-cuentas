"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/components/providers/finance-provider";
import { householdCards } from "@/lib/finance/cards";
import { statementRefForMonth, summarizeCard, usdToLocal } from "@/lib/finance/settlement";
import { cashMonthMoves, cashMonthSpend, uniqueById } from "@/lib/finance/month-view";
import { hasCarryOver, monthWallet, shiftMonth } from "@/lib/finance/wallet";
import { startOfMonth } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export function useMonthView(initial?: Date) {
  const finance = useFinance();
  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => startOfMonth(initial ?? now));
  const { transactions, cards, profile, installments } = finance;
  const { mine, papa, visible } = householdCards(cards, transactions);
  const visibleIds = new Set(visible.map((c) => c.id));

  const toArs = (amount: number, currency: Transaction["currency"]) => {
    if (currency === "ARS") return amount;
    return usdToLocal(amount, Number(profile?.usd_exchange_rate ?? 0), 0);
  };

  const wallet = monthWallet(transactions, toArs, cursor);
  const isCurrent = cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear();
  const liveStatement =
    mine && profile ? summarizeCard(mine, transactions, installments, profile, cards, now) : null;
  const monthStatement =
    mine && profile ? summarizeCard(mine, transactions, installments, profile, cards, statementRefForMonth(mine, cursor)) : null;

  const cashMoves = cashMonthMoves(wallet.monthTx);
  const cashSpend = cashMonthSpend(wallet.monthTx);
  const openCardTx = liveStatement?.tx ?? [];
  const monthMoves = uniqueById([...cashMoves, ...openCardTx]).sort((a, b) =>
    b.occurred_on.localeCompare(a.occurred_on),
  );

  const leftover = Math.max(0, monthWallet(transactions, toArs, shiftMonth(cursor, -1)).queda);
  const alreadyCarried = hasCarryOver(transactions, cursor);
  const lastNavigable = startOfMonth(liveStatement?.cycle.end ?? now);
  const canGoNext = startOfMonth(cursor).getTime() < lastNavigable.getTime();
  const tarjetaAbierta = liveStatement?.totalLocal ?? 0;
  const visaMia = liveStatement?.byCard.find((c) => c.id === mine?.id)?.amount ?? 0;
  const visaPapa = papa ? liveStatement?.byCard.find((c) => c.id === papa.id)?.amount ?? 0 : 0;

  return {
    ...finance,
    now,
    cursor,
    setCursor,
    isCurrent,
    mine,
    papa,
    visible,
    visibleIds,
    toArs,
    wallet,
    liveStatement,
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
  };
}

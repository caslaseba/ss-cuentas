"use client";

import { useMemo, useState } from "react";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  EMPTY_SEARCH,
  filterTransactions,
  groupMovesByCategory,
  searchTotals,
  type MoveSort,
  type SearchFilters,
} from "@/lib/finance/search";
import { categoryChipClass, groupCategory } from "@/lib/finance/style";
import { cn, formatMoney } from "@/lib/utils";
import type { Category, CreditCard, Installment, Transaction } from "@/lib/types";

function Chip({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function MonthMoves({
  transactions,
  categories,
  cards,
  installments,
  toArs,
  onSelect,
  emptyHint,
}: {
  transactions: Transaction[];
  categories: Category[];
  cards: CreditCard[];
  installments: Installment[];
  toArs: (amount: number, currency: Transaction["currency"]) => number;
  onSelect: (tx: Transaction) => void;
  emptyHint?: string;
}) {
  const [filters, setFilters] = useState<SearchFilters>({ ...EMPTY_SEARCH, monthOnly: false });
  const [sort, setSort] = useState<MoveSort>("az");
  const [amountQuery, setAmountQuery] = useState("");

  const hits = useMemo(() => {
    const applied: SearchFilters = {
      ...filters,
      query: amountQuery,
      inName: !amountQuery.trim(),
      inCategory: !amountQuery.trim(),
      inAmount: true,
    };
    return filterTransactions(transactions, categories, applied);
  }, [transactions, categories, filters, amountQuery]);
  const totals = useMemo(() => searchTotals(hits, toArs), [hits, toArs]);
  const groups = useMemo(
    () => groupMovesByCategory(hits, categories, toArs, sort),
    [hits, categories, toArs, sort],
  );
  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const raw = categories.find((c) => c.id === t.category_id)?.name ?? (t.type === "ingreso" ? "Ingresos" : "Sin categoría");
      set.add(groupCategory(raw));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [transactions, categories]);

  function patch(next: Partial<SearchFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function toggleCat(name: string) {
    setFilters((prev) => {
      const has = prev.categoryNames.includes(name);
      return {
        ...prev,
        categoryNames: has ? prev.categoryNames.filter((n) => n !== name) : [...prev.categoryNames, name],
      };
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1">
        <Select value={filters.type} onChange={(e) => patch({ type: e.target.value as SearchFilters["type"] })}>
          <option value="todos">Tipo: todos</option>
          <option value="egreso">Gastos</option>
          <option value="ingreso">Ingresos</option>
        </Select>
        <Select value={filters.method} onChange={(e) => patch({ method: e.target.value as SearchFilters["method"] })}>
          <option value="todos">Medio: todos</option>
          <option value="plata">Plata ahora</option>
          <option value="tarjeta">Tarjeta</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as MoveSort)}>
          <option value="az">A → Z</option>
          <option value="valor-desc">Mayor $</option>
          <option value="valor-asc">Menor $</option>
        </Select>
      </div>
      <Input
        value={amountQuery}
        onChange={(e) => setAmountQuery(e.target.value)}
        placeholder="Filtrar por valor, ej 15000"
        inputMode="decimal"
      />
      {cats.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {cats.map((name) => (
            <Chip key={name} on={filters.categoryNames.includes(name)} label={name} onClick={() => toggleCat(name)} />
          ))}
        </div>
      ) : null}

      {hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint ?? "Todavía no hay movimientos."}</p>
      ) : (
        <>
          <div className="rounded-md border border-border bg-muted/40 px-1.5 py-1.5">
            <p className="text-[10px] font-medium leading-tight text-muted-foreground">Total filtrado</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(totals.ahora + totals.tarjeta + (filters.type === "ingreso" ? totals.cobros : 0), "ARS")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-1">
              <p className="text-[10px] font-medium leading-tight text-amber-800 dark:text-amber-200">Plata ahora</p>
              <p className="text-[11px] font-semibold tabular-nums">{formatMoney(totals.ahora, "ARS")}</p>
            </div>
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1">
              <p className="text-[10px] font-medium leading-tight text-violet-800 dark:text-violet-200">Tarjeta · este mes</p>
              <p className="text-[11px] font-semibold tabular-nums">{formatMoney(totals.tarjeta, "ARS")}</p>
            </div>
          </div>
          {totals.cobros > 0 ? (
            <p className="text-[10px] text-muted-foreground">Ingresos en esta lista {formatMoney(totals.cobros, "ARS")}</p>
          ) : null}

          {groups.map((group) => (
            <section key={group.name} className="space-y-1">
              <div className={cn("rounded-md border px-1.5 py-1", categoryChipClass(group.name))}>
                <p className="truncate text-[11px] font-medium leading-tight">{group.name}</p>
                <p className="text-[10px] leading-tight tabular-nums">
                  {group.ahora > 0 ? `Ahora ${formatMoney(group.ahora, "ARS")}` : null}
                  {group.ahora > 0 && group.tarjeta > 0 ? " · " : null}
                  {group.tarjeta > 0 ? `Tarjeta ${formatMoney(group.tarjeta, "ARS")}` : null}
                  {group.ingresos > 0 ? `Ingresos ${formatMoney(group.ingresos, "ARS")}` : null}
                  {!group.ahora && !group.tarjeta && !group.ingresos ? "—" : null}
                </p>
              </div>
              {group.items.map((t) => (
                <MovementRow
                  key={t.id}
                  tx={t}
                  categories={categories}
                  cards={cards}
                  installments={installments}
                  onSelect={onSelect}
                />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

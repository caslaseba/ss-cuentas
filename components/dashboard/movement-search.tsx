"use client";

import { useMemo, useState } from "react";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EMPTY_SEARCH, filterTransactions, searchTotals, type SearchFilters } from "@/lib/finance/search";
import { groupCategory } from "@/lib/finance/style";
import { cn, formatMoney, monthKey } from "@/lib/utils";
import type { Category, CreditCard, Installment, Transaction } from "@/lib/types";

function Toggle({
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

export function MovementSearch({
  transactions,
  categories,
  cards,
  installments,
  toArs,
  onSelect,
}: {
  transactions: Transaction[];
  categories: Category[];
  cards: CreditCard[];
  installments: Installment[];
  toArs: (amount: number, currency: Transaction["currency"]) => number;
  onSelect: (tx: Transaction) => void;
}) {
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH);
  const thisMonth = monthKey(new Date());
  const pool = useMemo(
    () =>
      filters.monthOnly
        ? transactions.filter((t) => monthKey(new Date(`${t.occurred_on}T12:00:00`)) === thisMonth)
        : transactions,
    [filters.monthOnly, thisMonth, transactions],
  );
  const hits = useMemo(() => filterTransactions(pool, categories, filters), [pool, categories, filters]);
  const totals = useMemo(() => searchTotals(hits, toArs), [hits, toArs]);
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) set.add(groupCategory(c.name));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [categories]);
  const active =
    Boolean(filters.query.trim()) ||
    filters.type !== "todos" ||
    filters.method !== "todos" ||
    filters.monthOnly ||
    filters.categoryNames.length > 0;

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
    <div className="space-y-2">
      <Input
        autoFocus
        value={filters.query}
        onChange={(e) => patch({ query: e.target.value })}
        placeholder="Nombre, categoría o 4665…"
      />
      <div className="flex flex-wrap gap-1">
        <Toggle on={filters.inName} label="Nombre" onClick={() => patch({ inName: !filters.inName })} />
        <Toggle on={filters.inCategory} label="Categoría" onClick={() => patch({ inCategory: !filters.inCategory })} />
        <Toggle on={filters.inAmount} label="Cantidad" onClick={() => patch({ inAmount: !filters.inAmount })} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Select value={filters.type} onChange={(e) => patch({ type: e.target.value as SearchFilters["type"] })}>
          <option value="todos">Todos</option>
          <option value="egreso">Gastos</option>
          <option value="ingreso">Ingresos</option>
        </Select>
        <Select value={filters.method} onChange={(e) => patch({ method: e.target.value as SearchFilters["method"] })}>
          <option value="todos">Cualquier medio</option>
          <option value="plata">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </Select>
        <Select
          value={filters.monthOnly ? "mes" : "todos"}
          onChange={(e) => patch({ monthOnly: e.target.value === "mes" })}
        >
          <option value="todos">Todos los meses</option>
          <option value="mes">Este mes</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map((name) => (
          <Toggle
            key={name}
            on={filters.categoryNames.includes(name)}
            label={name}
            onClick={() => toggleCat(name)}
          />
        ))}
      </div>
      {active ? (
        <div className="space-y-2">
          {hits.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada coincide.</p>
          ) : (
            <>
              <div className="space-y-1">
                <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">Total filtrado</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(totals.ahora + totals.tarjeta + (filters.type === "ingreso" ? totals.cobros : 0), "ARS")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                    <p className="text-[11px] font-medium text-amber-950 dark:text-amber-100">Plata ahora</p>
                    <p className="text-[11px] font-semibold tabular-nums">{formatMoney(totals.ahora, "ARS")}</p>
                  </div>
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1.5">
                    <p className="text-[11px] font-medium text-violet-900 dark:text-violet-100">Tarjeta · próximo mes</p>
                    <p className="text-[11px] font-semibold tabular-nums">{formatMoney(totals.tarjeta, "ARS")}</p>
                  </div>
                </div>
                {totals.cobros > 0 && filters.type !== "ingreso" ? (
                  <p className="text-[11px] text-muted-foreground">
                    Ingresos {formatMoney(totals.cobros, "ARS")} · {totals.count} resultado
                    {totals.count === 1 ? "" : "s"}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {totals.count} resultado{totals.count === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              {hits.slice(0, 40).map((t) => (
                <MovementRow
                  key={t.id}
                  tx={t}
                  categories={categories}
                  cards={cards}
                  installments={installments}
                  onSelect={onSelect}
                />
              ))}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Escribí o tildá una categoría para ver movimientos.</p>
      )}
    </div>
  );
}

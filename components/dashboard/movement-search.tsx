"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MovementRow } from "@/components/dashboard/movement-row";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EMPTY_SEARCH, filterTransactions, type SearchFilters } from "@/lib/finance/search";
import type { Category, CreditCard, Installment, Transaction } from "@/lib/types";

export function MovementSearch({
  transactions,
  monthTransactions,
  categories,
  cards,
  installments,
  onSelect,
  fallback,
}: {
  transactions: Transaction[];
  monthTransactions: Transaction[];
  categories: Category[];
  cards: CreditCard[];
  installments: Installment[];
  onSelect: (tx: Transaction) => void;
  fallback?: ReactNode;
}) {
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH);
  const hits = useMemo(() => {
    const pool = filters.monthOnly ? monthTransactions : transactions;
    return filterTransactions(pool, categories, { ...filters, monthOnly: false }, () => "", "");
  }, [transactions, monthTransactions, categories, filters]);
  const active = Boolean(filters.query.trim()) || filters.type !== "todos" || filters.method !== "todos" || !filters.monthOnly;

  function patch(next: Partial<SearchFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Cada movimiento</h2>
      <Input
        value={filters.query}
        onChange={(e) => patch({ query: e.target.value })}
        placeholder="Buscar: milanesa, 4665, 4.665…"
      />
      <div className="grid grid-cols-3 gap-1.5">
        <Select value={filters.type} onChange={(e) => patch({ type: e.target.value as SearchFilters["type"] })}>
          <option value="todos">Todos</option>
          <option value="egreso">Gastos</option>
          <option value="ingreso">Cobros</option>
        </Select>
        <Select value={filters.method} onChange={(e) => patch({ method: e.target.value as SearchFilters["method"] })}>
          <option value="todos">Cualquier medio</option>
          <option value="plata">Transferencia</option>
          <option value="mp">Mercado Pago</option>
          <option value="tarjeta">Tarjeta</option>
        </Select>
        <Select
          value={filters.monthOnly ? "mes" : "todos"}
          onChange={(e) => patch({ monthOnly: e.target.value === "mes" })}
        >
          <option value="mes">Este mes</option>
          <option value="todos">Todos los meses</option>
        </Select>
      </div>
      {active ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {hits.length === 0 ? "Nada coincide." : `${hits.length} resultado${hits.length === 1 ? "" : "s"}`}
          </p>
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
        </div>
      ) : (
        fallback
      )}
    </div>
  );
}

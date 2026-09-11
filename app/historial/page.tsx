"use client";

import { useMemo, useState } from "react";
import { downloadCsv, transactionsToCsv } from "@/lib/finance/export-csv";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";

export default function HistorialPage() {
  const { transactions, categories, cards } = useFinance();
  const [q, setQ] = useState("");
  const [type, setType] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [card, setCard] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (type !== "todos" && t.type !== type) return false;
      if (category !== "todas" && t.category_id !== category) return false;
      if (card !== "todas" && t.credit_card_id !== card) return false;
      if (from && t.occurred_on < from) return false;
      if (to && t.occurred_on > to) return false;
      if (q && !t.concept.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [transactions, q, type, category, card, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} movimientos</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(`ss-cuentas-${new Date().toISOString().slice(0, 10)}.csv`, transactionsToCsv(filtered))
          }
        >
          Exportar CSV
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input placeholder="Buscar concepto" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="todos">Tipo</option>
          <option value="ingreso">Ingreso</option>
          <option value="egreso">Egreso</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="todas">Categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={card} onChange={(e) => setCard(e.target.value)}>
          <option value="todas">Tarjeta</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="hidden grid-cols-5 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Fecha</span>
          <span>Concepto</span>
          <span>Categoría</span>
          <span>Medio</span>
          <span className="text-right">Monto</span>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((t) => (
            <li key={t.id} className="grid gap-1 px-4 py-3 sm:grid-cols-5 sm:items-center">
              <span className="text-sm text-muted-foreground">{t.occurred_on}</span>
              <div>
                <p className="text-sm font-medium">{t.concept}</p>
                <Badge tone={t.type === "ingreso" ? "ok" : "danger"}>{t.type}</Badge>
              </div>
              <span className="text-sm">
                {categories.find((c) => c.id === t.category_id)?.name ?? "—"}
              </span>
              <span className="text-sm capitalize">{t.payment_method.replace("_", " ")}</span>
              <span className="text-right text-sm font-semibold">
                {t.type === "egreso" ? "−" : "+"}
                {formatMoney(Number(t.amount), t.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { MovementRow } from "@/components/dashboard/movement-row";
import { useMonthView } from "@/hooks/use-month-view";
import {
  categoryFromSlug,
  categoryOriginSplit,
  cursorFromMes,
  txsForCategory,
} from "@/lib/finance/month-view";
import { methodBoxClass } from "@/lib/finance/style";
import { cn, formatMoney, monthKey } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <CategoriaInner params={params} />
    </Suspense>
  );
}

function CategoriaInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const search = useSearchParams();
  const name = categoryFromSlug(slug);
  const view = useMonthView(cursorFromMes(search.get("mes")));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const mes = monthKey(view.cursor);
  const row = categoryOriginSplit(
    view.cashSpend,
    view.openCardTx,
    view.categories,
    view.mine?.id ?? null,
    view.papa?.id ?? null,
    view.toArs,
  ).find((r) => r.name === name);
  const grouped = txsForCategory(name, view.cashSpend, view.openCardTx, view.categories);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link href={`/resumen?mes=${mes}`} className="text-sm text-primary">
        ← Resumen
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-sm text-muted-foreground">Cada gasto de esta categoría.</p>
        <p className="mt-1 text-2xl font-semibold">{formatMoney(row?.total ?? 0, "ARS")}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {(row?.sueldo ?? 0) > 0 ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", methodBoxClass("Efectivo"))}>
            Tu sueldo {formatMoney(row?.sueldo ?? 0, "ARS")}
          </span>
        ) : null}
        {(row?.visa ?? 0) > 0 ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", methodBoxClass("Tarjeta"))}>
            Tu Visa {formatMoney(row?.visa ?? 0, "ARS")}
          </span>
        ) : null}
        {(row?.papa ?? 0) > 0 ? (
          <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-medium">
            Visa papá {formatMoney(row?.papa ?? 0, "ARS")}
          </span>
        ) : null}
      </div>

      {grouped.sueldo.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">De tu sueldo</h2>
          <p className="text-xs text-muted-foreground">Efectivo, Mercado Pago o transferencia.</p>
          {grouped.sueldo.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={setEditing}
            />
          ))}
        </section>
      ) : null}

      {grouped.tarjeta.length > 0 ? (
        <section className="space-y-2 pb-4">
          <h2 className="text-sm font-medium">De tarjeta · va al próximo mes</h2>
          <p className="text-xs text-muted-foreground">Tu Visa o la extensión de papá.</p>
          {grouped.tarjeta.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={setEditing}
            />
          ))}
        </section>
      ) : null}

      {grouped.sueldo.length === 0 && grouped.tarjeta.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay gastos en esta categoría este mes.</p>
      ) : null}

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
    </div>
  );
}

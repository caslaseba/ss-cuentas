"use client";

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PinGate } from "@/components/entry/pin-gate";
import { TransactionEdit } from "@/components/entry/transaction-edit";
import { MovementRow } from "@/components/dashboard/movement-row";
import { useDropInstallment } from "@/hooks/use-drop-installment";
import { useEditGate } from "@/hooks/use-edit-gate";
import { useMonthView } from "@/hooks/use-month-view";
import { planIdFromProjectedCuota } from "@/lib/finance/installment-drop";
import {
  categoryFromSlug,
  categoryOriginSplit,
  cursorFromMes,
  isProjectedTx,
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
  const { askPin, pinError, guard, submitPin, closePin } = useEditGate();
  const dropInstallment = useDropInstallment();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const mes = monthKey(view.cursor);

  function selectTx(tx: Transaction) {
    if (planIdFromProjectedCuota(tx.id)) {
      guard(() => {
        void dropInstallment(tx);
      }, view.isPast);
      return;
    }
    if (isProjectedTx(tx)) {
      toast.message("Es una proyección: todavía no se debitó.");
      return;
    }
    guard(() => setEditing(tx), view.isPast);
  }
  const row = categoryOriginSplit(
    view.cashMoves,
    view.openCardTx,
    view.categories,
    view.mine?.id ?? null,
    view.papa?.id ?? null,
    view.toArs,
  ).find((r) => r.name === name);
  const grouped = txsForCategory(name, view.cashMoves, view.openCardTx, view.categories, view.papa?.id ?? null);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link href={`/resumen?mes=${mes}`} className="text-sm text-primary">
        ← Resumen
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-sm text-muted-foreground">Lo que entró y lo que salió en esta categoría.</p>
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
            Extensión {formatMoney(row?.papa ?? 0, "ARS")}
          </span>
        ) : null}
        {(row?.ingreso ?? 0) > 0 ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", methodBoxClass("Efectivo"))}>
            Entró {formatMoney(row?.ingreso ?? 0, "ARS")}
          </span>
        ) : null}
      </div>

      {grouped.ingreso.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Ingresos</h2>
          {grouped.ingreso.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={selectTx}
            />
          ))}
        </section>
      ) : null}

      {grouped.sueldo.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">De tu sueldo</h2>
          <p className="text-xs text-muted-foreground">Sale por transferencia.</p>
          {grouped.sueldo.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={selectTx}
            />
          ))}
        </section>
      ) : null}

      {grouped.visa.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Mi tarjeta</h2>
          <p className="text-xs text-muted-foreground">Se ve en este mes. La tarjeta descuenta del sueldo del período que cierra, no de este.</p>
          {grouped.visa.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={selectTx}
            />
          ))}
        </section>
      ) : null}

      {grouped.papa.length > 0 ? (
        <section className="space-y-2 pb-4">
          <h2 className="text-sm font-medium">Extensión</h2>
          {grouped.papa.map((t) => (
            <MovementRow
              key={t.id}
              tx={t}
              categories={view.categories}
              cards={view.cards}
              installments={view.installments}
              onSelect={selectTx}
            />
          ))}
        </section>
      ) : null}

      {grouped.ingreso.length === 0 && grouped.sueldo.length === 0 && grouped.visa.length === 0 && grouped.papa.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay movimientos en esta categoría este mes.</p>
      ) : null}

      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <PinGate open={askPin} error={pinError} onClose={closePin} onSubmit={submitPin} />
    </div>
  );
}

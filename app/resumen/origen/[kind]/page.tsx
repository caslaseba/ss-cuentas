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
import { cursorFromMes, isProjectedTx, originLabel, txsForOrigin, type OriginKind } from "@/lib/finance/month-view";
import { formatMoney, monthKey } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

const KINDS: OriginKind[] = ["plata", "tarjeta", "visa", "papa"];

function asKind(value: string): OriginKind {
  return KINDS.includes(value as OriginKind) ? (value as OriginKind) : "tarjeta";
}

export default function OrigenPage({ params }: { params: Promise<{ kind: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <OrigenInner params={params} />
    </Suspense>
  );
}

function OrigenInner({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = use(params);
  const kind = asKind(raw);
  const search = useSearchParams();
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
  const papaId = view.papa?.id ?? null;
  const list = txsForOrigin(kind, view.cashMoves, view.openCardTx, papaId);
  const mineList = list.filter((t) => t.credit_card_id !== papaId);
  const papaList = list.filter((t) => Boolean(papaId) && t.credit_card_id === papaId);
  const total = list
    .filter((t) => t.type === "egreso")
    .reduce((s, t) => s + view.toArs(Number(t.amount), t.currency), 0);
  const hint =
    kind === "plata"
      ? "Sale de tu sueldo por transferencia."
      : `Se ve en este mes. Del ${view.periodStart.slice(8, 10)}/${view.periodStart.slice(5, 7)} al ${view.periodEnd.slice(8, 10)}/${view.periodEnd.slice(5, 7)} descuenta el mes que viene.`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link href={`/resumen?mes=${mes}`} className="text-sm text-primary">
        ← Resumen
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{originLabel(kind)}</h1>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <p className="mt-1 text-2xl font-semibold">{formatMoney(total, "ARS")}</p>
      </div>
      {kind === "tarjeta" && view.papa ? (
        <div className="space-y-4 pb-4">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Mi tarjeta</h2>
            <p className="text-sm font-semibold">{formatMoney(view.visaMia, "ARS")}</p>
            {mineList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos en tu tarjeta.</p>
            ) : (
              mineList.map((t) => (
                <MovementRow
                  key={t.id}
                  tx={t}
                  categories={view.categories}
                  cards={view.cards}
                  installments={view.installments}
                  onSelect={selectTx}
                />
              ))
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Extensión</h2>
            <p className="text-sm font-semibold">{formatMoney(view.visaPapa, "ARS")}</p>
            {papaList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos en la extensión.</p>
            ) : (
              papaList.map((t) => (
                <MovementRow
                  key={t.id}
                  tx={t}
                  categories={view.categories}
                  cards={view.cards}
                  installments={view.installments}
                  onSelect={selectTx}
                />
              ))
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos acá.</p>
          ) : (
            list.map((t) => (
              <MovementRow
                key={t.id}
                tx={t}
                categories={view.categories}
                cards={view.cards}
                installments={view.installments}
                onSelect={selectTx}
              />
            ))
          )}
        </div>
      )}
      <TransactionEdit tx={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
      <PinGate open={askPin} error={pinError} onClose={closePin} onSubmit={submitPin} />
    </div>
  );
}

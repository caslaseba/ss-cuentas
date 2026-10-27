"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EdesurMeterPhotos } from "@/components/dashboard/edesur-photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { brotherSettlement, splitBillByKwh, type EdesurMonth } from "@/lib/finance/edesur";
import { formatMoney } from "@/lib/utils";

function kwhText(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function EdesurSplitDialog({
  open,
  onOpenChange,
  month,
  monthLabel,
  billAmount,
  received,
  saved,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  monthLabel: string;
  billAmount: number;
  received: number;
  saved: EdesurMonth | null;
  onSave: (input: Pick<EdesurMonth, "totalKwh" | "totalBill" | "mineKwh" | "brotherKwh">) => Promise<void>;
}) {
  const [totalKwh, setTotalKwh] = useState("");
  const [bill, setBill] = useState("");
  const [mine, setMine] = useState("");
  const [brother, setBrother] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (saved) {
      setTotalKwh(formatAmountFromNumber(saved.totalKwh));
      setBill(formatAmountFromNumber(saved.totalBill));
      setMine(formatAmountFromNumber(saved.mineKwh));
      setBrother(formatAmountFromNumber(saved.brotherKwh));
      return;
    }
    setTotalKwh("");
    setBill(billAmount > 0 ? formatAmountFromNumber(billAmount) : "");
    setMine("");
    setBrother("");
  }, [open, saved, billAmount]);

  const split = splitBillByKwh({
    totalKwh: parseAmountInput(totalKwh),
    totalBill: parseAmountInput(bill),
    mineKwh: parseAmountInput(mine),
    brotherKwh: parseAmountInput(brother),
  });
  const balance = split ? brotherSettlement(split.brother, received) : null;

  async function save() {
    if (!split || split.exceeds || saving) return;
    setSaving(true);
    try {
      await onSave({
        totalKwh: parseAmountInput(totalKwh),
        totalBill: parseAmountInput(bill),
        mineKwh: parseAmountInput(mine),
        brotherKwh: parseAmountInput(brother),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el reparto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repartir EDESUR de {monthLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El total de la factura se divide por los kWh totales. Cada uno paga ese precio por lo que consumió. Queda
          guardado en {monthLabel}.
        </p>
        <div className="mt-3 rounded-md border border-border px-2 py-2">
          <EdesurMeterPhotos month={month} monthLabel={monthLabel} />
        </div>
        <div className="mt-3 space-y-2">
          <div>
            <Label htmlFor="edesur-kwh">kWh totales de la factura</Label>
            <Input
              id="edesur-kwh"
              className="mt-1.5"
              inputMode="decimal"
              value={totalKwh}
              onChange={(event) => setTotalKwh(event.target.value)}
              placeholder="Ej. 850"
            />
          </div>
          <div>
            <Label htmlFor="edesur-bill">Total de la factura</Label>
            <Input
              id="edesur-bill"
              className="mt-1.5"
              inputMode="decimal"
              value={bill}
              onChange={(event) => setBill(event.target.value)}
              placeholder="Ej. 496.293,54"
            />
            {billAmount > 0 ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-primary"
                onClick={() => setBill(formatAmountFromNumber(billAmount))}
              >
                Usar el monto de este mes ({formatMoney(billAmount, "ARS")})
              </button>
            ) : null}
          </div>
          <div>
            <Label htmlFor="edesur-mine">kWh que consumí yo</Label>
            <Input
              id="edesur-mine"
              className="mt-1.5"
              inputMode="decimal"
              value={mine}
              onChange={(event) => setMine(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edesur-brother">kWh que consumió mi hermano</Label>
            <Input
              id="edesur-brother"
              className="mt-1.5"
              inputMode="decimal"
              value={brother}
              onChange={(event) => setBrother(event.target.value)}
            />
          </div>
        </div>
        {split && balance ? (
          <div className="mt-3 space-y-1 rounded-md border border-border px-2 py-2 text-sm">
            <p className="flex items-baseline justify-between gap-2">
              <span>Yo pago</span>
              <span className="font-semibold tabular-nums">{formatMoney(split.mine, "ARS")}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span>Mi hermano paga</span>
              <span className="font-semibold tabular-nums">{formatMoney(split.brother, "ARS")}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">Cada kWh sale {formatMoney(split.rate, "ARS")}.</p>
            {split.exceeds ? (
              <p className="text-[11px] text-destructive">Entre los dos superan los kWh totales de la factura.</p>
            ) : split.otherKwh > 0.000001 ? (
              <p className="text-[11px] text-muted-foreground">
                Quedan {kwhText(split.otherKwh)} kWh sin asignar ({formatMoney(split.otherAmount, "ARS")}).
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {received > 0 ? `Este mes ya te entró por EDESUR ${formatMoney(received, "ARS")}. ` : "Este mes todavía no te entró plata por EDESUR. "}
              {balance.kind === "cubierto"
                ? "Cubre la parte de tu hermano."
                : balance.kind === "demas"
                  ? `Te pasó ${formatMoney(balance.amount, "ARS")} de más.`
                  : `Le faltan ${formatMoney(balance.amount, "ARS")}.`}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Completá los kWh totales y el total de la factura para ver cuánto paga cada uno.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" disabled={!split || split.exceeds || saving} onClick={() => void save()}>
            {saving ? "Guardando…" : `Guardar en ${monthLabel}`}
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

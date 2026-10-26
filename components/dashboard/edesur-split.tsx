"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { splitBillByKwh } from "@/lib/finance/edesur";
import { formatMoney } from "@/lib/utils";

const STORAGE_KEY = "ss-cuentas-edesur-kwh";

type Draft = { totalKwh: string; bill: string; mine: string; brother: string };

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      totalKwh: String(parsed.totalKwh ?? ""),
      bill: String(parsed.bill ?? ""),
      mine: String(parsed.mine ?? ""),
      brother: String(parsed.brother ?? ""),
    };
  } catch {
    return null;
  }
}

function kwhText(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function EdesurSplitDialog({
  open,
  onOpenChange,
  billAmount,
  received,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billAmount: number;
  received: number;
}) {
  const [totalKwh, setTotalKwh] = useState("");
  const [bill, setBill] = useState("");
  const [mine, setMine] = useState("");
  const [brother, setBrother] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const saved = readDraft();
    setTotalKwh(saved?.totalKwh ?? "");
    setBill(saved?.bill || (billAmount > 0 ? formatAmountFromNumber(billAmount) : ""));
    setMine(saved?.mine ?? "");
    setBrother(saved?.brother ?? "");
    setReady(true);
  }, [open, billAmount]);

  useEffect(() => {
    if (!open || !ready || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ totalKwh, bill, mine, brother }));
  }, [open, ready, totalKwh, bill, mine, brother]);

  const split = splitBillByKwh({
    totalKwh: parseAmountInput(totalKwh),
    totalBill: parseAmountInput(bill),
    mineKwh: parseAmountInput(mine),
    brotherKwh: parseAmountInput(brother),
  });
  const gap = split ? received - split.brother : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repartir EDESUR</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El total de la factura se divide por los kWh totales. Cada uno paga ese precio por lo que consumió.
        </p>
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
        {split ? (
          <div className="mt-3 space-y-1 rounded-md border border-border px-2 py-2 text-sm">
            <p className="flex items-baseline justify-between gap-2">
              <span>Yo pago</span>
              <span className="font-semibold tabular-nums">{formatMoney(split.mine, "ARS")}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span>Mi hermano paga</span>
              <span className="font-semibold tabular-nums">{formatMoney(split.brother, "ARS")}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Cada kWh sale {formatMoney(split.rate, "ARS")}.
            </p>
            {split.exceeds ? (
              <p className="text-[11px] text-destructive">
                Entre los dos superan los kWh totales de la factura.
              </p>
            ) : split.otherKwh > 0.000001 ? (
              <p className="text-[11px] text-muted-foreground">
                Quedan {kwhText(split.otherKwh)} kWh sin asignar ({formatMoney(split.otherAmount, "ARS")}).
              </p>
            ) : null}
            {received > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Este mes ya te entró por EDESUR {formatMoney(received, "ARS")}.{" "}
                {Math.abs(gap) < 1
                  ? "Cubre la parte de tu hermano."
                  : gap > 0
                    ? `Te pasó ${formatMoney(gap, "ARS")} de más.`
                    : `Le faltan ${formatMoney(-gap, "ARS")}.`}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Completá los kWh totales y el total de la factura para ver cuánto paga cada uno.
          </p>
        )}
        <div className="mt-4">
          <Button className="w-full" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

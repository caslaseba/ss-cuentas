"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { CardManager } from "@/components/cards/card-manager";
import { CategoryManager } from "@/components/categories/category-manager";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ZoomToggle } from "@/components/layout/zoom-toggle";
import { WalletBalances } from "@/components/accounts/wallet-balances";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { householdCards } from "@/lib/finance/cards";
import { parseAmountInput } from "@/lib/finance/amount";
import { isCardRecurring, withRecurringVia } from "@/lib/finance/recurring";
import { formatMoney } from "@/lib/utils";
import { InstallApp } from "@/components/pwa/install-app";
import type { RecurringPayment } from "@/lib/types";

export default function MasPage() {
  const { recurring, saveRecurring, cards, transactions } = useFinance();
  const { visible } = householdCards(cards, transactions);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedDay, setFixedDay] = useState("10");
  const [fixedPay, setFixedPay] = useState("plata");
  const [editing, setEditing] = useState<RecurringPayment | null>(null);

  useEffect(() => {
    void fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d: { admin?: boolean }) => setIsAdmin(Boolean(d.admin)))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-5 md:max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Más</h1>
        <p className="text-sm text-muted-foreground">
          Cierre y vencimiento de la tarjeta, extensión de tu papá, servicios y ajustes.
        </p>
      </div>

      <WalletBalances />

      <CardManager />

      <CategoryManager />

      <Card>
        <CardHeader>
          <CardTitle>Servicios fijos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay fijos. Agregá luz, internet, expensas…</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tocá uno para cambiar el monto, si se debita de la Visa, o borrarlo.
            </p>
          )}
          {recurring.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditing(r)}
              className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm"
            >
              <span>
                {r.name}{" "}
                <span className="text-muted-foreground">
                  {isCardRecurring(r) ? " · se debita con la Visa" : ` · día ${r.due_day}${r.is_paid ? " · pagado" : ""}`}
                </span>
              </span>
              <span className="font-medium">{formatMoney(Number(r.amount), r.currency)}</span>
            </button>
          ))}
          <form
            className="grid grid-cols-3 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRecurring({
                name: fixedName,
                amount: parseAmountInput(fixedAmount),
                due_day: fixedPay === "plata" ? Number(fixedDay) || 10 : 1,
                frequency: "mensual",
                notes: withRecurringVia(null, fixedPay !== "plata", fixedPay !== "plata" && fixedPay !== "tarjeta" ? fixedPay : visible[0]?.id ?? null),
              })
                .then(() => {
                  toast.success(
                    fixedPay === "plata"
                      ? "Servicio agregado. Lo ves en Hoy para marcarlo pagado."
                      : "Servicio de tarjeta agregado. Aparece en Hoy sin restar de tu plata.",
                  );
                  setFixedName("");
                  setFixedAmount("");
                  setFixedPay("plata");
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
            }}
          >
            <Input
              className="col-span-3"
              value={fixedName}
              onChange={(e) => setFixedName(e.target.value)}
              placeholder="Luz, gas, internet…"
              required
            />
            <AmountInput value={fixedAmount} onChange={setFixedAmount} placeholder="Monto" required />
            {fixedPay === "plata" ? (
              <label className="block text-[11px] text-muted-foreground">
                Día del mes
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={fixedDay}
                  onChange={(e) => setFixedDay(e.target.value)}
                  placeholder="10"
                />
              </label>
            ) : (
              <p className="self-center text-xs text-muted-foreground">Sin vencimiento: se paga con la tarjeta</p>
            )}
            <Select
              className="col-span-3"
              value={fixedPay}
              onChange={(e) => setFixedPay(e.target.value)}
            >
              <option value="plata">Lo pago yo</option>
              {visible.map((c) => (
                <option key={c.id} value={c.id}>
                  Se debita de {c.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usar en el celular o en cualquier PC</CardTitle>
        </CardHeader>
        <CardContent>
          <InstallApp />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 pb-4">
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <p className="text-sm">Vista</p>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <p className="text-sm">Tamaño</p>
          <ZoomToggle />
        </div>
        <Button asChild variant="outline">
          <Link href="/configuracion">Ajustes y contraseña</Link>
        </Button>
        {isAdmin ? (
          <Button asChild variant="outline">
            <Link href="/usuarios">Usuarios</Link>
          </Button>
        ) : null}
      </div>

      <RecurringEdit item={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
    </div>
  );
}

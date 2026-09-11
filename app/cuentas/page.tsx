"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import type { AccountKind } from "@/lib/types";

export default function CuentasPage() {
  const { accounts, saveAccount, saveTransaction } = useFinance();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("caja_ahorro");
  const [balance, setBalance] = useState("");
  const [savings, setSavings] = useState(true);

  const boxes = accounts.filter((a) => a.is_savings_box);
  const daily = accounts.filter((a) => !a.is_savings_box);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveAccount({
        name,
        kind,
        balance: Number(balance) || 0,
        is_savings_box: savings,
      });
      toast.success("Cuenta creada");
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  async function moveToBox(id: string, amount: number) {
    const box = accounts.find((a) => a.id === id);
    if (!box) return;
    await saveTransaction({
      type: "egreso",
      amount,
      currency: "ARS",
      concept: `Resguardo a ${box.name}`,
      payment_method: "transferencia",
      account_id: id,
      source: "manual",
    });
    toast.success("Dinero separado de la caja diaria");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cajas y fondos</h1>
        <p className="text-sm text-muted-foreground">
          Separá el dinero del día a día en fondos de ahorro.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase text-muted-foreground">Disponible</h2>
          <div className="space-y-3">
            {daily.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {a.name}
                    <Badge>{a.kind.replace("_", " ")}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{formatMoney(Number(a.balance), a.currency)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase text-muted-foreground">Fondos / cajas de ahorro</h2>
          <div className="space-y-3">
            {boxes.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>{a.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold">{formatMoney(Number(a.balance), a.currency)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const n = Number(prompt("Monto a resguardar en ARS") ?? "");
                      if (n > 0) void moveToBox(a.id, n);
                    }}
                  >
                    Separar dinero
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Nueva caja</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void add(e)}>
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select className="mt-1.5" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
                <option value="efectivo">Efectivo</option>
                <option value="caja_ahorro">Caja de ahorro</option>
                <option value="billetera">Billetera virtual</option>
              </Select>
            </div>
            <div>
              <Label>Saldo inicial</Label>
              <Input className="mt-1.5" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={savings} onChange={(e) => setSavings(e.target.checked)} />
              Es fondo separado (no cuenta del día a día)
            </label>
            <Button className="sm:col-span-2" type="submit">
              Crear
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardManager } from "@/components/cards/card-manager";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

export default function MasPage() {
  const { recurring, saveRecurring, primaryAccount } = useFinance();
  const [isAdmin, setIsAdmin] = useState(false);
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedDay, setFixedDay] = useState("10");

  useEffect(() => {
    void fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d: { admin?: boolean }) => setIsAdmin(Boolean(d.admin)))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Más</h1>
        <p className="text-sm text-muted-foreground">
          Cierre y vencimiento de la tarjeta, extensión de tu papá, servicios y ajustes.
        </p>
      </div>

      {primaryAccount ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{primaryAccount.name}</p>
            <p className="text-2xl font-semibold">{formatMoney(Number(primaryAccount.balance), primaryAccount.currency)}</p>
            <p className="text-xs text-muted-foreground">Saldo de la caja (se mueve con cobros y gastos en efectivo).</p>
          </CardContent>
        </Card>
      ) : null}

      <CardManager />

      <Card>
        <CardHeader>
          <CardTitle>Servicios fijos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recurring.map((r) => (
            <div key={r.id} className="flex justify-between text-sm">
              <span>
                {r.name}{" "}
                <span className="text-muted-foreground">· día {r.due_day}</span>
              </span>
              <span className="font-medium">{formatMoney(Number(r.amount), r.currency)}</span>
            </div>
          ))}
          <form
            className="grid grid-cols-3 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRecurring({
                name: fixedName,
                amount: Number(fixedAmount),
                due_day: Number(fixedDay) || 10,
                frequency: "mensual",
              })
                .then(() => {
                  toast.success("Servicio agregado. Lo ves en Hoy para marcarlo pagado.");
                  setFixedName("");
                  setFixedAmount("");
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
            <Input value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="Monto" required />
            <Input value={fixedDay} onChange={(e) => setFixedDay(e.target.value)} placeholder="Día" />
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 pb-4">
        <Button asChild variant="outline">
          <Link href="/configuracion">Ajustes y contraseña</Link>
        </Button>
        {isAdmin ? (
          <Button asChild variant="outline">
            <Link href="/usuarios">Usuarios</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

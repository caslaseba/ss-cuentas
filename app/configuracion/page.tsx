"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ConfiguracionPage() {
  const { profile, updateProfile } = useFinance();
  const [rate, setRate] = useState(String(profile?.usd_exchange_rate ?? ""));
  const [tax, setTax] = useState(String(profile?.tax_surcharge_pct ?? ""));
  const [name, setName] = useState(profile?.full_name ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({
        full_name: name,
        usd_exchange_rate: Number(rate),
        tax_surcharge_pct: Number(tax),
      });
      toast.success("Preferencias guardadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      <Card>
        <CardHeader>
          <CardTitle>Perfil y cotización</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={(e) => void save(e)}>
            <div>
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de cambio USD → moneda local</Label>
              <Input className="mt-1.5" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label>% impuestos / recargos sobre USD (país)</Label>
              <Input className="mt-1.5" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Moneda local: {profile?.local_currency ?? "ARS"}. Cada tarjeta puede sumar un % extra.
            </p>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

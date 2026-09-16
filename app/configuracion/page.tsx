"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDolarRate } from "@/hooks/use-dolar-rate";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ZoomToggle } from "@/components/layout/zoom-toggle";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";

export default function ConfiguracionPage() {
  const { profile, updateProfile } = useFinance();
  const quote = useDolarRate();
  const [rate, setRate] = useState(String(profile?.usd_exchange_rate ?? ""));
  const [name, setName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d: { admin?: boolean }) => setIsAdmin(Boolean(d.admin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!profile) return;
    setRate(String(profile.usd_exchange_rate ?? ""));
    setName(profile.full_name ?? "");
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({
        full_name: name,
        usd_exchange_rate: Number(rate),
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
          <CardTitle>Vista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Blanco o Dark. Se recuerda en este teléfono.</p>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Tamaño de la app. No usa el zoom del navegador.</p>
            <ZoomToggle />
          </div>
        </CardContent>
      </Card>
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
            {quote ? (
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">Dólar automático · {quote.source}</p>
                <p className="text-muted-foreground">
                  Oficial {formatMoney(quote.oficial, "ARS")} · tarjeta {formatMoney(quote.tarjeta, "ARS")}
                  {quote.blue ? ` · blue ${formatMoney(quote.blue, "ARS")}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Para la Visa usamos el dólar tarjeta. Se actualiza solo al abrir la app.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    const next = quote.tarjeta || quote.oficial;
                    if (!next) return;
                    setRate(String(next));
                    void updateProfile({ usd_exchange_rate: next })
                      .then(() => toast.success("Cotización actualizada"))
                      .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
                  }}
                >
                  Usar dólar tarjeta ahora
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Buscando cotización de DolarHoy / DolarApi…</p>
            )}
            <div>
              <Label>Tipo de cambio USD → pesos (se completa solo)</Label>
              <Input className="mt-1.5" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Moneda local: {profile?.local_currency ?? "ARS"}. Para la Visa usamos el dólar tarjeta, sin recargo extra.
            </p>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar mi contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            La clave actual no se puede consultar. Solo se puede definir una nueva.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (password !== confirm) {
                  toast.error("Las contraseñas no coinciden.");
                  return;
                }
                const supabase = createClient();
                const { error } = await supabase.auth.updateUser({ password });
                if (error) {
                  toast.error(error.message);
                  return;
                }
                setPassword("");
                setConfirm("");
                toast.success("Contraseña actualizada");
              })();
            }}
          >
            <div>
              <Label>Contraseña nueva</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Repetir contraseña</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit">Actualizar contraseña</Button>
          </form>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardContent className="pt-6">
            <Link className="text-sm font-medium text-primary underline" href="/usuarios">
              Ir al gestor de usuarios
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

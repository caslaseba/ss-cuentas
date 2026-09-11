"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = (await res.json()) as { error?: string; needsConfirm?: boolean; ok?: boolean };
      if (!res.ok || data.error) {
        toast.error(data.error || `Error ${res.status}`);
        return;
      }
      if (data.needsConfirm) {
        toast.success(
          "Cuenta creada. Confirmá el email o desactivá Confirm email en Supabase → Authentication → Providers → Email.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo contactar al servidor local.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Toaster />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <div>
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? "Creando…" : "Registrarme"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <Link className="text-primary underline" href="/login">
              Ingresar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

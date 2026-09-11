"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || data.error) {
        toast.error(data.error || `Error ${res.status}`);
        return;
      }
      router.replace(params.get("next") || "/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar con Supabase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
      <div>
        <Label>Email</Label>
        <Input className="mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label>Contraseña</Label>
        <Input className="mt-1.5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Toaster />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Ingresar a SS Cuentas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link className="text-primary underline" href="/register">
              Crear una
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

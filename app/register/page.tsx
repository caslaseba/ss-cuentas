"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass = "mt-1.5 h-12 border-foreground/20 bg-card";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = (await res.json()) as { error?: string; needsConfirm?: boolean; ok?: boolean };
      if (!res.ok || data.error) {
        setError(data.error || "No se pudo crear la cuenta.");
        return;
      }
      if (data.needsConfirm) {
        setError("Cuenta creada. Confirmá el email y después entrá.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo contactar al servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Crear cuenta">
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <Label>Nombre</Label>
          <Input className={fieldClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <Label>Email</Label>
          <Input className={fieldClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>Contraseña</Label>
          <Input
            className={fieldClass}
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="h-12 w-full" disabled={busy} type="submit">
          {busy ? "Creando…" : "Crear cuenta"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link className="text-foreground underline underline-offset-4" href="/login">
            Ingresar
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

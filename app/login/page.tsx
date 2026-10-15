"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast, Toaster } from "sonner";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass = "mt-1.5 h-12 border-foreground/20 bg-card";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || data.error) {
        setError(data.error || "No se pudo ingresar.");
        return;
      }
      router.replace(params.get("next") || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "No se pudo enviar el correo.");
        return;
      }
      toast.success("Si el email existe, te mandamos un enlace para una contraseña nueva.");
      setForgot(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el correo.");
    } finally {
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <form className="space-y-4" onSubmit={(e) => void onForgot(e)}>
        <p className="text-sm text-muted-foreground">Te enviamos un enlace para crear una contraseña nueva.</p>
        <div>
          <Label>Email</Label>
          <Input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="h-12 w-full" disabled={busy} type="submit">
          {busy ? "Enviando…" : "Enviar enlace"}
        </Button>
        <button className="w-full text-sm text-muted-foreground" type="button" onClick={() => setForgot(false)}>
          Volver
        </button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <div>
        <Label>Email</Label>
        <Input className={fieldClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label>Contraseña</Label>
        <Input
          className={fieldClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-12 w-full" disabled={busy} type="submit">
        {busy ? "Ingresando…" : "Ingresar"}
      </Button>
      <button className="w-full text-sm text-muted-foreground" type="button" onClick={() => setForgot(true)}>
        Olvidé mi contraseña
      </button>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link className="text-foreground underline underline-offset-4" href="/register">
          Crear una
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <Toaster />
      <AuthFrame title="Ingresar">
        <Suspense>
          <LoginForm />
        </Suspense>
      </AuthFrame>
    </>
  );
}

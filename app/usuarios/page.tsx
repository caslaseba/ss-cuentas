"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ManagedUser, UserRole } from "@/lib/types";

function formatWhen(value: string | null) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [busy, setBusy] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = (await res.json()) as { users?: ManagedUser[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error || `Error ${res.status}`);
        setUsers([]);
        return;
      }
      setError(null);
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error || "No se pudo crear");
        return;
      }
      toast.success("Usuario creado. Guardá la contraseña que acabás de asignar: no se puede volver a ver.");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("user");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user: ManagedUser, next: UserRole) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok || data.error) {
      toast.error(data.error || "No se pudo cambiar el rol");
      return;
    }
    toast.success("Rol actualizado");
    await load();
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error || "No se pudo cambiar la contraseña");
        return;
      }
      toast.success("Contraseña actualizada. No queda guardada en texto plano.");
      setResetUser(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (
      !window.confirm(
        `¿Eliminar a ${user.email}? Se borra la cuenta y todos sus movimientos, tarjetas y cajas.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok || data.error) {
      toast.error(data.error || "No se pudo eliminar");
      return;
    }
    toast.success("Usuario eliminado");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Las contraseñas no se pueden ver: se guardan cifradas. Acá podés crear cuentas, asignar una
          contraseña nueva o eliminar usuarios.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void createUser(e)}>
            <div>
              <Label>Nombre</Label>
              <Input className="mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1.5"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Contraseña inicial</Label>
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
              <Label>Rol</Label>
              <Select className="mt-1.5" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy} type="submit">
                {busy ? "Creando…" : "Crear usuario"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading ? <p className="text-sm text-muted-foreground">Cargando usuarios…</p> : null}
        {!loading && users.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">Todavía no hay usuarios.</p>
        ) : null}
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{user.full_name || user.email}</p>
                  <Badge tone={user.role === "admin" ? "ok" : "default"}>
                    {user.role === "admin" ? "Admin" : "Usuario"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">
                  Alta {formatWhen(user.created_at)} · Último ingreso {formatWhen(user.last_sign_in_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  className="w-auto"
                  value={user.role}
                  onChange={(e) => void changeRole(user, e.target.value as UserRole)}
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Admin</option>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setResetUser(user)}>
                  Nueva clave
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void removeUser(user)}>
                  Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(resetUser)} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar contraseña nueva</DialogTitle>
          </DialogHeader>
          <p className="mb-3 text-sm text-muted-foreground">
            No se puede recuperar la clave anterior. Definí una nueva para {resetUser?.email}.
          </p>
          <form className="space-y-3" onSubmit={(e) => void resetPassword(e)}>
            <div>
              <Label>Contraseña nueva</Label>
              <Input
                className="mt-1.5"
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <Button disabled={busy} type="submit">
              Guardar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

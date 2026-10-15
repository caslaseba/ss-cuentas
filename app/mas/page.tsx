"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RecurringPanel } from "@/components/entry/recurring-panel";
import { CardManager } from "@/components/cards/card-manager";
import { CategoryManager } from "@/components/categories/category-manager";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ZoomToggle } from "@/components/layout/zoom-toggle";
import { WalletBalances } from "@/components/accounts/wallet-balances";
import { useEdition } from "@/components/providers/edition-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallApp } from "@/components/pwa/install-app";

export default function MasPage() {
  const { beta } = useEdition();
  const [isAdmin, setIsAdmin] = useState(false);

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
          {beta
            ? "Tarjetas, categorías y ajustes. Los saldos de Mercado Pago y Caja ICBC no se muestran."
            : "Cierre y vencimiento de la tarjeta, extensión de tu papá, servicios y ajustes."}
        </p>
      </div>

      {beta ? null : <WalletBalances />}

      <CardManager />

      <CategoryManager />

      {beta ? (
        <p className="text-sm text-muted-foreground">
          Mercado Pago y Caja ICBC quedan ocultos en beta. Los servicios fijos se gestionan desde Cargar.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Servicios fijos</CardTitle>
          </CardHeader>
          <CardContent>
            <RecurringPanel />
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}

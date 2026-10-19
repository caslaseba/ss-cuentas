"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, Repeat } from "lucide-react";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { QuickManual } from "@/components/entry/quick-manual";
import { RecurringPanel } from "@/components/entry/recurring-panel";
import { useEdition } from "@/components/providers/edition-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DashboardPage() {
  const { beta } = useEdition();
  const [servicesOpen, setServicesOpen] = useState(false);

  return (
    <div className="w-full space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cargar</h1>
        <p className="text-sm text-muted-foreground">
          {beta
            ? "Ingreso, gasto o servicio mensual. Tocá Estable arriba para volver a la versión anterior."
            : "Ingreso o gasto. El resto está en el resumen."}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6">
          <VoiceEntry />
        </div>

        <Card>
          <CardContent className="pt-5">
            <p className="mb-3 text-sm font-medium">O cargalo a mano</p>
            <QuickManual />
          </CardContent>
        </Card>
      </div>

      {beta ? (
        <Button type="button" size="lg" className="h-12 w-full" variant="outline" onClick={() => setServicesOpen(true)}>
          <Repeat className="h-5 w-5" />
          Servicios fijos
        </Button>
      ) : null}

      <Button asChild size="lg" className="h-12 w-full" variant="outline">
        <Link href="/resumen">
          <LayoutDashboard className="h-5 w-5" />
          Ver resumen
        </Link>
      </Button>

      <Dialog open={servicesOpen} onOpenChange={setServicesOpen}>
        <DialogContent className="w-[min(100%-1rem,36rem)]">
          <DialogHeader>
            <DialogTitle>Servicios fijos</DialogTitle>
          </DialogHeader>
          <RecurringPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { VoiceEntry } from "@/components/entry/voice-entry";
import { QuickManual } from "@/components/entry/quick-manual";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cargar</h1>
        <p className="text-sm text-muted-foreground">Cobró o gastó. El resto está en el resumen.</p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6">
        <VoiceEntry />
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Tocá el micrófono. Ej: “Cobré 2 millones” o “Compré milanesa por 15 mil”.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-sm font-medium">O cargalo a mano</p>
          <QuickManual />
        </CardContent>
      </Card>

      <Button asChild size="lg" className="h-12 w-full" variant="outline">
        <Link href="/resumen">
          <LayoutDashboard className="h-5 w-5" />
          Ver resumen
        </Link>
      </Button>
    </div>
  );
}

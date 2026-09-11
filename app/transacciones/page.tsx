"use client";

import { ManualEntryForm } from "@/components/entry/manual-form";
import { VoiceEntry } from "@/components/entry/voice-entry";

export default function TransaccionesPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cargar movimiento</h1>
        <p className="text-sm text-muted-foreground">
          Formulario rápido o dictado. El parser extrae tipo, monto, moneda, cuotas y tarjeta.
        </p>
      </div>
      <div className="flex justify-center rounded-2xl border border-dashed border-border bg-card p-6">
        <VoiceEntry />
      </div>
      <ManualEntryForm />
    </div>
  );
}

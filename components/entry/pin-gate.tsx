"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { biometricAvailable, unlockWithBiometric } from "@/lib/security/wallet-unlock";

export function PinGate({
  open,
  error,
  title = "Clave para editar",
  hint = "Este mes ya no se toca salvo con la clave. Sirve para no cambiar un resumen cerrado por error.",
  confirmLabel = "Desbloquear",
  allowBiometric = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  error: boolean;
  title?: string;
  hint?: string;
  confirmLabel?: string;
  allowBiometric?: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => boolean;
}) {
  const [pin, setPin] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState(false);

  function send() {
    if (onSubmit(pin.trim())) setPin("");
  }

  async function bio() {
    setBioBusy(true);
    setBioError(false);
    const ok = await unlockWithBiometric();
    setBioBusy(false);
    if (ok) {
      setPin("");
      onSubmit("__bio__");
      return;
    }
    setBioError(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPin("");
          setBioError(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Clave"
          className="mt-3"
        />
        {error ? <p className="mt-2 text-sm text-destructive">Clave incorrecta.</p> : null}
        {bioError ? (
          <p className="mt-2 text-sm text-destructive">No se pudo usar huella o Face ID. Probá la clave.</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {allowBiometric && biometricAvailable() ? (
            <Button variant="outline" disabled={bioBusy} onClick={() => void bio()}>
              {bioBusy ? "Esperá…" : "Huella o Face ID"}
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={send}>
              {confirmLabel}
            </Button>
            <Button className="flex-1" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

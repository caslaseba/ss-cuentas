"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function PinGate({
  open,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  error: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => boolean;
}) {
  const [pin, setPin] = useState("");

  function send() {
    if (onSubmit(pin.trim())) setPin("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPin("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clave para editar</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Este mes ya no se toca salvo con la clave. Sirve para no cambiar un resumen cerrado por error.
        </p>
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
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={send}>
            Desbloquear
          </Button>
          <Button className="flex-1" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

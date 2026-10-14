"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetOwnFinance } from "@/lib/finance/reset-account";
import { createClient } from "@/lib/supabase/client";

const CONFIRM = "BORRAR";

export function ResetData() {
  const router = useRouter();
  const { online, transactions, installments, recurring, cards, accounts, categories, refresh } = useFinance();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  function start() {
    setStep(1);
    setPhrase("");
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  async function wipe() {
    if (phrase.trim().toUpperCase() !== CONFIRM) {
      toast.error(`Escribí ${CONFIRM} para confirmar.`);
      return;
    }
    if (!online) {
      toast.error("Conectate a internet. Si no, este teléfono puede volver a subir los datos viejos.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) throw new Error("Tenés que iniciar sesión.");
      await resetOwnFinance(supabase, userId);
      await refresh();
      setOpen(false);
      toast.success("Listo. Esta cuenta quedó en cero.");
      router.replace("/resumen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="border-red-500/40">
        <CardHeader>
          <CardTitle>Empezar de cero</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Borra los movimientos, tarjetas, cuotas, servicios y saldos de esta cuenta. El usuario y la contraseña siguen.
          </p>
          <Button type="button" variant="outline" disabled={!online} onClick={start}>
            {online ? "Resetear todos los datos" : "Hace falta internet para resetear"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "Esto borra tus registros" : step === 2 ? "No se puede deshacer" : "Última confirmación"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-3 text-sm">
              <p>Se va a borrar de esta cuenta, y solo de esta:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{transactions.length} movimientos (ingresos y gastos)</li>
                <li>{installments.length} planes de cuotas</li>
                <li>{recurring.length} servicios fijos</li>
                <li>{cards.length} tarjetas y su cierre</li>
                <li>{accounts.length} cuentas, con el saldo en cero</li>
                <li>{categories.length} categorías, y vuelven las de siempre</li>
              </ul>
              <p>Tu usuario, tu clave y las cuentas de otras personas no se tocan.</p>
              <Button type="button" className="w-full" onClick={() => setStep(2)}>
                Entiendo, seguir
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3 text-sm">
              <p>No hay papelera ni copia de seguridad en la app.</p>
              <p className="text-muted-foreground">
                También se tiran los movimientos que este teléfono todavía no subió. Si más adelante los necesitás, no se pueden recuperar desde acá.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={close}>
                  Cancelar
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)}>
                  Seguir igual
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3 text-sm">
              <p>
                Escribí <span className="font-semibold">{CONFIRM}</span> para vaciar esta cuenta y empezar de cero.
              </p>
              <div>
                <Label>Confirmación</Label>
                <Input
                  className="mt-1.5"
                  value={phrase}
                  autoComplete="off"
                  onChange={(e) => setPhrase(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={close}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy || phrase.trim().toUpperCase() !== CONFIRM}
                  onClick={() => void wipe()}
                >
                  {busy ? "Borrando…" : "Borrar todo"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

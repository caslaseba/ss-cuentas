"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta app ya está instalada en este aparato. Funciona con las PCs apagadas y, si no hay señal, guarda y sincroniza después.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        Entrá siempre a{" "}
        <a className="text-primary underline" href="https://ss-cuentas.vercel.app">
          ss-cuentas.vercel.app
        </a>
        . No hace falta dejar ninguna computadora prendida.
      </p>
      {deferred ? (
        <Button
          type="button"
          onClick={() => {
            void deferred.prompt().then(() => setDeferred(null));
          }}
        >
          Instalar en este celular o PC
        </Button>
      ) : ios ? (
        <p className="text-muted-foreground">
          En iPhone: Safari → Compartir → <strong>Agregar a pantalla de inicio</strong>.
        </p>
      ) : (
        <p className="text-muted-foreground">
          En Android: Chrome → menú ⋮ → <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
          En una PC: Chrome → el ícono de instalar a la derecha de la barra de dirección.
        </p>
      )}
    </div>
  );
}

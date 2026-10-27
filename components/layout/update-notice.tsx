"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/version";

export function UpdateNotice() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { version?: string };
        if (!cancel && body.version && body.version !== APP_VERSION) setReady(true);
      } catch {
        /* Sin red no hay cómo saber si salió una versión nueva. */
      }
    }
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="no-print mb-4 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
      <p className="text-sm">Hay una actualización del programa.</p>
      <Button type="button" size="sm" onClick={() => window.location.reload()}>
        Actualizar
      </Button>
    </div>
  );
}

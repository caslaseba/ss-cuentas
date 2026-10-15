"use client";

import { toast } from "sonner";
import { useEdition } from "@/components/providers/edition-provider";
import { cn } from "@/lib/utils";

export function EditionToggle() {
  const { edition, setEdition } = useEdition();
  const beta = edition === "beta";

  return (
    <button
      type="button"
      onClick={() => {
        const next = beta ? "estable" : "beta";
        setEdition(next);
        toast.message(next === "beta" ? "Estás en beta" : "Volviste a la versión anterior");
      }}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        beta ? "bg-amber-500/20 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground",
      )}
      aria-pressed={beta}
      aria-label={beta ? "Pasar a la versión anterior" : "Pasar a beta"}
    >
      {beta ? "Beta" : "Estable"}
    </button>
  );
}

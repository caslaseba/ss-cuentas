"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppZoom } from "@/components/providers/zoom-provider";

export function ZoomToggle({ compact = false }: { compact?: boolean }) {
  const { zoom, ready, bigger, smaller, canBigger, canSmaller } = useAppZoom();
  if (!ready) return null;
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canSmaller}
        onClick={smaller}
        aria-label="Achicar letra"
      >
        <Minus className="h-4 w-4" />
        {compact ? null : "A−"}
      </Button>
      <span className="min-w-10 text-center text-xs font-medium tabular-nums">{zoom}%</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canBigger}
        onClick={bigger}
        aria-label="Agrandar letra"
      >
        <Plus className="h-4 w-4" />
        {compact ? null : "A+"}
      </Button>
    </div>
  );
}

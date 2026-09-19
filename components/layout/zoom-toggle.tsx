"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppZoom } from "@/components/providers/zoom-provider";

export function ZoomToggle({ compact = false }: { compact?: boolean }) {
  const { zoom, ready, bigger, smaller, canBigger, canSmaller } = useAppZoom();
  if (!ready) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canSmaller}
        onClick={smaller}
        aria-label="Achicar letra"
        className="h-9 w-9 shrink-0 p-0"
      >
        <Minus className="h-4 w-4" />
        {compact ? null : <span className="sr-only">A−</span>}
      </Button>
      {compact ? null : (
        <span className="w-12 shrink-0 text-center text-xs font-medium tabular-nums">{zoom}%</span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canBigger}
        onClick={bigger}
        aria-label="Agrandar letra"
        className="h-9 w-9 shrink-0 p-0"
      >
        <Plus className="h-4 w-4" />
        {compact ? null : <span className="sr-only">A+</span>}
      </Button>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "ss-cuentas-zoom";
export const ZOOM_STEPS = [100, 115, 130, 150, 170] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];

function clampZoom(value: number): ZoomStep {
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}

type ZoomContextValue = {
  zoom: ZoomStep;
  ready: boolean;
  setZoom: (value: number) => void;
  bigger: () => void;
  smaller: () => void;
  canBigger: boolean;
  canSmaller: boolean;
};

const ZoomContext = createContext<ZoomContextValue | null>(null);

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoomState] = useState<ZoomStep>(100);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem(KEY));
    const next = Number.isFinite(stored) ? clampZoom(stored) : 100;
    setZoomState(next);
    document.documentElement.style.setProperty("--app-zoom", String(next / 100));
    setReady(true);
  }, []);

  const setZoom = useCallback((value: number) => {
    const next = clampZoom(value);
    setZoomState(next);
    localStorage.setItem(KEY, String(next));
    document.documentElement.style.setProperty("--app-zoom", String(next / 100));
  }, []);

  const idx = ZOOM_STEPS.indexOf(zoom);
  const value = useMemo(
    () => ({
      zoom,
      ready,
      setZoom,
      bigger: () => setZoom(ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)] ?? zoom),
      smaller: () => setZoom(ZOOM_STEPS[Math.max(idx - 1, 0)] ?? zoom),
      canBigger: idx < ZOOM_STEPS.length - 1,
      canSmaller: idx > 0,
    }),
    [zoom, ready, setZoom, idx],
  );

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
}

export function useAppZoom() {
  const ctx = useContext(ZoomContext);
  if (!ctx) throw new Error("useAppZoom debe usarse dentro de ZoomProvider");
  return ctx;
}

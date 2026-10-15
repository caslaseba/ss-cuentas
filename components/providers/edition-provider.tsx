"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "ss-cuentas-edition";
export type Edition = "estable" | "beta";

type EditionContextValue = {
  edition: Edition;
  ready: boolean;
  beta: boolean;
  setEdition: (edition: Edition) => void;
};

const EditionContext = createContext<EditionContextValue | null>(null);

export function EditionProvider({ children }: { children: ReactNode }) {
  const [edition, setEditionState] = useState<Edition>("beta");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "estable" || stored === "beta") setEditionState(stored);
    setReady(true);
  }, []);

  const setEdition = useCallback((next: Edition) => {
    setEditionState(next);
    localStorage.setItem(KEY, next);
  }, []);

  const value = useMemo(
    () => ({ edition, ready, beta: edition === "beta", setEdition }),
    [edition, ready, setEdition],
  );

  return <EditionContext.Provider value={value}>{children}</EditionContext.Provider>;
}

export function useEdition() {
  const ctx = useContext(EditionContext);
  if (!ctx) throw new Error("useEdition debe usarse dentro de EditionProvider");
  return ctx;
}

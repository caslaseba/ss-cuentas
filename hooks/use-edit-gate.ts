"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EDIT_PIN, EDIT_UNLOCK_KEY } from "@/lib/finance/edit-lock";

export function useEditGate() {
  const [unlocked, setUnlocked] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [pinError, setPinError] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(EDIT_UNLOCK_KEY) === "1");
  }, []);

  const closePin = useCallback(() => {
    setAskPin(false);
    setPinError(false);
    pending.current = null;
  }, []);

  const guard = useCallback(
    (action: () => void, needsPin: boolean) => {
      if (!needsPin || unlocked) {
        action();
        return;
      }
      pending.current = action;
      setPinError(false);
      setAskPin(true);
    },
    [unlocked],
  );

  const submitPin = useCallback((pin: string) => {
    if (pin !== EDIT_PIN) {
      setPinError(true);
      return false;
    }
    sessionStorage.setItem(EDIT_UNLOCK_KEY, "1");
    setUnlocked(true);
    setAskPin(false);
    setPinError(false);
    const next = pending.current;
    pending.current = null;
    next?.();
    return true;
  }, []);

  return { unlocked, askPin, pinError, guard, submitPin, closePin };
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { DolarQuote } from "@/lib/fx/dolar";
import { useFinance } from "@/components/providers/finance-provider";

export function useDolarRate() {
  const { profile, updateProfile } = useFinance();
  const [quote, setQuote] = useState<DolarQuote | null>(null);
  const applied = useRef(false);
  const updateRef = useRef(updateProfile);
  updateRef.current = updateProfile;
  const profileRate = profile?.usd_exchange_rate;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fx/usd")
      .then((r) => r.json())
      .then((data: DolarQuote & { error?: string }) => {
        if (cancelled || data.error) return;
        if (!(data.tarjeta > 0 || data.oficial > 0)) return;
        setQuote(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!quote || applied.current || profileRate == null) return;
    const rate = quote.tarjeta || quote.oficial;
    if (!(rate > 0)) return;
    applied.current = true;
    if (Math.abs(Number(profileRate) - rate) < 1) return;
    void updateRef.current({ usd_exchange_rate: rate });
  }, [quote, profileRate]);

  return quote;
}

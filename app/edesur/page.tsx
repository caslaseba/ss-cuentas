"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EdesurDesk } from "@/components/edesur/edesur-desk";
import { cursorFromMes } from "@/lib/finance/month-view";

export default function EdesurPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando el informe…</p>}>
      <EdesurRoute />
    </Suspense>
  );
}

function EdesurRoute() {
  const search = useSearchParams();
  return <EdesurDesk initial={cursorFromMes(search.get("mes"))} />;
}

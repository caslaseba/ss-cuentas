"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

const PUBLIC = new Set(["/", "/login", "/register", "/offline"]);

export function RootFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC.has(pathname)) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}

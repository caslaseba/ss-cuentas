"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EditionProvider } from "@/components/providers/edition-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ZoomProvider } from "@/components/providers/zoom-provider";

const PUBLIC = new Set(["/", "/login", "/register", "/offline", "/recuperar"]);

export function RootFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ThemeProvider>
      <ZoomProvider>
        <EditionProvider>{PUBLIC.has(pathname) ? children : <AppShell>{children}</AppShell>}</EditionProvider>
      </ZoomProvider>
    </ThemeProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Mic, MoreHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ZoomToggle } from "@/components/layout/zoom-toggle";
import { FinanceProvider, useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CalculatorWidget } from "@/components/tools/calculator";
import { SearchWidget } from "@/components/tools/search-widget";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Cargar", icon: Mic },
  { href: "/resumen", label: "Resumen", icon: LayoutDashboard },
  { href: "/mas", label: "Más", icon: MoreHorizontal },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider>
      <ShellInner>{children}</ShellInner>
      <ThemedToaster />
    </FinanceProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors position="top-center" theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { online, loading, pendingSync } = useFinance();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="app-zoom min-h-dvh bg-background">
      <header className="safe-header sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-3 backdrop-blur sm:px-4">
        <div className="min-w-0">
          <p className="truncate font-semibold" suppressHydrationWarning>
            SS Cuentas
          </p>
          <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
            {online ? "En línea" : "Sin señal · se actualiza al volver"}
            {pendingSync > 0 ? ` · ${pendingSync} pendiente${pendingSync === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <SearchWidget />
          <CalculatorWidget />
          <ZoomToggle compact />
          <ThemeToggle compact />
          <Button size="sm" variant="ghost" onClick={() => void logout()} aria-label="Salir">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </header>

      <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full min-w-0 max-w-lg px-3 py-4 sm:px-4 sm:py-6 md:max-w-2xl xl:max-w-5xl">
          {!online && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              Estás offline. Lo que cargues se sube cuando vuelvas a tener internet.
            </div>
          )}
          {online && pendingSync > 0 && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              Hay {pendingSync} movimiento{pendingSync === 1 ? "" : "s"} guardado{pendingSync === 1 ? "" : "s"} en este
              aparato, subiendo ahora.
            </div>
          )}
          {loading ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cargando tus cuentas… la primera vez arma el programa y después entra más rápido.
              </p>
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-40 animate-pulse rounded-2xl bg-muted" />
              <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      <nav className="safe-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-background/95 px-2 pt-2 backdrop-blur">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/resumen"
              ? pathname.startsWith("/resumen")
              : pathname === item.href || (item.href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, LogOut, MoreHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ZoomToggle } from "@/components/layout/zoom-toggle";
import { FinanceProvider, useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Hoy", icon: Home },
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
  const { online, loading } = useFinance();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="app-zoom min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <div>
          <p className="font-semibold">SS Cuentas</p>
          <p className="text-[11px] text-muted-foreground">
            {online ? "En línea" : "Sin señal · se actualiza al volver"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ZoomToggle compact />
          <ThemeToggle compact />
          <Button size="sm" variant="ghost" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="pb-24">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {!online && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              Estás offline. Lo que cargues se sube cuando vuelvas a tener internet.
            </div>
          )}
          {loading ? <p className="text-sm text-muted-foreground">Cargando…</p> : children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-border bg-background/95 px-2 py-2 backdrop-blur">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium",
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

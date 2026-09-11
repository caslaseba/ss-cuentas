"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Repeat,
  Settings,
  Wallet,
  History,
  Target,
} from "lucide-react";
import { Toaster } from "sonner";
import { FinanceProvider, useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { VoiceEntry } from "@/components/entry/voice-entry";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/transacciones", label: "Cargar", icon: Wallet },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
  { href: "/cuentas", label: "Cajas", icon: PiggyBank },
  { href: "/presupuestos", label: "Presupuesto", icon: Target },
  { href: "/fijos", label: "Fijos", icon: Repeat },
  { href: "/configuracion", label: "Ajustes", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider>
      <ShellInner>{children}</ShellInner>
      <Toaster richColors position="top-center" />
    </FinanceProvider>
  );
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
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar p-4 lg:flex">
        <Link href="/dashboard" className="mb-8 px-2">
          <p className="text-lg font-semibold tracking-tight">SS Cuentas</p>
          <p className="text-xs text-muted-foreground">Finanzas personales</p>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3">
          <VoiceEntry compact />
          <Button variant="outline" className="w-full" onClick={() => void logout()}>
            <LogOut /> Salir
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="font-semibold">SS Cuentas</p>
          <p className="text-[11px] text-muted-foreground">
            {online ? "En línea" : "Offline · cola de sync activa"}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void logout()}>
          Salir
        </Button>
      </header>

      <main className="pb-24 lg:ml-64 lg:pb-8">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {!online && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              Estás offline. Los movimientos se sincronizan al reconectar.
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando tu panel…</p>
          ) : (
            children
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background/95 px-1 py-2 backdrop-blur lg:hidden">
        {NAV.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-1 text-[10px]",
                active ? "text-primary" : "text-muted-foreground",
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

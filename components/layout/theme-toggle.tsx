"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const dark = theme === "dark";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={compact ? "h-9 w-9 shrink-0 p-0" : undefined}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Pasar a blanco" : "Pasar a dark"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {compact ? null : dark ? "Blanco" : "Dark"}
    </Button>
  );
}

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: ComponentProps<"span"> & {
  tone?: "default" | "ok" | "warn" | "danger" | "usd";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "default" && "bg-muted text-muted-foreground",
        tone === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "bg-red-500/15 text-red-700 dark:text-red-300",
        tone === "usd" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        className,
      )}
      {...props}
    />
  );
}

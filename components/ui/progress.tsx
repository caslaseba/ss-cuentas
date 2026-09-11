import { cn } from "@/lib/utils";

export function Progress({
  value = 0,
  tone = "ok",
  className,
}: {
  value?: number;
  tone?: "ok" | "warn" | "danger" | "neutral";
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "ok" && "bg-emerald-500",
          tone === "warn" && "bg-amber-500",
          tone === "danger" && "bg-red-500",
          tone === "neutral" && "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

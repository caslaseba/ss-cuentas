"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatAmountInput } from "@/lib/finance/amount";
import { cn } from "@/lib/utils";

export function AmountInput({
  value,
  onChange,
  className,
  placeholder = "15.000",
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "value" | "inputMode"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      className={cn("tabular-nums", className)}
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(formatAmountInput(e.target.value))}
    />
  );
}

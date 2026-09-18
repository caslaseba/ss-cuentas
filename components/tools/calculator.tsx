"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAmountFromNumber } from "@/lib/finance/amount";

const ROWS = [
  ["C", "⌫", "÷", "×"],
  ["7", "8", "9", "−"],
  ["4", "5", "6", "+"],
  ["1", "2", "3", "="],
  ["0", ","],
] as const;

function keyToPress(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const { key, code } = e;
  if (key >= "0" && key <= "9") return key;
  if (code.startsWith("Numpad") && /Numpad\d/.test(code)) return code.slice(-1);
  if (key === "," || key === "." || code === "NumpadDecimal") return ",";
  if (key === "+" || code === "NumpadAdd") return "+";
  if (key === "-" || code === "NumpadSubtract") return "−";
  if (key === "*" || code === "NumpadMultiply") return "×";
  if (key === "/" || code === "NumpadDivide") return "÷";
  if (key === "Enter" || key === "=" || code === "NumpadEnter") return "=";
  if (key === "Backspace") return "⌫";
  if (key === "Delete") return "C";
  return null;
}

export function CalculatorWidget() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("0");
  const [error, setError] = useState(false);
  const exprRef = useRef(expr);
  exprRef.current = expr;

  function toJs(raw: string) {
    return raw.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  }

  function resultOf(raw: string) {
    const js = toJs(raw);
    if (!/^[\d.+\-*/\s]+$/.test(js)) return null;
    try {
      const value = Function(`"use strict"; return (${js})`)() as number;
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function press(key: string) {
    setError(false);
    if (key === "C") {
      setExpr("0");
      return;
    }
    if (key === "⌫") {
      setExpr((v) => (v.length <= 1 ? "0" : v.slice(0, -1)));
      return;
    }
    if (key === "=") {
      const value = resultOf(exprRef.current);
      if (value == null) {
        setError(true);
        return;
      }
      setExpr(formatAmountFromNumber(value));
      return;
    }
    setExpr((v) => {
      if (v === "0" && /[\d,]/.test(key)) return key;
      return `${v}${key}`;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const mapped = keyToPress(e);
      if (!mapped) return;
      e.preventDefault();
      press(mapped);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 w-9 p-0"
        aria-label="Calculadora"
        onClick={() => setOpen(true)}
      >
        <Calculator className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Calculadora</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">También podés usar el teclado numérico.</p>
          <p
            className={`mt-2 rounded-xl border bg-muted px-3 py-3 text-right text-2xl font-semibold tabular-nums ${error ? "text-destructive" : ""}`}
          >
            {expr}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {ROWS.flatMap((row, i) =>
              row.map((key, j) => (
                <Button
                  key={`${i}-${j}-${key}`}
                  type="button"
                  variant={/[÷×−+=C]/.test(key) ? "default" : "outline"}
                  className={key === "0" ? "col-span-2" : ""}
                  onClick={() => press(key)}
                >
                  {key}
                </Button>
              )),
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

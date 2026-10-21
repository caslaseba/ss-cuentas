"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROWS = [
  ["C", "⌫", "÷", "×"],
  ["7", "8", "9", "−"],
  ["4", "5", "6", "+"],
  ["1", "2", "3", "="],
  ["0", ","],
] as const;

const OPS = "÷×−+";

function isOp(key: string) {
  return OPS.includes(key);
}

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
  if (key === "Escape") return "Esc";
  return null;
}

function append(current: string, key: string) {
  if (isOp(key)) {
    if (current === "" || current === "0") return key === "−" ? "−" : `0${key}`;
    if (current === "−") return key === "−" ? "−" : `0${key}`;
    const last = current[current.length - 1] ?? "";
    if (isOp(last)) return `${current.slice(0, -1)}${key}`;
    return `${current}${key}`;
  }
  if (current === "0" && key !== ",") return key;
  const chunk = current.split(/[÷×−+]/).pop() ?? "";
  if (key === "," && chunk.includes(",")) return current;
  return `${current}${key}`;
}

function plain(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const text = Number.isInteger(abs) ? String(abs) : String(abs);
  return `${negative ? "−" : ""}${text.replace(".", ",")}`;
}

function resultOf(raw: string) {
  let js = raw.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  js = js.replace(/[+\-*/.]+$/, "");
  if (!js || js === "-" || !/^[\d.+\-*/]+$/.test(js)) return null;
  try {
    const value = Function(`"use strict"; return (${js})`)() as number;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function CalculatorWidget() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("0");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const exprRef = useRef(expr);
  const freshRef = useRef(false);
  exprRef.current = expr;

  useEffect(() => setMounted(true), []);

  function press(key: string) {
    setError(false);
    if (key === "C") {
      freshRef.current = false;
      setExpr("0");
      return;
    }
    if (key === "⌫") {
      freshRef.current = false;
      setExpr((value) => (value.length <= 1 ? "0" : value.slice(0, -1)));
      return;
    }
    if (key === "=") {
      const value = resultOf(exprRef.current);
      if (value == null) {
        setError(true);
        return;
      }
      freshRef.current = true;
      setExpr(plain(value));
      return;
    }
    if (freshRef.current && !isOp(key)) {
      freshRef.current = false;
      setExpr(key === "," ? "0," : key);
      return;
    }
    freshRef.current = false;
    setExpr((value) => append(value, key));
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
        if (target.closest("[role='dialog']")) return;
      }
      const mapped = keyToPress(e);
      if (!mapped) return;
      if (mapped === "Esc") {
        e.preventDefault();
        if (exprRef.current !== "0") press("C");
        else setOpen(false);
        return;
      }
      e.preventDefault();
      press(mapped);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = open ? (
    <div className="pointer-events-auto fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-40 w-40 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl">
      <div className="mb-1 flex items-center justify-between gap-1">
        <p className="text-[10px] font-medium">Calculadora</p>
        <button
          type="button"
          className="rounded-md px-1.5 text-sm leading-none text-muted-foreground hover:text-foreground"
          aria-label="Cerrar calculadora"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      <p
        className={`overflow-x-auto rounded-lg border bg-muted px-1.5 py-1 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${error ? "text-destructive" : ""}`}
      >
        {expr}
      </p>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {ROWS.flatMap((row, i) =>
          row.map((key, j) => (
            <Button
              key={`${i}-${j}-${key}`}
              type="button"
              size="sm"
              variant={/[÷×−+=C]/.test(key) ? "default" : "outline"}
              className={`h-7 px-0 text-xs ${key === "0" ? "col-span-2" : ""}`}
              onClick={() => press(key)}
            >
              {key}
            </Button>
          )),
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 w-9 p-0"
        aria-label="Calculadora"
        aria-pressed={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Calculator className="h-4 w-4" />
      </Button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

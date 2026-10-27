"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { APP_VERSION } from "@/lib/version";
import { observationOf } from "@/lib/finance/tx-notes";
import { cleanConceptName } from "@/lib/finance/recurring";
import { paymentMethodLabel } from "@/lib/finance/match";
import { isProjectedTx } from "@/lib/finance/month-view";
import { groupCategory } from "@/lib/finance/style";
import { formatMoney } from "@/lib/utils";
import type { Category, CreditCard, Transaction } from "@/lib/types";

const CATEGORY_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  Comida: { bg: "#ffedd5", fg: "#c2410c", border: "#fdba74" },
  Supermercado: { bg: "#fef9c3", fg: "#713f12", border: "#facc15" },
  Ocio: { bg: "#fae8ff", fg: "#86198f", border: "#e879f9" },
  Servicios: { bg: "#ccfbf1", fg: "#115e59", border: "#5eead4" },
  Transporte: { bg: "#ecfccb", fg: "#3f6212", border: "#a3e635" },
  Cigarrillos: { bg: "#ffe4e6", fg: "#9f1239", border: "#fb7185" },
  Ingresos: { bg: "#d1fae5", fg: "#065f46", border: "#6ee7b7" },
};

function categoryColor(name: string) {
  return CATEGORY_COLOR[name] ?? { bg: "#f4f4f5", fg: "#18181b", border: "#d4d4d8" };
}

function moneyTone(tx: Transaction) {
  if (tx.type === "ingreso") return "#047857";
  if (tx.payment_method === "tarjeta_credito") return "#6d28d9";
  return "#3730a3";
}

export function MonthReport({
  monthLabel,
  queda,
  estimated,
  salaryNote,
  sueldo,
  otros,
  incomeLines,
  visaMia,
  visaPapa,
  tarjetaAbierta,
  periodLabel,
  nextPayLabel,
  cardDueLabel,
  cash,
  moves,
  categories,
  cards,
  toArs,
  bills,
  brother,
}: {
  monthLabel: string;
  queda: number;
  estimated: boolean;
  salaryNote: string | null;
  sueldo: number;
  otros: number;
  incomeLines: { id: string; on: string; concept: string; note: string; amount: number }[];
  visaMia: number;
  visaPapa: number;
  tarjetaAbierta: number;
  periodLabel: string;
  nextPayLabel: string;
  cardDueLabel: string | null;
  cash: number;
  moves: Transaction[];
  categories: Category[];
  cards: CreditCard[];
  toArs: (amount: number, currency: Transaction["currency"]) => number;
  bills: { name: string; amount: string; detail: string }[];
  brother: { share: string; received: string; status: string; kwh: string } | null;
}) {
  const groups = new Map<string, { name: string; total: number; ingreso: number; txs: Transaction[] }>();
  for (const tx of moves) {
    const raw = categories.find((item) => item.id === tx.category_id)?.name ?? (tx.type === "ingreso" ? "Ingresos" : "Sin categoría");
    const name = groupCategory(raw);
    const row = groups.get(name) ?? { name, total: 0, ingreso: 0, txs: [] };
    const amount = toArs(Number(tx.amount), tx.currency);
    if (!Number.isFinite(amount)) continue;
    if (tx.type === "ingreso") row.ingreso += amount;
    else row.total += amount;
    row.txs.push(tx);
    groups.set(name, row);
  }
  const rows = [...groups.values()].sort((a, b) => Math.max(b.total, b.ingreso) - Math.max(a.total, a.ingreso));
  for (const row of rows) {
    row.txs.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || a.concept.localeCompare(b.concept, "es"));
  }

  return (
    <article id="month-report" className="hidden bg-white text-black">
      <header style={{ borderBottom: "2px solid #0f766e", paddingBottom: 8, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0f766e" }}>
          SS Cuentas
        </p>
        <h1 style={{ margin: "2px 0 0", fontSize: 22, textTransform: "capitalize" }}>Resumen de {monthLabel}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#52525b" }}>
          Informe para leer o imprimir. Ordenado por categoría y, adentro, por fecha.
        </p>
      </header>

      <p style={{ margin: "0 0 12px", fontSize: 18 }}>
        {estimated ? "Te quedaría" : "Te queda"}{" "}
        <strong style={{ color: "#047857" }}>{formatMoney(queda, "ARS")}</strong>
        {estimated ? " (estimado)" : ""}
      </p>
      {salaryNote ? <p style={{ margin: "-6px 0 12px", fontSize: 11, color: "#3f3f46" }}>{salaryNote}</p> : null}

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ border: "1px solid #d4d4d8", borderRadius: 8, padding: 8 }}>
          <h2 style={{ margin: 0, fontSize: 12 }}>Entra</h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Sueldo{estimated ? " estimado" : ""}</span>
            <strong style={{ color: "#047857" }}>{formatMoney(sueldo, "ARS")}</strong>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Otros ingresos</span>
            <strong>{otros > 0 ? formatMoney(otros, "ARS") : "—"}</strong>
          </p>
          {incomeLines.map((line) => (
            <p key={line.id} style={{ margin: "3px 0 0", fontSize: 10, color: "#3f3f46", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {format(parseISO(line.on), "dd/MM", { locale: es })} {line.concept}
                {line.note ? ` · ${line.note}` : ""}
              </span>
              <span>{formatMoney(line.amount, "ARS")}</span>
            </p>
          ))}
        </div>
        <div style={{ border: "1px solid #d4d4d8", borderRadius: 8, padding: 8 }}>
          <h2 style={{ margin: 0, fontSize: 12 }}>Sale</h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Las dos tarjetas</span>
            <strong style={{ color: "#6d28d9" }}>{formatMoney(tarjetaAbierta, "ARS")}</strong>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#3f3f46" }}>
            Visa mía {formatMoney(visaMia, "ARS")} · Extensión {formatMoney(visaPapa, "ARS")}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#3f3f46" }}>{periodLabel}</p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#3f3f46" }}>{nextPayLabel}</p>
          {cardDueLabel ? <p style={{ margin: "4px 0 0", fontSize: 11 }}>{cardDueLabel}</p> : null}
          <p style={{ margin: "6px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Efectivo y transferencia</span>
            <strong style={{ color: "#3730a3" }}>{formatMoney(cash, "ARS")}</strong>
          </p>
        </div>
      </section>

      {brother ? (
        <section style={{ border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: 8, padding: 8, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 12 }}>Tu hermano · EDESUR</h2>
          <p style={{ margin: "4px 0 0", fontSize: 11 }}>
            Le corresponde {brother.share}. Ya te pasó {brother.received}. {brother.status}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#3f3f46" }}>{brother.kwh}</p>
        </section>
      ) : null}

      <h2 style={{ fontSize: 13, margin: "0 0 6px" }}>Categorías</h2>
      {rows.map((row) => {
        const color = categoryColor(row.name);
        return (
          <section key={row.name} style={{ breakInside: "avoid", marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                background: color.bg,
                color: color.fg,
                border: `1px solid ${color.border}`,
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              <span>{row.name}</span>
              <span>
                {row.ingreso > 0 && row.total === 0
                  ? `+${formatMoney(row.ingreso, "ARS")}`
                  : row.total > 0
                    ? formatMoney(row.total, "ARS")
                    : ""}
              </span>
            </div>
            {row.txs.map((tx) => {
              const card = cards.find((item) => item.id === tx.credit_card_id);
              const method =
                tx.type === "ingreso"
                  ? "Entrada"
                  : tx.payment_method === "tarjeta_credito"
                    ? card?.kind === "extension"
                      ? card.name
                      : "Tu Visa"
                    : paymentMethodLabel(tx.payment_method);
              const note = observationOf(tx.notes);
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    borderBottom: "1px solid #e4e4e7",
                    padding: "3px 4px",
                    fontSize: 11,
                    breakInside: "avoid",
                  }}
                >
                  <span>
                    <span style={{ color: "#71717a" }}>{format(parseISO(tx.occurred_on), "dd/MM", { locale: es })} </span>
                    {cleanConceptName(tx.concept)}
                    {note ? <span style={{ color: "#71717a" }}> · {note}</span> : null}
                    <span style={{ color: "#71717a" }}> · {method}</span>
                    {isProjectedTx(tx) ? <span style={{ color: "#a16207" }}> · Estimado</span> : null}
                  </span>
                  <strong style={{ color: moneyTone(tx), whiteSpace: "nowrap" }}>
                    {tx.type === "ingreso" ? "+" : "−"}
                    {formatMoney(Number(tx.amount), tx.currency)}
                  </strong>
                </div>
              );
            })}
          </section>
        );
      })}

      {bills.length ? (
        <section style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 13, margin: "0 0 6px" }}>Mensual</h2>
          {bills.map((bill) => (
            <p key={bill.name} style={{ margin: "0 0 3px", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {bill.name} <span style={{ color: "#71717a" }}>· {bill.detail}</span>
              </span>
              <strong>{bill.amount}</strong>
            </p>
          ))}
        </section>
      ) : null}

      <p style={{ marginTop: 16, fontSize: 9, color: "#71717a" }}>SS Cuentas {APP_VERSION}</p>
    </article>
  );
}

"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { APP_VERSION } from "@/lib/version";
import { observationOf } from "@/lib/finance/tx-notes";
import { cleanConceptName } from "@/lib/finance/recurring";
import { paymentMethodLabel } from "@/lib/finance/match";
import { isProjectedTx } from "@/lib/finance/month-view";
import type { UnpaidCarry } from "@/lib/finance/unpaid-carry";
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

function day(iso: string) {
  return format(parseISO(iso), "dd/MM", { locale: es });
}

function pesos(amount: number) {
  return formatMoney(amount, "ARS");
}

function carryPartLabel(part: { kind: "tarjeta" | "servicio"; month: string; name: string }) {
  const [year, month] = part.month.split("-").map(Number);
  const when = format(new Date(year, (month || 1) - 1, 1), "MMMM yyyy", { locale: es });
  if (part.kind === "tarjeta") return `Tarjeta de ${when} sin cubrir`;
  return `${part.name} · ${when}`;
}

type Group = { name: string; total: number; txs: Transaction[] };

export function MonthReport({
  monthLabel,
  estimated,
  salaryNote,
  sueldo,
  otros,
  incomeLines,
  cardFrom,
  cardTo,
  cardNote,
  cardCharges,
  cardPaidAmount,
  cardUnpaid,
  unpaidCarry,
  outflows,
  categories,
  cards,
  papaId,
  toArs,
}: {
  monthLabel: string;
  estimated: boolean;
  salaryNote: string | null;
  sueldo: number;
  otros: number;
  incomeLines: { id: string; on: string; concept: string; note: string; amount: number }[];
  cardFrom: string;
  cardTo: string;
  cardNote: string;
  cardCharges: Transaction[];
  cardPaidAmount: number;
  cardUnpaid: number;
  unpaidCarry: UnpaidCarry;
  outflows: Transaction[];
  categories: Category[];
  cards: CreditCard[];
  papaId: string | null;
  toArs: (amount: number, currency: Transaction["currency"]) => number;
}) {
  function ars(tx: Transaction) {
    const amount = toArs(Number(tx.amount), tx.currency);
    return Number.isFinite(amount) ? amount : 0;
  }

  function groupsOf(list: Transaction[]) {
    const groups = new Map<string, Group>();
    for (const tx of list) {
      if (tx.type !== "egreso") continue;
      const raw = categories.find((item) => item.id === tx.category_id)?.name ?? "Sin categoría";
      const name = groupCategory(raw);
      const row = groups.get(name) ?? { name, total: 0, txs: [] };
      row.total += ars(tx);
      row.txs.push(tx);
      groups.set(name, row);
    }
    const rows = [...groups.values()].sort((a, b) => b.total - a.total);
    for (const row of rows) {
      row.txs.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.concept.localeCompare(b.concept, "es"));
    }
    return rows;
  }

  const entra = (estimated ? sueldo + otros : incomeLines.reduce((sum, line) => sum + line.amount, 0)) || 0;
  const chargesSum = cardCharges.reduce((sum, tx) => sum + ars(tx), 0);
  const tarjeta = cardPaidAmount > 0 || cardUnpaid > 0 ? cardPaidAmount + cardUnpaid : chargesSum;
  const cardGroups = groupsOf(cardCharges);
  const outGroups = groupsOf(outflows);
  const salidas = outflows.reduce((sum, tx) => sum + ars(tx), 0);
  const impaga = unpaidCarry.left;
  const queda = entra - tarjeta - salidas - impaga;
  const incomes = [...incomeLines].sort((a, b) => a.on.localeCompare(b.on) || a.concept.localeCompare(b.concept, "es"));

  return (
    <article id="month-report" aria-hidden="true">
      <header style={{ borderBottom: "3px solid #0f766e", paddingBottom: 8, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0f766e" }}>
          SS Cuentas
        </p>
        <h1 style={{ margin: "2px 0 0", fontSize: 22, textTransform: "capitalize" }}>Liquidación de {monthLabel}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#3f3f46" }}>
          Lo que entra en este sueldo, la tarjeta del período anterior que se paga con él, los servicios y cada salida
          hasta ahora.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
        <Total label="Entra" value={pesos(entra)} color="#047857" />
        <Total label="Tarjeta anterior" value={pesos(tarjeta)} color="#6d28d9" />
        <Total label="Salidas del mes" value={pesos(salidas)} color="#3730a3" />
        <Total label={estimated ? "Te quedaría" : "Te queda"} value={pesos(queda)} color="#047857" />
      </section>

      <h2 style={{ fontSize: 14, margin: "0 0 6px", color: "#047857" }}>Entra</h2>
      <p style={{ margin: "0 0 4px", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <span>Sueldo{estimated ? " estimado" : ""}</span>
        <strong>{pesos(sueldo)}</strong>
      </p>
      <p style={{ margin: "0 0 6px", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <span>Otros ingresos</span>
        <strong>{otros > 0 ? pesos(otros) : "—"}</strong>
      </p>
      {salaryNote ? <p style={{ margin: "0 0 8px", fontSize: 10, color: "#3f3f46" }}>{salaryNote}</p> : null}
      {incomes.map((line) => (
        <p key={line.id} style={{ margin: "0 0 3px", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>
            <span style={{ color: "#71717a" }}>{day(line.on)} </span>
            {line.concept}
            {line.note ? <span style={{ color: "#71717a" }}> · {line.note}</span> : null}
          </span>
          <strong style={{ color: "#047857", whiteSpace: "nowrap" }}>+{pesos(line.amount)}</strong>
        </p>
      ))}
      <Sum label="Total que entra" value={pesos(entra)} />

      <h2 style={{ fontSize: 14, margin: "14px 0 4px", color: "#6d28d9" }}>Tarjeta del período anterior</h2>
      <p style={{ margin: "0 0 4px", fontSize: 11, color: "#3f3f46" }}>
        Del {day(cardFrom)} al {day(cardTo)}. Se paga con el sueldo de {monthLabel}.
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 11 }}>{cardNote}</p>
      {cardGroups.map((group) => (
        <GroupBlock key={group.name} group={group} cards={cards} papaId={papaId} tone="#6d28d9" card />
      ))}
      <p style={{ margin: "6px 0 0", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        <span>Consumos del período</span>
        <strong>{pesos(chargesSum)}</strong>
      </p>
      {cardPaidAmount > 0 ? (
        <p style={{ margin: "2px 0 0", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
          <span>Ya transferido</span>
          <strong>{pesos(cardPaidAmount)}</strong>
        </p>
      ) : null}
      {cardUnpaid > 0 ? (
        <p style={{ margin: "2px 0 0", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
          <span>Todavía sin transferir</span>
          <strong>{pesos(cardUnpaid)}</strong>
        </p>
      ) : null}
      <Sum label="Descuenta este sueldo" value={pesos(tarjeta)} />

      <h2 style={{ fontSize: 14, margin: "14px 0 4px", color: "#3730a3" }}>Salidas de este mes</h2>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: "#3f3f46" }}>
        Servicios y cada salida en efectivo o transferencia. La transferencia de la tarjeta está en el bloque de arriba.
      </p>
      {outGroups.length ? (
        outGroups.map((group) => <GroupBlock key={group.name} group={group} cards={cards} papaId={papaId} tone="#3730a3" />)
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>Todavía no hay salidas cargadas en este mes.</p>
      )}
      <Sum label="Total de salidas" value={pesos(salidas)} />

      {impaga > 0 ? (
        <section style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 4px", color: "#b45309" }}>Cuenta impaga</h2>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#3f3f46" }}>
            Lo que no se cubrió el mes anterior entra en este sueldo.
          </p>
          {unpaidCarry.parts.map((part) => (
            <p key={`${part.kind}-${part.month}-${part.name}`} style={{ margin: "0 0 3px", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{carryPartLabel(part)}</span>
              <strong>{pesos(part.amount)}</strong>
            </p>
          ))}
          <Sum label="Suma la cuenta impaga" value={pesos(impaga)} />
        </section>
      ) : null}

      <section style={{ marginTop: 14, border: "2px solid #0f766e", borderRadius: 8, padding: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>{estimated ? "Te quedaría" : "Te queda"}</h2>
        <p style={{ margin: "8px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Entra</span>
          <span>{pesos(entra)}</span>
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Tarjeta del período anterior</span>
          <span>− {pesos(tarjeta)}</span>
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Salidas de este mes</span>
          <span>− {pesos(salidas)}</span>
        </p>
        {impaga > 0 ? (
          <p style={{ margin: "2px 0 0", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Cuenta impaga</span>
            <span>− {pesos(impaga)}</span>
          </p>
        ) : null}
        <p style={{ margin: "8px 0 0", fontSize: 18, display: "flex", justifyContent: "space-between", color: "#047857" }}>
          <strong>{estimated ? "Te quedaría" : "Te queda"}</strong>
          <strong>{pesos(queda)}</strong>
        </p>
      </section>

      <p style={{ marginTop: 16, fontSize: 9, color: "#71717a" }}>SS Cuentas {APP_VERSION}</p>
    </article>
  );
}

function Total({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 6 }}>
      <p style={{ margin: 0, fontSize: 9, color: "#71717a" }}>{label}</p>
      <p style={{ margin: "3px 0 0", fontSize: 12, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <p
      style={{
        margin: "6px 0 0",
        paddingTop: 4,
        borderTop: "1px solid #e4e4e7",
        fontSize: 12,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <strong>{label}</strong>
      <strong>{value}</strong>
    </p>
  );
}

function GroupBlock({
  group,
  cards,
  papaId,
  tone,
  card = false,
}: {
  group: Group;
  cards: CreditCard[];
  papaId: string | null;
  tone: string;
  card?: boolean;
}) {
  const color = categoryColor(group.name);
  return (
    <section style={{ breakInside: "avoid", marginBottom: 8 }}>
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
        <span>{group.name}</span>
        <span>{pesos(group.total)}</span>
      </div>
      {group.txs.map((tx) => {
        const own = cards.find((item) => item.id === tx.credit_card_id);
        const method = card ? (own?.id === papaId ? own?.name || "Extensión" : "Tu Visa") : paymentMethodLabel(tx.payment_method);
        const note = observationOf(tx.notes);
        const pending = isProjectedTx(tx);
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
              <span style={{ color: "#71717a" }}>{day(tx.occurred_on)} </span>
              {cleanConceptName(tx.concept)}
              {note ? <span style={{ color: "#71717a" }}> · {note}</span> : null}
              <span style={{ color: "#71717a" }}> · {method}</span>
              {pending ? <span style={{ color: "#a16207" }}> · Pendiente</span> : null}
            </span>
            <strong style={{ color: tone, whiteSpace: "nowrap" }}>−{formatMoney(Number(tx.amount), tx.currency)}</strong>
          </div>
        );
      })}
    </section>
  );
}

/** Punto = miles automático. Coma = decimal. */

export function parseAmountInput(raw: string | number | null | undefined) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const t = String(raw).trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatAmountFromNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  const negative = value < 0;
  const abs = Math.abs(value);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const [int, dec] = abs.toFixed(hasCents ? 2 : 0).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = dec ? `${grouped},${dec}` : grouped;
  return negative ? `-${body}` : body;
}

export function formatAmountInput(raw: string) {
  if (!raw) return "";
  const negative = raw.trim().startsWith("-");
  let s = raw.replace(/[^\d.,]/g, "");

  const usDecimal = /^\d+\.\d{1,2}$/.test(s);
  if (usDecimal) s = s.replace(".", ",");
  else s = s.replace(/\./g, "");

  const comma = s.indexOf(",");
  const keepComma = comma >= 0;
  const intDigits = (keepComma ? s.slice(0, comma) : s).replace(/\D/g, "");
  const decDigits = keepComma ? s.slice(comma + 1).replace(/\D/g, "").slice(0, 2) : "";
  if (!intDigits && !keepComma) return negative ? "-" : "";
  const grouped = (intDigits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = keepComma ? `${grouped},${decDigits}` : grouped;
  return negative ? `-${body}` : body;
}

/** Miles con punto: 103.522 | Decimales con coma: ,50 → 103.522,50 */

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function splitAmountParts(raw: string | number | null | undefined) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { negative: false, intDigits: "", decDigits: null as string | null };
    const negative = raw < 0;
    const [int, dec] = Math.abs(raw).toFixed(2).split(".");
    return { negative, intDigits: int.replace(/^0+(?=\d)/, "") || "0", decDigits: dec };
  }
  const t = String(raw ?? "").trim();
  const negative = t.startsWith("-");
  const s = t.replace(/[^\d.,]/g, "");
  if (!s) return { negative, intDigits: "", decDigits: null as string | null };

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > lastDot) {
    return {
      negative,
      intDigits: digitsOnly(s.slice(0, lastComma)),
      decDigits: digitsOnly(s.slice(lastComma + 1)).slice(0, 2),
    };
  }

  if (lastDot >= 0) {
    const after = digitsOnly(s.slice(lastDot + 1));
    const before = digitsOnly(s.slice(0, lastDot));
    const dotCount = (s.match(/\./g) ?? []).length;

    if (dotCount === 1 && after.length === 3) {
      return { negative, intDigits: before + after, decDigits: null };
    }
    if (after.length <= 2) {
      return { negative, intDigits: before, decDigits: after };
    }
    return { negative, intDigits: digitsOnly(s), decDigits: null };
  }

  return { negative, intDigits: digitsOnly(s), decDigits: null };
}

export function parseAmountInput(raw: string | number | null | undefined) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const { negative, intDigits, decDigits } = splitAmountParts(raw);
  if (!intDigits && (decDigits === null || decDigits === "")) return 0;
  const n = Number(`${intDigits || "0"}.${decDigits || "0"}`);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function formatAmountFromNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  const negative = value < 0;
  const abs = Math.abs(value);
  const cents = Math.round(abs * 100) % 100;
  const int = Math.round(abs * 100 - cents) / 100;
  const intDigits = String(Math.trunc(int + Number.EPSILON));
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signed = negative ? "-" : "";
  if (cents === 0) return `${signed}${grouped}`;
  return `${signed}${grouped},${String(cents).padStart(2, "0")}`;
}

export function formatAmountInput(raw: string) {
  if (!raw) return "";
  const { negative, intDigits, decDigits } = splitAmountParts(raw);
  if (!intDigits && decDigits === null) return negative ? "-" : "";
  const grouped = (intDigits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signed = negative ? "-" : "";
  if (decDigits === null || decDigits === "00") return `${signed}${grouped}`;
  return `${signed}${grouped},${decDigits}`;
}

import type {
  CurrencyCode,
  PaymentMethod,
  TransactionType,
  VoiceParseResult,
} from "@/lib/types";

const INCOME_HINTS =
  /\b(cobr[eé]|ingres[eé]|sueldo|dep[oó]sito|me depositaron|me pagaron|recib[ií]|gan[eé])\b/i;

const EXPENSE_HINTS =
  /\b(compr[eé]|gast[eé]|pagu[eé]|pagu[eé]|saqu[eé]|invert[ií]|abon[eé])\b/i;

const USD_HINTS = /\b(d[oó]lar(?:es)?|usd|green|u\$s|uss)\b/i;
const ARS_HINTS = /\b(pesos?|ars|plata|mango(?:s)?)\b/i;

const EXTENSION_HINTS = /\b(extensi[oó]n|extension|adicional|ext)\b/i;
const PRINCIPAL_HINTS = /\b(principal|titular|visa|mastercard|amex|naranja)\b/i;

const CARD_HINTS = /\b(tarjeta|cr[eé]dito|visa|mastercard|amex|naranja)\b/i;
const CASH_HINTS = /\b(efectivo|contado|mano)\b/i;
const DEBIT_HINTS = /\b(d[eé]bito|d[eé]bito)\b/i;
const WALLET_HINTS = /\b(mp|mercadopago|uala|naranja x|billetera)\b/i;

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciocho: 18,
  veinte: 20,
  veinticuatro: 24,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,]/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpanishAmount(raw: string): number | null {
  const text = normalize(raw);

  const cuotaDe = text.match(
    /(\d+(?:\.\d+)?)\s*cuotas?\s+de\s+(\d+(?:\.\d+)?)(\s*mil)?/i,
  );
  if (cuotaDe) {
    const n = Number(cuotaDe[2]);
    const mil = Boolean(cuotaDe[3]);
    return mil ? n * 1000 : n;
  }

  const milCompound = text.match(
    /(\d+(?:\.\d+)?)\s*mil(?:\s+(\d{1,3}))?/,
  );
  if (milCompound) {
    const thousands = Number(milCompound[1]);
    const rest = milCompound[2] ? Number(milCompound[2]) : 0;
    return thousands * 1000 + rest;
  }

  const wordMil = text.match(
    /\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\s+mil\b/,
  );
  if (wordMil) {
    return (WORD_NUMBERS[wordMil[1]] ?? 0) * 1000;
  }

  const dotted = text.match(/\b(\d{1,3}(?:\.\d{3})+)(?:\.(\d{1,2}))?\b/);
  if (dotted) {
    return Number(dotted[1].replace(/\./g, ""));
  }

  const plain = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:pesos|dolares|dolar|usd|ars)?\b/,
  );
  if (plain) {
    const n = Number(plain[1]);
    if (n >= 1) return n;
  }

  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(text) && value >= 10) {
      return value;
    }
  }

  return null;
}

function parseInstallments(raw: string): {
  count: number | null;
  amount: number | null;
} {
  const text = normalize(raw);

  const ofPattern = text.match(
    /(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|dieciocho|veinticuatro)\s*cuotas?\s+de\s+(\d+(?:\.\d+)?)(\s*mil)?/,
  );
  if (ofPattern) {
    const countRaw = ofPattern[1];
    const count = WORD_NUMBERS[countRaw] ?? Number(countRaw);
    const unit = Number(ofPattern[2]) * (ofPattern[3] ? 1000 : 1);
    return { count, amount: unit };
  }

  const nCuotas = text.match(
    /(?:en\s+)?(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|dieciocho|veinticuatro)\s*cuotas?/,
  );
  if (nCuotas) {
    const countRaw = nCuotas[1];
    const count = WORD_NUMBERS[countRaw] ?? Number(countRaw);
    return { count, amount: null };
  }

  return { count: null, amount: null };
}

function inferType(text: string): TransactionType {
  if (INCOME_HINTS.test(text) && !EXPENSE_HINTS.test(text)) return "ingreso";
  return "egreso";
}

function inferCurrency(text: string): CurrencyCode {
  if (USD_HINTS.test(text)) return "USD";
  if (ARS_HINTS.test(text)) return "ARS";
  return "ARS";
}

function inferPayment(text: string): {
  method: PaymentMethod;
  cardHint: VoiceParseResult["cardHint"];
} {
  if (EXTENSION_HINTS.test(text)) {
    return { method: "tarjeta_credito", cardHint: "extension" };
  }
  if (CARD_HINTS.test(text) || PRINCIPAL_HINTS.test(text)) {
    return { method: "tarjeta_credito", cardHint: "principal" };
  }
  if (WALLET_HINTS.test(text)) return { method: "billetera", cardHint: null };
  if (DEBIT_HINTS.test(text)) return { method: "debito", cardHint: null };
  if (CASH_HINTS.test(text)) return { method: "efectivo", cardHint: null };
  return { method: "efectivo", cardHint: null };
}

function inferConcept(raw: string): string {
  const cleaned = raw
    .replace(INCOME_HINTS, " ")
    .replace(EXPENSE_HINTS, " ")
    .replace(USD_HINTS, " ")
    .replace(ARS_HINTS, " ")
    .replace(EXTENSION_HINTS, " ")
    .replace(/\b(en|con|de|la|el|los|las|un|una|mi|del|al|por|tarjeta|cuotas?|mil|pesos?|dolares?)\b/gi, " ")
    .replace(/\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return raw.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseVoiceCommand(transcript: string): VoiceParseResult {
  const raw = transcript.trim();
  const text = normalize(raw);
  const amount = parseSpanishAmount(raw);
  const installments = parseInstallments(raw);
  const payment = inferPayment(text);
  const type = inferType(text);
  const currency = inferCurrency(text);
  const concept = inferConcept(raw);

  let confidence: VoiceParseResult["confidence"] = "baja";
  if (amount && concept) confidence = "media";
  if (amount && concept && (currency || payment.method)) confidence = "alta";

  return {
    type,
    amount: installments.amount && installments.count
      ? installments.amount
      : amount,
    currency,
    concept,
    installmentCount: installments.count,
    installmentAmount: installments.amount,
    cardHint: payment.cardHint,
    paymentMethod:
      installments.count || payment.cardHint
        ? "tarjeta_credito"
        : payment.method,
    raw,
    confidence,
  };
}

export const VOICE_EXAMPLES = [
  "Compré carne, gasté 20 mil pesos",
  "Compré en 6 cuotas de 15 mil en la tarjeta",
  "Gasté 50 dólares con la tarjeta extensión",
  "Cobré el sueldo de 800 mil",
  "Pagué Netflix 12 mil",
];

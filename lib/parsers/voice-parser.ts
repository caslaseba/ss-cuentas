import type {
  CurrencyCode,
  PaymentMethod,
  TransactionType,
  VoiceParseResult,
} from "@/lib/types";
import { guessCategoryName } from "@/lib/finance/match";

const INCOME_HINTS =
  /\b(cobr[eé]|ingres[eé]|sueldo|dep[oó]sito|me depositaron|me pagaron|recib[ií]|gan[eé])\b/i;

const EXPENSE_HINTS =
  /\b(compr[eé]|gast[eé]|pagu[eé]|saqu[eé]|invert[ií]|abon[eé])\b/i;

const USD_HINTS = /\b(d[oó]lar(?:es)?|usd|green|u\$s|uss)\b/i;
const ARS_HINTS = /\b(pesos?|ars|plata|mango(?:s)?)\b/i;

const EXTENSION_HINTS = /\b(extensi[oó]n|adicional|papa|papi)\b/i;
const CARD_BRANDS = /\b(visa|mastercard|master|amex|naranja|cabal|maestro)\b/i;
const CARD_HINTS = /\b(tarjeta|cr[eé]dito|visa|mastercard|amex|naranja|cabal)\b/i;
const CASH_HINTS = /\b(efectivo|contado|mano)\b/i;
const DEBIT_HINTS = /\b(d[eé]bito)\b/i;
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
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOrNumber(raw: string) {
  return WORD_NUMBERS[raw] ?? Number(String(raw).replace(",", "."));
}

function parseSpanishAmount(raw: string): number | null {
  const text = normalize(raw).replace(
    /\b\d+(?:\.\d+)?\s*(kgs?|kilos?|unidades?|lts?|litros?|gramos?|g)\b/g,
    " ",
  );

  const millones = text.match(
    /\b(\d+(?:\.\d+)?|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*millones?\b/,
  );
  if (millones) {
    const n = wordOrNumber(millones[1]);
    if (n) return n * 1_000_000;
  }

  const porMil = text.match(/\bpor\s+(\d+(?:\.\d+)?)\s*mil(?:\s+pesos?)?\b/);
  if (porMil) return Number(porMil[1]) * 1000;

  const porPlain = text.match(/\bpor\s+(\d+(?:\.\d+)?)\s*(?:pesos?|ars)?\b/);
  if (porPlain) {
    const n = Number(porPlain[1]);
    if (n >= 20) return n;
  }

  const milCompound = text.match(/(\d+(?:\.\d+)?)\s*mil(?:\s+(\d{1,3}))?/);
  if (milCompound) {
    const thousands = Number(milCompound[1]);
    const rest = milCompound[2] ? Number(milCompound[2]) : 0;
    return thousands * 1000 + rest;
  }

  const wordMil = text.match(
    /\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\s+mil\b/,
  );
  if (wordMil) return (WORD_NUMBERS[wordMil[1]] ?? 0) * 1000;

  const dotted = text.match(/\b(\d{1,3}(?:\.\d{3})+)(?:\.\d{1,2})?\b/);
  if (dotted) return Number(dotted[1].replace(/\./g, ""));

  const pesos = text.match(/\b(\d+(?:\.\d+)?)\s*(?:pesos?|ars)\b/);
  if (pesos) return Number(pesos[1]);

  const numbers = [...text.matchAll(/\b(\d+(?:\.\d+)?)\b/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 100);
  if (numbers.length) return Math.max(...numbers);

  return null;
}

function parseInstallments(raw: string): { count: number | null; amount: number | null } {
  const text = normalize(raw);
  const ofPattern = text.match(
    /(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|dieciocho|veinticuatro)\s*cuotas?\s+de\s+(\d+(?:\.\d+)?)(\s*mil)?/,
  );
  if (ofPattern) {
    const count = wordOrNumber(ofPattern[1]);
    const unit = Number(ofPattern[2]) * (ofPattern[3] ? 1000 : 1);
    return { count, amount: unit };
  }
  const nCuotas = text.match(
    /(?:en\s+)?(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|dieciocho|veinticuatro)\s*cuotas?/,
  );
  if (nCuotas) return { count: wordOrNumber(nCuotas[1]), amount: null };
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
  cardNameHint: string | null;
} {
  const brand = text.match(CARD_BRANDS)?.[1] ?? null;
  if (EXTENSION_HINTS.test(text)) {
    return { method: "tarjeta_credito", cardHint: "extension", cardNameHint: brand };
  }
  if (CARD_HINTS.test(text) || brand) {
    return { method: "tarjeta_credito", cardHint: "principal", cardNameHint: brand };
  }
  if (WALLET_HINTS.test(text)) return { method: "billetera", cardHint: null, cardNameHint: null };
  if (DEBIT_HINTS.test(text)) return { method: "debito", cardHint: null, cardNameHint: null };
  if (CASH_HINTS.test(text)) return { method: "efectivo", cardHint: null, cardNameHint: null };
  return { method: "efectivo", cardHint: null, cardNameHint: null };
}

function inferConcept(raw: string): string {
  const cleaned = raw
    .replace(INCOME_HINTS, " ")
    .replace(EXPENSE_HINTS, " ")
    .replace(USD_HINTS, " ")
    .replace(ARS_HINTS, " ")
    .replace(EXTENSION_HINTS, " ")
    .replace(CARD_BRANDS, " ")
    .replace(/\b(en|con|de|la|el|los|las|un|una|mi|del|al|por|tarjeta|cuotas?|mil|millones?|pesos?|dolares?|kgs?|kilos?)\b/gi, " ")
    .replace(/\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    if (INCOME_HINTS.test(raw)) return "Sueldo";
    return raw.trim();
  }
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
  const categoryHint = guessCategoryName(`${concept} ${raw}`, type);

  let confidence: VoiceParseResult["confidence"] = "baja";
  if (amount && concept) confidence = "media";
  if (amount && concept.length >= 3) confidence = "alta";

  return {
    type,
    amount: installments.amount && installments.count ? installments.amount : amount,
    currency,
    concept,
    installmentCount: installments.count,
    installmentAmount: installments.amount,
    cardHint: payment.cardHint,
    cardNameHint: payment.cardNameHint,
    categoryHint,
    paymentMethod: installments.count || payment.cardHint ? "tarjeta_credito" : payment.method,
    raw,
    confidence,
  };
}

export const VOICE_EXAMPLES = [
  "Cobré 2 millones de pesos",
  "Compré 2 kgs de milanesa por 15 mil pesos",
  "Compré cigarrillos por 3000 pesos",
  "Compré 2 kgs de asado por 20 mil pesos con la Visa",
];

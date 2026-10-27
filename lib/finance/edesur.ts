import { observationOf } from "@/lib/finance/tx-notes";

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isEdesurName(name: string) {
  return fold(name).includes("edesur");
}

export function mentionsEdesur(concept: string, notes: string | null | undefined) {
  return isEdesurName(`${concept} ${observationOf(notes)}`);
}

/** Reparto guardado de un mes. Noviembre no reutiliza los kWh de octubre. */
export type EdesurMonth = {
  month: string;
  totalKwh: number;
  totalBill: number;
  mineKwh: number;
  /** Medidor LEO casa. */
  brotherKwh: number;
  /** Medidor LEO's Garage. */
  brother2Kwh: number;
  /** Número que marcaba el medidor, no el consumo del período. */
  brotherReading: number | null;
  brotherReadAt: string | null;
  brother2Reading: number | null;
  brother2ReadAt: string | null;
  mineReading: number | null;
  mineReadAt: string | null;
};

export type EdesurPhotoLabel = "mio" | "hermano" | "hermano2" | "factura";

/** Foto del medidor archivada en un mes. No incluye la imagen, solo dónde está. */
export type EdesurPhoto = {
  id: string;
  month: string;
  label: EdesurPhotoLabel;
  path: string;
  createdAt: string;
};

export function edesurPhotoLabel(label: EdesurPhotoLabel) {
  if (label === "mio") return "Medidor Seba";
  if (label === "hermano") return "Medidor LEO casa";
  if (label === "hermano2") return "Medidor LEO's Garage";
  return "Portada de la factura";
}

const BUENOS_AIRES = "America/Buenos_Aires";

/** Valor para un input datetime-local, en hora de Buenos Aires. */
export function readingInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUENOS_AIRES,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")}T${hour === "24" ? "00" : hour}:${pick("minute")}`;
}

/** El input es hora de Buenos Aires. */
export function readingIsoFromInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatReadingStamp(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUENOS_AIRES,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Lo que consumió el medidor entre la lectura anterior y la de este mes. */
export function meterConsumption(previous: number | null | undefined, current: number | null | undefined) {
  if (previous == null || current == null) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return Math.round((current - previous) * 100) / 100;
}

export function withEdesurMonth(list: EdesurMonth[], next: EdesurMonth) {
  return [...list.filter((item) => item.month !== next.month), next].sort((a, b) => a.month.localeCompare(b.month));
}

export function brotherSettlement(share: number, received: number) {
  const gap = cents(received - share);
  if (Math.abs(gap) < 1) return { kind: "cubierto" as const, amount: 0 };
  if (gap > 0) return { kind: "demas" as const, amount: gap };
  return { kind: "falta" as const, amount: cents(-gap) };
}

export type KwhSplit = {
  rate: number;
  mine: number;
  /** Los dos medidores del hermano, sumados. */
  brother: number;
  brother1: number;
  brother2: number;
  otherKwh: number;
  otherAmount: number;
  exceeds: boolean;
};

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * El precio del kWh es el total de la factura dividido por los kWh totales.
 * Cada uno paga ese precio por lo que consumió.
 */
export function splitBillByKwh(input: {
  totalKwh: number;
  totalBill: number;
  mineKwh: number;
  brotherKwh: number;
  brother2Kwh?: number;
}): KwhSplit | null {
  const { totalKwh, totalBill, mineKwh, brotherKwh } = input;
  const brother2Kwh = input.brother2Kwh ?? 0;
  if (!(totalKwh > 0) || !(totalBill >= 0) || !(mineKwh >= 0) || !(brotherKwh >= 0) || !(brother2Kwh >= 0)) return null;
  const rate = totalBill / totalKwh;
  const otherKwh = totalKwh - mineKwh - brotherKwh - brother2Kwh;
  const exceeds = otherKwh < -0.000001;
  if (Math.abs(otherKwh) < 0.000001) {
    const brother1 = cents(brotherKwh * rate);
    const brother2 = cents(brother2Kwh * rate);
    const brother = cents(brother1 + brother2);
    return {
      rate,
      mine: cents(totalBill - brother),
      brother,
      brother1,
      brother2,
      otherKwh: 0,
      otherAmount: 0,
      exceeds: false,
    };
  }
  const mine = cents(mineKwh * rate);
  const brother1 = cents(brotherKwh * rate);
  const brother2 = cents(brother2Kwh * rate);
  const brother = cents(brother1 + brother2);
  return {
    rate,
    mine,
    brother,
    brother1,
    brother2,
    otherKwh,
    otherAmount: cents(totalBill - mine - brother),
    exceeds,
  };
}

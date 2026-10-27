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
  brotherKwh: number;
};

export type EdesurPhotoLabel = "mio" | "hermano" | "factura";

/** Foto del medidor archivada en un mes. No incluye la imagen, solo dónde está. */
export type EdesurPhoto = {
  id: string;
  month: string;
  label: EdesurPhotoLabel;
  path: string;
  createdAt: string;
};

export function edesurPhotoLabel(label: EdesurPhotoLabel) {
  if (label === "mio") return "Mío";
  if (label === "factura") return "Factura";
  return "De mi hermano";
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
  brother: number;
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
}): KwhSplit | null {
  const { totalKwh, totalBill, mineKwh, brotherKwh } = input;
  if (!(totalKwh > 0) || !(totalBill >= 0) || !(mineKwh >= 0) || !(brotherKwh >= 0)) return null;
  const rate = totalBill / totalKwh;
  const otherKwh = totalKwh - mineKwh - brotherKwh;
  const exceeds = otherKwh < -0.000001;
  if (Math.abs(otherKwh) < 0.000001) {
    const brother = cents(brotherKwh * rate);
    return { rate, mine: cents(totalBill - brother), brother, otherKwh: 0, otherAmount: 0, exceeds: false };
  }
  const mine = cents(mineKwh * rate);
  const brother = cents(brotherKwh * rate);
  return {
    rate,
    mine,
    brother,
    otherKwh,
    otherAmount: cents(totalBill - mine - brother),
    exceeds,
  };
}

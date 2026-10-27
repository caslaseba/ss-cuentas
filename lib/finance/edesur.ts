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
  /** Medidor 1 de tu hermano. */
  brotherKwh: number;
  /** Medidor 2 de tu hermano. */
  brother2Kwh: number;
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
  if (label === "mio") return "Mi medidor";
  if (label === "hermano") return "Medidor 1 de mi hermano";
  if (label === "hermano2") return "Medidor 2 de mi hermano";
  return "Portada de la factura";
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

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

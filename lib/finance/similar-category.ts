import type { Category, TransactionType } from "@/lib/types";

export function foldName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCaseEs(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.charAt(0).toLocaleUpperCase("es-AR") + clean.slice(1).toLocaleLowerCase("es-AR");
}

function levenshtein(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

function commonPrefix(a: string, b: string) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

export type CategoryChoice =
  | { kind: "empty" }
  | { kind: "exact"; category: Category }
  | { kind: "similar"; category: Category }
  | { kind: "create"; name: string };

export function describeCategoryChoice(
  categories: Category[],
  type: TransactionType,
  raw: string,
): CategoryChoice {
  const label = titleCaseEs(raw);
  const needle = foldName(label);
  if (needle.length < 2) return { kind: "empty" };

  const sameType = categories.filter((category) => category.type === type);
  const exact = sameType.find((category) => foldName(category.name) === needle);
  if (exact) return { kind: "exact", category: exact };

  let best: { category: Category; score: number } | null = null;
  for (const category of sameType) {
    const name = foldName(category.name);
    if (name.length < 4) continue;
    const prefix = commonPrefix(name, needle);
    const shorter = Math.min(name.length, needle.length);
    const closePrefix = prefix >= 5 && shorter - prefix <= 2;
    const distance = levenshtein(name, needle);
    const limit = Math.max(name.length, needle.length) >= 8 ? 2 : 1;
    if (!closePrefix && distance > limit) continue;
    const score = closePrefix ? Math.min(distance, 1) : distance;
    if (!best || score < best.score) best = { category, score };
  }
  if (best) return { kind: "similar", category: best.category };
  return { kind: "create", name: label };
}

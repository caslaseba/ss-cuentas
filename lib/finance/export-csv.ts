import type { Transaction } from "@/lib/types";

export function transactionsToCsv(rows: Transaction[]) {
  const header = [
    "fecha",
    "tipo",
    "concepto",
    "monto",
    "moneda",
    "medio",
    "fuente",
  ];
  const lines = rows.map((t) =>
    [
      t.occurred_on,
      t.type,
      `"${(t.concept ?? "").replaceAll('"', '""')}"`,
      t.amount,
      t.currency,
      t.payment_method,
      t.source,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

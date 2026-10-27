"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useMonthView } from "@/hooks/use-month-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import {
  blankEdesurMonth,
  edesurPhotoLabel,
  formatReadingStamp,
  isEdesurName,
  meterConsumption,
  readingInputValue,
  readingIsoFromInput,
  splitBillByKwh,
  type EdesurMonth,
  type EdesurPhoto,
  type EdesurPhotoLabel,
} from "@/lib/finance/edesur";
import { EDESUR_METER_BUCKET, signEdesurPhoto } from "@/lib/finance/edesur-photos";
import { renderInvoicePages } from "@/lib/finance/invoice-pages";
import { shownRecurring } from "@/lib/finance/recurring";
import { APP_VERSION } from "@/lib/version";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { formatMoney, monthKey } from "@/lib/utils";
import { shiftMonth } from "@/lib/finance/wallet";

const METERS = [
  { label: "hermano" as const, title: "Medidor LEO casa", reading: "brotherReading" as const, at: "brotherReadAt" as const },
  { label: "hermano2" as const, title: "Medidor LEO's Garage", reading: "brother2Reading" as const, at: "brother2ReadAt" as const },
  { label: "mio" as const, title: "Medidor Seba", reading: "mineReading" as const, at: "mineReadAt" as const },
];

type MeterLabel = (typeof METERS)[number]["label"];

type MeterDraft = { reading: string; at: string };

function emptyDraft(): MeterDraft {
  return { reading: "", at: "" };
}

function kwhText(value: number) {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function priceText(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function blankIfZero(value: number) {
  return value > 0 ? formatAmountFromNumber(value) : "";
}

function readingText(value: number | null | undefined) {
  return value == null ? "" : formatAmountFromNumber(value);
}

function isPdfPath(path: string) {
  return path.toLowerCase().endsWith(".pdf");
}

function monthTitle(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es });
}

function shownInHistory(item: EdesurMonth) {
  return item.totalBill > 0 || item.totalKwh > 0 || item.mineKwh > 0 || item.brotherKwh > 0 || item.brother2Kwh > 0;
}

export function EdesurDesk({ initial }: { initial?: Date }) {
  const router = useRouter();
  const view = useMonthView(initial);
  const {
    cursor,
    canGoNext,
    canGoPrev,
    edesurMonths,
    saveEdesurMonths,
    edesurPhotos,
    addEdesurPhoto,
    removeEdesurPhoto,
    recurring,
    transactions,
  } = view;
  const month = monthKey(cursor);
  const previousDate = shiftMonth(cursor, -1);
  const previousKey = monthKey(previousDate);
  const monthLabel = format(cursor, "MMMM yyyy", { locale: es });
  const previousLabel = format(previousDate, "MMMM yyyy", { locale: es });
  const saved = edesurMonths.find((item) => item.month === month) ?? null;
  const previous = edesurMonths.find((item) => item.month === previousKey) ?? null;
  const savedKey = saved
    ? [
        saved.month,
        saved.totalKwh,
        saved.totalBill,
        saved.mineKwh,
        saved.brotherKwh,
        saved.brother2Kwh,
        saved.brotherReading,
        saved.brotherReadAt,
        saved.brother2Reading,
        saved.brother2ReadAt,
        saved.mineReading,
        saved.mineReadAt,
      ].join(":")
    : month;
  const billHint = (() => {
    const item = recurring.find((row) => isEdesurName(row.name));
    if (!item) return 0;
    return shownRecurring(item, month, transactions)?.amount ?? Number(item.amount);
  })();

  const [totalKwh, setTotalKwh] = useState("");
  const [bill, setBill] = useState("");
  const [drafts, setDrafts] = useState<Record<MeterLabel, MeterDraft>>({
    hermano: emptyDraft(),
    hermano2: emptyDraft(),
    mio: emptyDraft(),
  });
  const [prior, setPrior] = useState<Record<MeterLabel, MeterDraft>>({
    hermano: emptyDraft(),
    hermano2: emptyDraft(),
    mio: emptyDraft(),
  });
  const [invoicePages, setInvoicePages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<EdesurPhoto | null>(null);

  useEffect(() => {
    if (saved) {
      setTotalKwh(blankIfZero(saved.totalKwh));
      setBill(blankIfZero(saved.totalBill));
      setDrafts({
        hermano: { reading: readingText(saved.brotherReading), at: readingInputValue(saved.brotherReadAt) },
        hermano2: { reading: readingText(saved.brother2Reading), at: readingInputValue(saved.brother2ReadAt) },
        mio: { reading: readingText(saved.mineReading), at: readingInputValue(saved.mineReadAt) },
      });
      return;
    }
    setTotalKwh("");
    setDrafts({ hermano: emptyDraft(), hermano2: emptyDraft(), mio: emptyDraft() });
    setBill(billHint > 0 ? formatAmountFromNumber(billHint) : "");
    // savedKey cambia al pasar de mes o al guardar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  useEffect(() => {
    if (saved || billHint <= 0) return;
    setBill((current) => current || formatAmountFromNumber(billHint));
  }, [billHint, saved]);

  const comparedPhotos = edesurPhotos.filter((photo) => photo.month === month || photo.month === previousKey);
  const photoKey = comparedPhotos.map((photo) => `${photo.id}:${photo.path}`).join("|");

  useEffect(() => {
    if (!comparedPhotos.length || !hasSupabaseConfig()) {
      setUrls({});
      return;
    }
    let cancel = false;
    const supabase = createClient();
    void Promise.all(
      comparedPhotos.map(async (photo) => {
        const url = await signEdesurPhoto(supabase, photo.path);
        return [photo.id, url] as const;
      }),
    ).then((pairs) => {
      if (cancel) return;
      setUrls(Object.fromEntries(pairs.filter((pair): pair is [string, string] => Boolean(pair[1]))));
    });
    return () => {
      cancel = true;
    };
    // photoKey identifica las fotos de este mes y del anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  const priorKey = [
    previousKey,
    previous?.brotherReading ?? "",
    previous?.brotherReadAt ?? "",
    previous?.brother2Reading ?? "",
    previous?.brother2ReadAt ?? "",
    previous?.mineReading ?? "",
    previous?.mineReadAt ?? "",
  ].join(":");

  useEffect(() => {
    setPrior({
      hermano: { reading: readingText(previous?.brotherReading), at: readingInputValue(previous?.brotherReadAt) },
      hermano2: { reading: readingText(previous?.brother2Reading), at: readingInputValue(previous?.brother2ReadAt) },
      mio: { reading: readingText(previous?.mineReading), at: readingInputValue(previous?.mineReadAt) },
    });
    // priorKey cambia al pasar de mes o al guardar la lectura anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorKey]);

  const invoiceFiles = edesurPhotos.filter((photo) => photo.month === month && photo.label === "factura" && isPdfPath(photo.path));
  const invoiceKey = invoiceFiles.map((photo) => photo.path).join("|");

  useEffect(() => {
    if (!invoiceKey || !hasSupabaseConfig()) {
      setInvoicePages([]);
      return;
    }
    let cancel = false;
    const supabase = createClient();
    void (async () => {
      const pages: string[] = [];
      for (const photo of invoiceFiles) {
        const downloaded = await supabase.storage.from(EDESUR_METER_BUCKET).download(photo.path);
        if (downloaded.error || !downloaded.data) continue;
        try {
          const rendered = await renderInvoicePages(await downloaded.data.arrayBuffer());
          pages.push(...rendered);
        } catch {
          // La factura sigue adjunta aunque una hoja no se pueda dibujar.
        }
      }
      if (!cancel) setInvoicePages(pages.slice(0, 8));
    })();
    return () => {
      cancel = true;
    };
    // invoiceKey identifica los PDF de este mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceKey]);

  function storedPrevious(label: MeterLabel) {
    if (!previous) return null;
    if (label === "hermano") return previous.brotherReading;
    if (label === "hermano2") return previous.brother2Reading;
    return previous.mineReading;
  }

  function previousReading(label: MeterLabel) {
    const stored = storedPrevious(label);
    if (stored != null) return stored;
    return prior[label].reading.trim() ? parseAmountInput(prior[label].reading) : null;
  }

  function previousStamp(label: MeterLabel) {
    if (label === "hermano" && previous?.brotherReadAt) return previous.brotherReadAt;
    if (label === "hermano2" && previous?.brother2ReadAt) return previous.brother2ReadAt;
    if (label === "mio" && previous?.mineReadAt) return previous.mineReadAt;
    return readingIsoFromInput(prior[label].at);
  }

  function consumptionOf(label: MeterLabel) {
    const current = drafts[label].reading.trim() ? parseAmountInput(drafts[label].reading) : null;
    return meterConsumption(previousReading(label), current);
  }

  const consumptions = {
    hermano: consumptionOf("hermano"),
    hermano2: consumptionOf("hermano2"),
    mio: consumptionOf("mio"),
  };
  const negative = METERS.some((meter) => (consumptions[meter.label] ?? 0) < 0 && consumptions[meter.label] != null);
  const complete = METERS.every((meter) => (consumptions[meter.label] ?? -1) >= 0);
  const numbers = {
    totalKwh: parseAmountInput(totalKwh),
    totalBill: parseAmountInput(bill),
    brotherKwh: Math.max(0, consumptions.hermano ?? 0),
    brother2Kwh: Math.max(0, consumptions.hermano2 ?? 0),
    mineKwh: Math.max(0, consumptions.mio ?? 0),
  };
  const meterKwh = numbers.brotherKwh + numbers.brother2Kwh + numbers.mineKwh;
  const split = splitBillByKwh(numbers);

  function payload(): EdesurMonth {
    return {
      month,
      ...numbers,
      brotherReading: drafts.hermano.reading.trim() ? parseAmountInput(drafts.hermano.reading) : null,
      brotherReadAt: readingIsoFromInput(drafts.hermano.at),
      brother2Reading: drafts.hermano2.reading.trim() ? parseAmountInput(drafts.hermano2.reading) : null,
      brother2ReadAt: readingIsoFromInput(drafts.hermano2.at),
      mineReading: drafts.mio.reading.trim() ? parseAmountInput(drafts.mio.reading) : null,
      mineReadAt: readingIsoFromInput(drafts.mio.at),
    };
  }

  function goMonth(delta: number) {
    const next = shiftMonth(cursor, delta);
    router.replace(`/edesur?mes=${monthKey(next)}`, { scroll: false });
  }

  function updateDraft(label: MeterLabel, patch: Partial<MeterDraft>) {
    setDrafts((current) => {
      const next = { ...current[label], ...patch };
      if (patch.reading != null && patch.reading.trim() && !next.at) next.at = readingInputValue(new Date().toISOString());
      return { ...current, [label]: next };
    });
  }

  function updatePrior(label: MeterLabel, patch: Partial<MeterDraft>) {
    setPrior((current) => {
      const next = { ...current[label], ...patch };
      if (patch.reading != null && patch.reading.trim() && !next.at) next.at = readingInputValue(new Date().toISOString());
      return { ...current, [label]: next };
    });
  }

  function amountOf(label: MeterLabel) {
    if (!split || split.exceeds) return null;
    if (label === "hermano") return split.brother1;
    if (label === "hermano2") return split.brother2;
    return split.mine;
  }

  function previousPayload(): EdesurMonth | null {
    const base = previous ? { ...previous } : blankEdesurMonth(previousKey);
    let changed = false;
    for (const meter of METERS) {
      if (storedPrevious(meter.label) != null || !prior[meter.label].reading.trim()) continue;
      changed = true;
      const value = parseAmountInput(prior[meter.label].reading);
      const at = readingIsoFromInput(prior[meter.label].at) ?? new Date().toISOString();
      if (meter.label === "hermano") {
        base.brotherReading = value;
        base.brotherReadAt = at;
      } else if (meter.label === "hermano2") {
        base.brother2Reading = value;
        base.brother2ReadAt = at;
      } else {
        base.mineReading = value;
        base.mineReadAt = at;
      }
    }
    return changed ? base : null;
  }

  function blockReason() {
    if (negative) return "Una lectura de este mes es menor que la del mes anterior.";
    if (!complete) return "Falta la lectura del mes pasado o la lectura actual de algún medidor.";
    if (!(numbers.totalBill > 0) || !(numbers.totalKwh > 0)) return "Escribí el total de la factura y los kWh que dice la factura.";
    if (split?.exceeds) {
      return `Los medidores suman ${kwhText(meterKwh)} kWh y la factura dice ${kwhText(numbers.totalKwh)}. No puede pasar de lo que dice la factura.`;
    }
    return null;
  }

  async function save() {
    const reason = negative
      ? "Una lectura de este mes es menor que la del mes anterior."
      : split?.exceeds
        ? `Los medidores suman ${kwhText(meterKwh)} kWh y la factura dice ${kwhText(numbers.totalKwh)}. No puede pasar de lo que dice la factura.`
        : null;
    if (reason) {
      toast.error(reason);
      return false;
    }
    setSaving(true);
    try {
      const earlier = previousPayload();
      await saveEdesurMonths(earlier ? [earlier, payload()] : [payload()]);
      toast.success(`Informe de EDESUR guardado en ${monthLabel}.`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    const reason = blockReason();
    if (reason) {
      toast.error(reason);
      return;
    }
    const ok = await save();
    if (!ok) return;
    const previousTitle = document.title;
    document.body.dataset.print = "edesur";
    document.title = `EDESUR ${monthLabel}`;
    const restore = () => {
      document.title = previousTitle;
      delete document.body.dataset.print;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  async function onFile(label: EdesurPhotoLabel, file: File | undefined, targetMonth = month) {
    if (!file) return;
    setBusy(true);
    try {
      await addEdesurPhoto(targetMonth, label, file);
      if (label !== "factura" && targetMonth === month) {
        updateDraft(label, { at: drafts[label].at || readingInputValue(new Date().toISOString()) });
      }
      const where = targetMonth === month ? monthLabel : monthTitle(targetMonth);
      toast.success(`${edesurPhotoLabel(label)} guardada en ${where}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la foto");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: EdesurPhoto) {
    setBusy(true);
    try {
      await removeEdesurPhoto(photo.id);
      if (zoom?.id === photo.id) setZoom(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar la foto");
    } finally {
      setBusy(false);
    }
  }

  const facturaPhotos = comparedPhotos.filter((photo) => photo.month === month && photo.label === "factura");

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-4 md:max-w-2xl">
      <div className="no-print space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button asChild size="sm" variant="outline" className="h-8 px-2 text-xs">
            <Link href={`/resumen?mes=${month}`}>Volver al resumen</Link>
          </Button>
          <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={() => void download()}>
            {saving ? "Guardando…" : "Descargar PDF"}
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Informe EDESUR</h1>
          <p className="text-sm text-muted-foreground">
            Traigo la lectura del mes pasado. Vos cargás la lectura de la medición actual. El consumo es esa resta. El precio del kWh es el total de la factura dividido por los kWh que dice la factura, y cada medidor paga su consumo por ese precio. Los kWh de los tres medidores no pueden pasar de lo que dice la factura.
          </p>
        </div>
        <div className="flex items-center justify-between gap-1">
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!canGoPrev} onClick={() => goMonth(-1)}>
            ←
          </Button>
          <p className="text-center text-sm font-medium capitalize">{monthLabel}</p>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!canGoNext} onClick={() => goMonth(1)}>
            →
          </Button>
        </div>

        {METERS.map((meter) => {
          const before = comparedPhotos.filter((photo) => photo.month === previousKey && photo.label === meter.label);
          const now = comparedPhotos.filter((photo) => photo.month === month && photo.label === meter.label);
          const lastReading = previousReading(meter.label);
          const lastStored = storedPrevious(meter.label);
          const used = consumptions[meter.label];
          const amount = amountOf(meter.label);
          return (
            <section key={meter.label} className="space-y-2 rounded-md border border-border p-2">
              <h2 className="text-sm font-medium">{meter.title}</h2>
              <div className="grid grid-cols-2 gap-2">
                <PhotoColumn
                  title={previousLabel}
                  photos={before}
                  urls={urls}
                  busy={busy}
                  onZoom={setZoom}
                  onRemove={remove}
                  onAdd={(file) => void onFile(meter.label, file, previousKey)}
                />
                <div>
                  <p className="text-[10px] font-medium capitalize text-muted-foreground">{monthLabel}</p>
                  <div className="mt-1 flex flex-col gap-1">
                    <label>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void onFile(meter.label, file);
                        }}
                      />
                      <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                        {busy ? "Guardando…" : "Sacar foto"}
                      </span>
                    </label>
                    <label>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void onFile(meter.label, file);
                        }}
                      />
                      <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
                        Galería
                      </span>
                    </label>
                  </div>
                  <PhotoList photos={now} urls={urls} busy={busy} onZoom={setZoom} onRemove={remove} />
                </div>
              </div>
              {lastStored == null ? (
                <>
                  <div>
                    <Label htmlFor={`${meter.label}-prev`}>Lectura de {previousLabel}</Label>
                    <Input
                      id={`${meter.label}-prev`}
                      className="mt-1.5"
                      inputMode="decimal"
                      value={prior[meter.label].reading}
                      onChange={(event) => updatePrior(meter.label, { reading: event.target.value })}
                      placeholder="El número que marcaba el mes pasado"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${meter.label}-prev-at`}>Fecha y hora de esa medición</Label>
                    <Input
                      id={`${meter.label}-prev-at`}
                      className="mt-1.5"
                      type="datetime-local"
                      value={prior[meter.label].at}
                      onChange={(event) => updatePrior(meter.label, { at: event.target.value })}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Lectura de {previousLabel}: {kwhText(lastStored)} kWh
                  {previousStamp(meter.label) ? ` · ${formatReadingStamp(previousStamp(meter.label))}` : ""}
                </p>
              )}
              <div>
                <Label htmlFor={`${meter.label}-reading`}>Lectura de la medición actual</Label>
                <Input
                  id={`${meter.label}-reading`}
                  className="mt-1.5"
                  inputMode="decimal"
                  value={drafts[meter.label].reading}
                  onChange={(event) => updateDraft(meter.label, { reading: event.target.value })}
                  placeholder="El número que marca el medidor ahora"
                />
              </div>
              <div>
                <Label htmlFor={`${meter.label}-at`}>Fecha y hora de la medición actual</Label>
                <Input
                  id={`${meter.label}-at`}
                  className="mt-1.5"
                  type="datetime-local"
                  value={drafts[meter.label].at}
                  onChange={(event) => updateDraft(meter.label, { at: event.target.value })}
                />
              </div>
              {used == null ? (
                <p className="text-[11px] text-muted-foreground">Falta una de las dos lecturas para calcular el consumo.</p>
              ) : used < 0 ? (
                <p className="text-sm font-medium text-destructive">La lectura actual es menor que la del mes pasado.</p>
              ) : (
                <p className="text-sm font-medium">
                  Consumió {kwhText(used)} kWh
                  {lastReading != null ? ` (${kwhText(parseAmountInput(drafts[meter.label].reading))} − ${kwhText(lastReading)})` : ""}.
                  {amount != null ? ` ${kwhText(used)} kWh × ${priceText(split?.rate ?? 0)} = ${formatMoney(amount, "ARS")}.` : ""}
                </p>
              )}
            </section>
          );
        })}

        <section className="space-y-2 rounded-md border border-border p-2">
          <h2 className="text-sm font-medium">Portada de la factura</h2>
          <div className="flex gap-2">
            <label className="flex-1">
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onFile("factura", file);
                }}
              />
              <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                {busy ? "Guardando…" : "Sacar foto"}
              </span>
            </label>
            <label className="flex-1">
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onFile("factura", file);
                }}
              />
              <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
                Galería
              </span>
            </label>
          </div>
          <label>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile("factura", file);
              }}
            />
            <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
              {busy ? "Guardando…" : "Adjuntar el PDF de la factura"}
            </span>
          </label>
          <PhotoList photos={facturaPhotos} urls={urls} busy={busy} onZoom={setZoom} onRemove={remove} />
          {invoicePages.length ? (
            <p className="text-[11px] text-muted-foreground">
              El PDF entra en el informe, {invoicePages.length} {invoicePages.length === 1 ? "hoja" : "hojas"}.
            </p>
          ) : null}
        </section>

        <div className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">Datos de la factura</h2>
          <div>
            <Label htmlFor="edesur-bill">Total de la factura</Label>
            <Input id="edesur-bill" className="mt-1.5" inputMode="decimal" value={bill} onChange={(event) => setBill(event.target.value)} placeholder="Ej. 496.293,54" />
          </div>
          <div>
            <Label htmlFor="edesur-kwh">Total de kWh de la factura</Label>
            <Input id="edesur-kwh" className="mt-1.5" inputMode="decimal" value={totalKwh} onChange={(event) => setTotalKwh(event.target.value)} placeholder="Ej. 850" />
          </div>
          {split && !split.exceeds ? (
            <p className="text-xs">
              El kWh de este mes sale {priceText(split.rate)}. Es {formatMoney(numbers.totalBill, "ARS")} ÷ {kwhText(numbers.totalKwh)} kWh.
            </p>
          ) : null}
          {split?.exceeds ? (
            <p className="text-xs text-destructive">
              Los medidores suman {kwhText(meterKwh)} kWh y la factura dice {kwhText(numbers.totalKwh)}. No puede pasar de lo que dice la factura.
            </p>
          ) : null}
          {negative ? <p className="text-xs text-destructive">Una lectura actual es menor que la del mes pasado.</p> : null}
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" className="flex-1" variant="outline" disabled={saving} onClick={() => void download()}>
              Descargar PDF
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Descargar abre el diálogo del navegador. Ahí elegís Guardar como PDF.</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Historial</h2>
          {edesurMonths.some(shownInHistory) ? (
            <ul className="space-y-1">
              {[...edesurMonths].reverse().filter(shownInHistory).map((item) => {
                const piece = splitBillByKwh(item);
                const current = item.month === month;
                return (
                  <li key={item.month}>
                    <Link
                      href={`/edesur?mes=${item.month}`}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${current ? "border-primary" : "border-border"}`}
                    >
                      <span className="capitalize">{monthTitle(item.month)}</span>
                      {piece ? (
                        <span className="text-right text-muted-foreground">
                          LEO {formatMoney(piece.brother, "ARS")} · Seba {formatMoney(piece.mine, "ARS")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin cuenta</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no hay meses guardados. El primero queda acá cuando guardás.</p>
          )}
        </section>
      </div>

      <p className="no-print text-sm font-medium">Vista del informe para tu hermano</p>

      <EdesurSheet
        monthLabel={monthLabel}
        previousLabel={previousLabel}
        numbers={numbers}
        split={split}
        meters={METERS.map((meter) => ({
          title: meter.title,
          label: meter.label,
          previousUrls: photoUrls(comparedPhotos, previousKey, meter.label, urls),
          currentUrls: photoUrls(comparedPhotos, month, meter.label, urls),
          previousReading: previousReading(meter.label),
          previousAt: previousStamp(meter.label),
          currentReading: drafts[meter.label].reading.trim() ? parseAmountInput(drafts[meter.label].reading) : null,
          currentAt: readingIsoFromInput(drafts[meter.label].at),
          consumed: consumptions[meter.label],
        }))}
        facturaUrls={photoUrls(
          comparedPhotos.filter((photo) => !isPdfPath(photo.path)),
          month,
          "factura",
          urls,
        )}
        invoicePages={invoicePages}
      />

      {zoom && urls[zoom.id] ? (
        <div className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3" onClick={() => setZoom(null)}>
          <figure className="max-h-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <img src={urls[zoom.id]} alt={edesurPhotoLabel(zoom.label)} className="max-h-[80dvh] w-full rounded-md bg-white object-contain" />
            <figcaption className="mt-2 flex items-center justify-between text-sm text-white">
              <span>{edesurPhotoLabel(zoom.label)}</span>
              <Button size="sm" variant="outline" onClick={() => setZoom(null)}>
                Cerrar
              </Button>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </div>
  );
}

function photoUrls(photos: EdesurPhoto[], month: string, label: EdesurPhotoLabel, urls: Record<string, string>) {
  return photos
    .filter((photo) => photo.month === month && photo.label === label)
    .map((photo) => urls[photo.id])
    .filter((url): url is string => Boolean(url));
}

function PhotoColumn({
  title,
  photos,
  urls,
  busy,
  onZoom,
  onRemove,
  onAdd,
}: {
  title: string;
  photos: EdesurPhoto[];
  urls: Record<string, string>;
  busy: boolean;
  onZoom: (photo: EdesurPhoto) => void;
  onRemove: (photo: EdesurPhoto) => void;
  onAdd?: (file: File) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium capitalize text-muted-foreground">{title}</p>
      {onAdd ? (
        <label className="mt-1 block">
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onAdd(file);
            }}
          />
          <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
            Foto del mes pasado
          </span>
        </label>
      ) : null}
      <PhotoList photos={photos} urls={urls} busy={busy} onZoom={onZoom} onRemove={onRemove} readOnly={!onAdd} />
    </div>
  );
}

function PhotoList({
  photos,
  urls,
  busy,
  onZoom,
  onRemove,
  readOnly = false,
}: {
  photos: EdesurPhoto[];
  urls: Record<string, string>;
  busy: boolean;
  onZoom: (photo: EdesurPhoto) => void;
  onRemove: (photo: EdesurPhoto) => void;
  readOnly?: boolean;
}) {
  if (!photos.length) return <p className="mt-1 text-[11px] text-muted-foreground">Sin foto.</p>;
  return (
    <div className="mt-1 space-y-2">
      {photos.map((photo) => {
        const pdf = isPdfPath(photo.path);
        return (
          <figure key={photo.id} className="overflow-hidden rounded-md border border-border bg-white">
            {pdf ? (
              <p className="px-2 py-3 text-xs">PDF de la factura</p>
            ) : (
              <button type="button" className="block w-full" onClick={() => urls[photo.id] && onZoom(photo)}>
                {urls[photo.id] ? (
                  <img src={urls[photo.id]} alt={edesurPhotoLabel(photo.label)} className="aspect-[4/3] w-full object-contain" />
                ) : (
                  <span className="block aspect-[4/3] w-full bg-muted" />
                )}
              </button>
            )}
            {readOnly ? null : (
              <figcaption className="flex justify-end px-1.5 py-1">
                <button type="button" className="text-[10px] font-medium text-destructive" disabled={busy} onClick={() => void onRemove(photo)}>
                  Quitar
                </button>
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}

function EdesurSheet({
  monthLabel,
  previousLabel,
  numbers,
  split,
  meters,
  facturaUrls,
  invoicePages,
}: {
  monthLabel: string;
  previousLabel: string;
  numbers: { totalKwh: number; totalBill: number; mineKwh: number; brotherKwh: number; brother2Kwh: number };
  split: ReturnType<typeof splitBillByKwh>;
  meters: {
    title: string;
    label: MeterLabel;
    previousUrls: string[];
    currentUrls: string[];
    previousReading: number | null;
    previousAt: string | null;
    currentReading: number | null;
    currentAt: string | null;
    consumed: number | null;
  }[];
  facturaUrls: string[];
  invoicePages: string[];
}) {
  const hasPhotos = meters.some((meter) => meter.previousUrls.length || meter.currentUrls.length);
  const hasInvoice = invoicePages.length > 0 || facturaUrls.length > 0;
  const amounts = split && !split.exceeds ? split : null;
  return (
    <article id="edesur-report" className="rounded-md bg-white px-4 py-4 text-black shadow-sm">
      <header style={{ background: "#0f766e", color: "#fff", borderRadius: 10, padding: "14px 16px" }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>SS Cuentas</p>
        <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>Informe de la factura de EDESUR</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, textTransform: "capitalize" }}>{monthLabel}</p>
      </header>

      <section style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Cuenta del mes</h3>
        {split?.exceeds ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            Los medidores suman {kwhText(numbers.brotherKwh + numbers.brother2Kwh + numbers.mineKwh)} kWh y la factura dice {kwhText(numbers.totalKwh)}. No puede pasar de lo que dice la factura.
          </p>
        ) : amounts ? (
          <>
            <p style={{ margin: "0 0 4px", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>Total de la factura</span>
              <strong>{formatMoney(numbers.totalBill, "ARS")}</strong>
            </p>
            <p style={{ margin: "0 0 4px", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>kWh que dice la factura</span>
              <strong>{kwhText(numbers.totalKwh)}</strong>
            </p>
            <p style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.45 }}>
              El precio del kWh es el total de la factura dividido por los kWh de la factura: {formatMoney(numbers.totalBill, "ARS")} ÷ {kwhText(numbers.totalKwh)} kWh = {priceText(amounts.rate)}.
              Cada medidor paga ese precio por lo que consumió. El consumo es la lectura actual menos la lectura del mes pasado.
            </p>
            {meters.map((meter) => {
              const amount = meter.label === "hermano" ? amounts.brother1 : meter.label === "hermano2" ? amounts.brother2 : amounts.mine;
              const consumed = meter.consumed != null && meter.consumed >= 0 ? meter.consumed : meter.label === "hermano" ? numbers.brotherKwh : meter.label === "hermano2" ? numbers.brother2Kwh : numbers.mineKwh;
              return (
                <div key={meter.label} style={{ marginBottom: 8, border: "1px solid #e4e4e7", borderRadius: 8, padding: "8px 10px", breakInside: "avoid" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 650 }}>{meter.title}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                    {meter.previousReading == null
                      ? `Sin lectura de ${previousLabel}.`
                      : `Lectura de ${previousLabel}: ${kwhText(meter.previousReading)}${meter.previousAt ? ` · ${formatReadingStamp(meter.previousAt)}` : ""}`}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12 }}>
                    {meter.currentReading == null
                      ? "Sin lectura de la medición actual."
                      : `Lectura de la medición actual: ${kwhText(meter.currentReading)}${meter.currentAt ? ` · ${formatReadingStamp(meter.currentAt)}` : ""}`}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#3f3f46" }}>
                    {kwhText(consumed)} kWh × {priceText(amounts.rate)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{formatMoney(amount, "ARS")}</p>
                </div>
              );
            })}
            <p style={{ margin: "8px 0", padding: "8px 10px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>Total de LEO</strong>
              <strong>{formatMoney(amounts.brother, "ARS")}</strong>
            </p>
            <p style={{ margin: "8px 0 0", padding: "8px 10px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>Lo que paga Seba</strong>
              <strong>{formatMoney(amounts.mine, "ARS")}</strong>
            </p>
            {amounts.otherKwh > 0.000001 ? (
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>
                Quedan {kwhText(amounts.otherKwh)} kWh de la factura sin asignar, por {formatMoney(amounts.otherAmount, "ARS")}.
              </p>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13 }}>Falta el total de la factura, los kWh de la factura o alguna lectura para hacer la cuenta.</p>
        )}
      </section>

      <section style={{ marginTop: 16, breakBefore: hasPhotos ? "page" : "auto" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Fotos de los medidores</h3>
        {meters.map((meter) => (
          <div key={meter.label} style={{ marginBottom: 12, breakInside: "avoid" }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 650 }}>{meter.title}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SheetPhotos title={previousLabel} urls={meter.previousUrls} />
              <SheetPhotos title={monthLabel} urls={meter.currentUrls} />
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 8, breakBefore: hasInvoice ? "page" : "auto" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Factura</h3>
        {invoicePages.map((url, index) => (
          <img key={`invoice-${index}`} src={url} alt={`Factura, hoja ${index + 1}`} style={{ display: "block", width: "100%", objectFit: "contain", background: "#fff", border: "1px solid #d4d4d8", borderRadius: 8, marginBottom: 8 }} />
        ))}
        {facturaUrls.map((url) => (
          <img key={url} src={url} alt="Portada de la factura" style={{ display: "block", width: "100%", maxHeight: "125mm", objectFit: "contain", background: "#f4f4f5", border: "1px solid #d4d4d8", borderRadius: 8, marginBottom: 8 }} />
        ))}
        {!hasInvoice ? <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>Sin factura adjunta.</p> : null}
      </section>
      <p style={{ marginTop: 16, fontSize: 9, color: "#71717a" }}>SS Cuentas {APP_VERSION}</p>
    </article>
  );
}

function SheetPhotos({ title, urls }: { title: string; urls: string[] }) {
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontSize: 11, textTransform: "capitalize" }}>{title}</p>
      {urls.length ? (
        urls.map((url) => (
          <img key={url} src={url} alt={title} style={{ display: "block", width: "100%", maxHeight: "70mm", objectFit: "contain", background: "#f4f4f5", border: "1px solid #d4d4d8", borderRadius: 8, marginBottom: 6 }} />
        ))
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>Sin foto.</p>
      )}
    </div>
  );
}


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
import { edesurPhotoLabel, isEdesurName, splitBillByKwh, type EdesurPhoto, type EdesurPhotoLabel } from "@/lib/finance/edesur";
import { signEdesurPhoto } from "@/lib/finance/edesur-photos";
import { shownRecurring } from "@/lib/finance/recurring";
import { APP_VERSION } from "@/lib/version";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { formatMoney, monthKey } from "@/lib/utils";
import { shiftMonth } from "@/lib/finance/wallet";

const SLOTS: { label: EdesurPhotoLabel; title: string }[] = [
  { label: "hermano", title: "Medidor 1 de mi hermano" },
  { label: "hermano2", title: "Medidor 2 de mi hermano" },
  { label: "mio", title: "Mi medidor" },
  { label: "factura", title: "Portada de la factura" },
];

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

export function EdesurDesk({ initial }: { initial?: Date }) {
  const router = useRouter();
  const view = useMonthView(initial);
  const {
    cursor,
    canGoNext,
    canGoPrev,
    edesurMonths,
    saveEdesurMonth,
    edesurPhotos,
    addEdesurPhoto,
    removeEdesurPhoto,
    recurring,
    transactions,
  } = view;
  const month = monthKey(cursor);
  const monthLabel = format(cursor, "MMMM yyyy", { locale: es });
  const saved = edesurMonths.find((item) => item.month === month) ?? null;
  const savedKey = saved
    ? `${saved.month}:${saved.totalKwh}:${saved.totalBill}:${saved.mineKwh}:${saved.brotherKwh}:${saved.brother2Kwh ?? 0}`
    : month;
  const billHint = (() => {
    const item = recurring.find((row) => isEdesurName(row.name));
    if (!item) return 0;
    return shownRecurring(item, month, transactions)?.amount ?? Number(item.amount);
  })();

  const [totalKwh, setTotalKwh] = useState("");
  const [bill, setBill] = useState("");
  const [brother1, setBrother1] = useState("");
  const [brother2, setBrother2] = useState("");
  const [mine, setMine] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<EdesurPhoto | null>(null);

  useEffect(() => {
    if (saved) {
      setTotalKwh(blankIfZero(saved.totalKwh));
      setBill(blankIfZero(saved.totalBill));
      setMine(blankIfZero(saved.mineKwh));
      setBrother1(blankIfZero(saved.brotherKwh));
      setBrother2(blankIfZero(saved.brother2Kwh ?? 0));
      return;
    }
    setTotalKwh("");
    setMine("");
    setBrother1("");
    setBrother2("");
    setBill(billHint > 0 ? formatAmountFromNumber(billHint) : "");
    // savedKey cambia al pasar de mes o al guardar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  useEffect(() => {
    if (saved || billHint <= 0) return;
    setBill((current) => current || formatAmountFromNumber(billHint));
  }, [billHint, saved]);

  const photos = edesurPhotos.filter((photo) => photo.month === month);
  const photoKey = photos.map((photo) => `${photo.id}:${photo.path}`).join("|");

  useEffect(() => {
    if (!photos.length || !hasSupabaseConfig()) {
      setUrls({});
      return;
    }
    let cancel = false;
    const supabase = createClient();
    void Promise.all(
      photos.map(async (photo) => {
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
    // photoKey identifica las fotos de este mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  const numbers = {
    totalKwh: parseAmountInput(totalKwh),
    totalBill: parseAmountInput(bill),
    mineKwh: parseAmountInput(mine),
    brotherKwh: parseAmountInput(brother1),
    brother2Kwh: parseAmountInput(brother2),
  };
  const split = splitBillByKwh(numbers);

  function goMonth(delta: number) {
    const next = shiftMonth(cursor, delta);
    router.replace(`/edesur?mes=${monthKey(next)}`, { scroll: false });
  }

  async function save() {
    if (!split || split.exceeds || saving) return false;
    setSaving(true);
    try {
      await saveEdesurMonth({ month, ...numbers });
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
    if (!split || split.exceeds) {
      toast.error(split?.exceeds ? "Los kWh de los medidores superan el total de la factura." : "Completá el total de la factura y los kWh.");
      return;
    }
    const ok = await save();
    if (!ok) return;
    const previous = document.title;
    document.body.dataset.print = "edesur";
    document.title = `EDESUR ${monthLabel}`;
    const restore = () => {
      document.title = previous;
      delete document.body.dataset.print;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  async function onFile(label: EdesurPhotoLabel, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await addEdesurPhoto(month, label, file);
      toast.success(`${edesurPhotoLabel(label)} guardada en ${monthLabel}.`);
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
            Fotos de los dos medidores de tu hermano, el tuyo y la portada de la factura. Después, el total y los kWh.
            El PDF se arma en esta pantalla, aparte de los movimientos.
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SLOTS.map((slot) => {
            const slotPhotos = photos.filter((photo) => photo.label === slot.label);
            return (
              <section key={slot.label} className="rounded-md border border-border p-2">
                <h2 className="text-xs font-medium">{slot.title}</h2>
                <div className="mt-2 flex gap-2">
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
                        void onFile(slot.label, file);
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
                        void onFile(slot.label, file);
                      }}
                    />
                    <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
                      Galería
                    </span>
                  </label>
                </div>
                {slotPhotos.length ? (
                  <div className="mt-2 space-y-2">
                    {slotPhotos.map((photo) => (
                      <figure key={photo.id} className="overflow-hidden rounded-md border border-border bg-muted">
                        <button type="button" className="block w-full" onClick={() => urls[photo.id] && setZoom(photo)}>
                          {urls[photo.id] ? (
                            <img src={urls[photo.id]} alt={slot.title} className="aspect-[4/3] w-full bg-white object-contain" />
                          ) : (
                            <span className="block aspect-[4/3] w-full bg-muted" />
                          )}
                        </button>
                        <figcaption className="flex justify-end px-1.5 py-1">
                          <button type="button" className="text-[10px] font-medium text-destructive" disabled={busy} onClick={() => void remove(photo)}>
                            Quitar
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">Todavía no hay foto.</p>
                )}
              </section>
            );
          })}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">Datos de la factura</h2>
          <div>
            <Label htmlFor="edesur-bill">Total de la factura</Label>
            <Input id="edesur-bill" className="mt-1.5" inputMode="decimal" value={bill} onChange={(event) => setBill(event.target.value)} placeholder="Ej. 496.293,54" />
          </div>
          <div>
            <Label htmlFor="edesur-kwh">Total de kWh consumidos</Label>
            <Input id="edesur-kwh" className="mt-1.5" inputMode="decimal" value={totalKwh} onChange={(event) => setTotalKwh(event.target.value)} placeholder="Ej. 850" />
          </div>
          <div>
            <Label htmlFor="edesur-b1">kWh del medidor 1 de mi hermano</Label>
            <Input id="edesur-b1" className="mt-1.5" inputMode="decimal" value={brother1} onChange={(event) => setBrother1(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="edesur-b2">kWh del medidor 2 de mi hermano</Label>
            <Input id="edesur-b2" className="mt-1.5" inputMode="decimal" value={brother2} onChange={(event) => setBrother2(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="edesur-mine">kWh de mi medidor</Label>
            <Input id="edesur-mine" className="mt-1.5" inputMode="decimal" value={mine} onChange={(event) => setMine(event.target.value)} />
          </div>
          {split?.exceeds ? (
            <p className="text-xs text-destructive">Entre los tres medidores superan los kWh totales de la factura.</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={!split || split.exceeds || saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" className="flex-1" variant="outline" disabled={!split || split.exceeds || saving} onClick={() => void download()}>
              Descargar PDF
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Descargar abre el diálogo del navegador. Ahí elegís Guardar como PDF.
          </p>
        </div>
      </div>

      <EdesurSheet monthLabel={monthLabel} numbers={numbers} split={split} photos={photos} urls={urls} />

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

function EdesurSheet({
  monthLabel,
  numbers,
  split,
  photos,
  urls,
}: {
  monthLabel: string;
  numbers: { totalKwh: number; totalBill: number; mineKwh: number; brotherKwh: number; brother2Kwh: number };
  split: ReturnType<typeof splitBillByKwh>;
  photos: EdesurPhoto[];
  urls: Record<string, string>;
}) {
  const groups = SLOTS.map((slot) => ({
    ...slot,
    urls: photos.filter((photo) => photo.label === slot.label).map((photo) => urls[photo.id]).filter((url): url is string => Boolean(url)),
  }));
  const hasPhoto = groups.some((group) => group.urls.length > 0);

  return (
    <article id="edesur-report" className="rounded-md bg-white px-4 py-4 text-black shadow-sm">
      <header style={{ background: "#0f766e", color: "#fff", borderRadius: 10, padding: "14px 16px" }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>SS Cuentas</p>
        <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>Informe de la factura de EDESUR</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, textTransform: "capitalize" }}>{monthLabel}</p>
      </header>

      <section style={{ marginTop: 14 }}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 12, breakInside: "avoid" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{group.title}</h3>
            {group.urls.length ? (
              group.urls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt={group.title}
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "125mm",
                    objectFit: "contain",
                    background: "#f4f4f5",
                    border: "1px solid #d4d4d8",
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                />
              ))
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>Sin foto en este mes.</p>
            )}
          </div>
        ))}
      </section>

      <section style={{ breakBefore: hasPhoto ? "page" : "auto" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Cálculo</h3>
        {split ? (
          <>
            <p style={{ margin: "0 0 4px", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>Total de la factura</span>
              <strong>{formatMoney(numbers.totalBill, "ARS")}</strong>
            </p>
            <p style={{ margin: "0 0 4px", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>Total de kWh</span>
              <strong>{kwhText(numbers.totalKwh)}</strong>
            </p>
            <p style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.4 }}>
              El kWh de este mes sale {priceText(split.rate)}. Es el total de la factura dividido por los kWh totales:{" "}
              {formatMoney(numbers.totalBill, "ARS")} ÷ {kwhText(numbers.totalKwh)} kWh.
            </p>
            <MeterRow title="Medidor 1 de mi hermano" kwhValue={numbers.brotherKwh} rate={split.rate} amount={split.brother1} />
            <MeterRow title="Medidor 2 de mi hermano" kwhValue={numbers.brother2Kwh} rate={split.rate} amount={split.brother2} />
            <p style={{ margin: "8px 0", padding: "8px 10px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>Total de mi hermano</strong>
              <strong>{formatMoney(split.brother, "ARS")}</strong>
            </p>
            <MeterRow title="Mi medidor" kwhValue={numbers.mineKwh} rate={split.rate} amount={split.mine} />
            <p style={{ margin: "8px 0 0", padding: "8px 10px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>Lo que pago yo</strong>
              <strong>{formatMoney(split.mine, "ARS")}</strong>
            </p>
            {split.otherKwh > 0.000001 ? (
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>
                Quedan {kwhText(split.otherKwh)} kWh sin asignar, por {formatMoney(split.otherAmount, "ARS")}.
              </p>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13 }}>Falta el total de la factura y el total de kWh para hacer la cuenta.</p>
        )}
      </section>
      <p style={{ marginTop: 16, fontSize: 9, color: "#71717a" }}>SS Cuentas {APP_VERSION}</p>
    </article>
  );
}

function MeterRow({ title, kwhValue, rate, amount }: { title: string; kwhValue: number; rate: number; amount: number }) {
  return (
    <div style={{ marginBottom: 8, border: "1px solid #e4e4e7", borderRadius: 8, padding: "8px 10px", breakInside: "avoid" }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 650 }}>{title}</p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#3f3f46" }}>
        {kwhText(kwhValue)} kWh × {priceText(rate)}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{formatMoney(amount, "ARS")}</p>
    </div>
  );
}

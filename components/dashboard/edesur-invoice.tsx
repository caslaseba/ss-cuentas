"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { edesurPhotoLabel, type EdesurPhoto, type KwhSplit } from "@/lib/finance/edesur";
import { signEdesurPhoto } from "@/lib/finance/edesur-photos";
import { APP_VERSION } from "@/lib/version";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { formatMoney } from "@/lib/utils";

function kwh(value: number) {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function price(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function EdesurInvoice({
  month,
  monthLabel,
  split,
  totalKwh,
  totalBill,
  mineKwh,
  brotherKwh,
  onNeedNumbers,
}: {
  month: string;
  monthLabel: string;
  split: KwhSplit | null;
  totalKwh: number;
  totalBill: number;
  mineKwh: number;
  brotherKwh: number;
  onNeedNumbers: () => void;
}) {
  const { edesurPhotos, addEdesurPhoto, removeEdesurPhoto } = useFinance();
  const photos = edesurPhotos.filter((photo) => photo.month === month && photo.label === "factura");
  const photoKey = photos.map((photo) => `${photo.id}:${photo.path}`).join("|");
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<EdesurPhoto | null>(null);

  useEffect(() => {
    if (!photos.length || !hasSupabaseConfig()) return;
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
    // photoKey cambia solo cuando cambian las fotos de este mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await addEdesurPhoto(month, "factura", file);
      toast.success(`Factura adherida en ${monthLabel}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo adherir la factura");
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
      toast.error(err instanceof Error ? err.message : "No se pudo quitar la factura");
    } finally {
      setBusy(false);
    }
  }

  function printReport() {
    if (!split) {
      onNeedNumbers();
      return;
    }
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

  const pages = photos.map((photo) => urls[photo.id]).filter((url): url is string => Boolean(url));

  return (
    <section className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-2">
      <h2 className="text-xs font-medium">Factura de EDESUR · {monthLabel}</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Adherí la foto de la factura. El informe muestra el total, cuánto salió el kWh y cuánto paga cada uno.
      </p>
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
              void onFile(file);
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
              void onFile(file);
            }}
          />
          <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border bg-background px-2 text-[11px] font-medium">
            Elegir de la galería
          </span>
        </label>
      </div>
      {photos.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-md border border-border bg-background">
              <button type="button" className="block w-full" onClick={() => urls[photo.id] && setZoom(photo)}>
                {urls[photo.id] ? (
                  <img src={urls[photo.id]} alt="Factura de EDESUR" className="aspect-[3/4] w-full object-cover object-top" />
                ) : (
                  <span className="block aspect-[3/4] w-full bg-muted" />
                )}
              </button>
              <figcaption className="flex items-center justify-between gap-1 px-1.5 py-1">
                <span className="truncate text-[10px] text-muted-foreground">{edesurPhotoLabel(photo.label)}</span>
                <button type="button" className="text-[10px] font-medium text-destructive" disabled={busy} onClick={() => void remove(photo)}>
                  Quitar
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">Todavía no hay una factura adherida en {monthLabel}.</p>
      )}
      <Button type="button" className="mt-2 h-8 w-full text-xs" onClick={printReport}>
        Generar informe EDESUR
      </Button>

      {zoom && urls[zoom.id] ? (
        <div className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3" onClick={() => setZoom(null)}>
          <figure className="max-h-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <img src={urls[zoom.id]} alt="Factura de EDESUR" className="max-h-[80dvh] w-full rounded-md object-contain" />
            <figcaption className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setZoom(null)}>
                Cerrar
              </Button>
            </figcaption>
          </figure>
        </div>
      ) : null}

      <EdesurReport
        monthLabel={monthLabel}
        split={split}
        totalKwh={totalKwh}
        totalBill={totalBill}
        mineKwh={mineKwh}
        brotherKwh={brotherKwh}
        pages={pages}
      />
    </section>
  );
}

function EdesurReport({
  monthLabel,
  split,
  totalKwh,
  totalBill,
  mineKwh,
  brotherKwh,
  pages,
}: {
  monthLabel: string;
  split: KwhSplit | null;
  totalKwh: number;
  totalBill: number;
  mineKwh: number;
  brotherKwh: number;
  pages: string[];
}) {
  return (
    <article id="edesur-report" aria-hidden="true">
      <header style={{ background: "#0f766e", color: "#fff", borderRadius: 10, padding: "14px 16px" }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>SS Cuentas</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Informe de la factura de EDESUR</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, textTransform: "capitalize" }}>{monthLabel}</p>
      </header>

      <p style={{ margin: "14px 0", fontSize: 13, lineHeight: 1.45 }}>
        La factura se reparte según los kWh de cada medidor. El precio del kWh de este mes es el total de la factura
        dividido por los kWh totales. Cada uno paga ese precio por lo que consumió.
      </p>

      {split ? (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Metric title="Total de la factura" value={formatMoney(totalBill, "ARS")} detail="Lo que cobra EDESUR" />
            <Metric title="kWh de la factura" value={kwh(totalKwh)} detail="Consumo total del período" />
            <Metric title="Precio del kWh" value={price(split.rate)} detail="Total ÷ kWh totales" />
          </section>
          <p style={{ margin: "10px 0 14px", fontSize: 12, color: "#3f3f46" }}>
            Precio del kWh = {formatMoney(totalBill, "ARS")} ÷ {kwh(totalKwh)} kWh = {price(split.rate)}
          </p>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Person name="Sebastián" kwhValue={mineKwh} rate={split.rate} amount={split.mine} color="#0f766e" />
            <Person name="Hermano" kwhValue={brotherKwh} rate={split.rate} amount={split.brother} color="#b45309" />
          </section>
          {split.otherKwh > 0.000001 ? (
            <p style={{ margin: "10px 0 0", fontSize: 12 }}>
              Quedan {kwh(split.otherKwh)} kWh sin asignar, por {formatMoney(split.otherAmount, "ARS")}.
            </p>
          ) : null}
        </>
      ) : (
        <p style={{ fontSize: 13 }}>Falta indicar el total de la factura y los kWh de cada uno.</p>
      )}

      <section style={{ marginTop: 16, breakBefore: "page" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Factura</h2>
        {pages.length ? (
          pages.map((url) => (
            <img
              key={url}
              src={url}
              alt="Factura de EDESUR"
              style={{ width: "100%", height: "auto", marginBottom: 10, border: "1px solid #d4d4d8", borderRadius: 8 }}
            />
          ))
        ) : (
          <p style={{ fontSize: 12, color: "#71717a" }}>Todavía no hay una foto de la factura adherida a este informe.</p>
        )}
      </section>

      <p style={{ marginTop: 12, fontSize: 9, color: "#71717a" }}>SS Cuentas {APP_VERSION}</p>
    </article>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div style={{ border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 8, padding: 8 }}>
      <p style={{ margin: 0, fontSize: 10, color: "#115e59" }}>{title}</p>
      <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{value}</p>
      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#3f3f46" }}>{detail}</p>
    </div>
  );
}

function Person({
  name,
  kwhValue,
  rate,
  amount,
  color,
}: {
  name: string;
  kwhValue: number;
  rate: number;
  amount: number;
  color: string;
}) {
  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: 10, padding: 10, breakInside: "avoid" }}>
      <p style={{ margin: 0, fontSize: 12, color }}>{name}</p>
      <p style={{ margin: "6px 0 0", fontSize: 13 }}>{kwh(kwhValue)} kWh</p>
      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#3f3f46" }}>
        {kwh(kwhValue)} kWh × {price(rate)}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 700, color }}>{formatMoney(amount, "ARS")}</p>
      <p style={{ margin: "2px 0 0", fontSize: 11 }}>Es lo que le corresponde abonar.</p>
    </div>
  );
}

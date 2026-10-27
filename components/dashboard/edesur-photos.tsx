"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { edesurPhotoLabel, type EdesurPhoto, type EdesurPhotoLabel } from "@/lib/finance/edesur";
import { signEdesurPhoto } from "@/lib/finance/edesur-photos";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export function EdesurMeterPhotos({ month, monthLabel }: { month: string; monthLabel: string }) {
  const { edesurPhotos, addEdesurPhoto, removeEdesurPhoto } = useFinance();
  const photos = edesurPhotos.filter((photo) => photo.month === month);
  const photoKey = photos.map((photo) => `${photo.id}:${photo.path}`).join("|");
  const [who, setWho] = useState<EdesurPhotoLabel>("mio");
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<EdesurPhoto | null>(null);

  useEffect(() => {
    const current = edesurPhotos.filter((photo) => photo.month === month);
    if (!current.length || !hasSupabaseConfig()) return;
    let cancel = false;
    const supabase = createClient();
    void Promise.all(
      current.map(async (photo) => {
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
  }, [edesurPhotos, month, photoKey]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await addEdesurPhoto(month, who, file);
      toast.success(`Foto del medidor guardada en ${monthLabel}.`);
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
    <div className="space-y-2">
      <p className="text-xs font-medium">Fotos del medidor · {monthLabel}</p>
      <div className="flex gap-1">
        {(
          [
            ["mio", "Mío"],
            ["hermano", "De mi hermano"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setWho(id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              who === id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
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
          <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium">
            Elegir de la galería
          </span>
        </label>
      </div>
      {photos.length ? (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-md border border-border bg-background">
              <button type="button" className="block w-full" onClick={() => urls[photo.id] && setZoom(photo)}>
                {urls[photo.id] ? (
                  <img src={urls[photo.id]} alt={`Medidor ${edesurPhotoLabel(photo.label)}`} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <span className="block aspect-[4/3] w-full bg-muted" />
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
        <p className="text-[11px] text-muted-foreground">Todavía no hay fotos del medidor en {monthLabel}.</p>
      )}
      {zoom && urls[zoom.id] ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3" onClick={() => setZoom(null)}>
          <figure className="max-h-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <img src={urls[zoom.id]} alt={`Medidor ${edesurPhotoLabel(zoom.label)}`} className="max-h-[80dvh] w-full rounded-md object-contain" />
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

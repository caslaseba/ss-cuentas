"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useFinance } from "@/components/providers/finance-provider";
import { useSpeechToText } from "@/hooks/use-speech";
import { parseVoiceCommand, VOICE_EXAMPLES } from "@/lib/parsers/voice-parser";
import { isoDate } from "@/lib/utils";
import type { CurrencyCode, PaymentMethod, TransactionType } from "@/lib/types";

export function VoiceEntry({ compact = false }: { compact?: boolean }) {
  const { categories, cards, accounts, saveTransaction, saveInstallmentPurchase } = useFinance();
  const speech = useSpeechToText();
  const [open, setOpen] = useState(false);
  const parsed = useMemo(
    () => (speech.transcript ? parseVoiceCommand(speech.transcript) : null),
    [speech.transcript],
  );

  const [type, setType] = useState<TransactionType>("egreso");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [concept, setConcept] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [cardId, setCardId] = useState("");
  const [cuotas, setCuotas] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));

  useEffect(() => {
    if (!parsed) return;
    setType(parsed.type);
    setAmount(parsed.amount ? String(parsed.amount) : "");
    setCurrency(parsed.currency);
    setConcept(parsed.concept);
    setMethod(parsed.paymentMethod);
    setCuotas(parsed.installmentCount ? String(parsed.installmentCount) : "");
    if (parsed.cardHint) {
      const match = cards.find((c) => c.kind === parsed.cardHint);
      if (match) setCardId(match.id);
      setMethod("tarjeta_credito");
    }
    const cat = categories.find(
      (c) =>
        c.type === parsed.type &&
        parsed.concept.toLowerCase().includes(c.name.toLowerCase().slice(0, 5)),
    );
    if (cat) setCategoryId(cat.id);
  }, [parsed, cards, categories]);

  async function confirm() {
    try {
      const n = Number(amount);
      if (!concept || !n) {
        toast.error("Faltan concepto o monto.");
        return;
      }
      const cuotaN = Number(cuotas);
      if (cuotaN >= 2 && cardId) {
        await saveInstallmentPurchase({
          concept,
          installmentAmount: n,
          count: cuotaN,
          currency,
          credit_card_id: cardId,
          category_id: categoryId || null,
          occurred_on: date,
          source: "voz",
        });
      } else {
        await saveTransaction({
          type,
          amount: n,
          currency,
          concept,
          payment_method: method,
          category_id: categoryId || null,
          account_id: accountId || null,
          credit_card_id: method === "tarjeta_credito" ? cardId || null : null,
          occurred_on: date,
          source: "voz",
        });
      }
      toast.success("Movimiento registrado");
      setOpen(false);
      speech.setTranscript("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <>
      <div className={compact ? "" : "flex flex-col items-center gap-3"}>
        <Button
          type="button"
          variant={compact ? "default" : "mic"}
          size={compact ? "lg" : undefined}
          className={compact ? "w-full" : "h-20 w-20"}
          onClick={() => {
            setOpen(true);
            speech.start();
          }}
          aria-label="Cargar por voz"
        >
          <Mic className={compact ? "h-4 w-4" : "h-8 w-8"} />
          {compact ? "Dictar gasto" : null}
        </Button>
        {!compact && (
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Tocá el micrófono y dictá. Ej: “Compré carne, gasté 20 mil pesos”.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carga por voz</DialogTitle>
          </DialogHeader>

          <div className="mb-4 flex items-center justify-center">
            <Button
              type="button"
              variant="mic"
              className={speech.listening ? "animate-pulse bg-red-600" : ""}
              onClick={speech.toggle}
            >
              {speech.listening ? <Square className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </Button>
          </div>

          {!speech.supported && (
            <p className="mb-3 text-sm text-amber-600">
              Este navegador no expone Web Speech API. Usá Chrome/Edge o el formulario manual.
            </p>
          )}
          {speech.error && <p className="mb-3 text-sm text-destructive">{speech.error}</p>}

          <p className="mb-3 min-h-10 rounded-xl bg-muted p-3 text-sm">
            {speech.transcript || "Esperando audio…"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </Select>
            </Field>
            <Field label="Monto (cuota si aplica)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Moneda">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label="Medio">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                <option value="efectivo">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="transferencia">Transferencia</option>
                <option value="billetera">Billetera</option>
                <option value="tarjeta_credito">Tarjeta</option>
              </Select>
            </Field>
            <Field label="Concepto" className="col-span-2">
              <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
            </Field>
            <Field label="Cuotas">
              <Input value={cuotas} onChange={(e) => setCuotas(e.target.value)} placeholder="1" />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Categoría">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categories
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Cuenta">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tarjeta" className="col-span-2">
              <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                <option value="">—</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirm()}>Confirmar</Button>
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground">
            Ejemplos: {VOICE_EXAMPLES.slice(0, 3).join(" · ")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

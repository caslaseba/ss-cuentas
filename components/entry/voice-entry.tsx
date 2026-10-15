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
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEdition } from "@/components/providers/edition-provider";
import { useFinance } from "@/components/providers/finance-provider";
import { useSpeechToText } from "@/hooks/use-speech";
import { formatAmountFromNumber, parseAmountInput } from "@/lib/finance/amount";
import { householdCards } from "@/lib/finance/cards";
import { matchCard, matchCategory, categoryLabel } from "@/lib/finance/match";
import { describeCategoryChoice } from "@/lib/finance/similar-category";
import { BETA_VOICE_EXAMPLES, parseVoiceCommand, parseVoiceCommandBeta, VOICE_EXAMPLES } from "@/lib/parsers/voice-parser";
import { withObservation } from "@/lib/finance/tx-notes";
import { formatMoney, isoDate } from "@/lib/utils";
import type { CurrencyCode, PaymentMethod, TransactionType } from "@/lib/types";

export function VoiceEntry({ compact = false }: { compact?: boolean }) {
  const { categories, cards, transactions, saveTransaction, saveInstallmentPurchase, saveCard, saveRecurring, saveCategory } =
    useFinance();
  const { beta } = useEdition();
  const { mine, visible } = householdCards(cards, transactions);
  const speech = useSpeechToText();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const parsed = useMemo(
    () =>
      speech.transcript
        ? beta
          ? parseVoiceCommandBeta(speech.transcript)
          : parseVoiceCommand(speech.transcript)
        : null,
    [speech.transcript, beta],
  );

  const [type, setType] = useState<TransactionType>("egreso");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [concept, setConcept] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [categoryId, setCategoryId] = useState("");
  const [cardId, setCardId] = useState("");
  const [cuotas, setCuotas] = useState("");
  const [enCuotas, setEnCuotas] = useState(false);
  const [date, setDate] = useState(isoDate(new Date()));
  const [observation, setObservation] = useState("");

  useEffect(() => {
    if (!parsed) return;
    setType(parsed.type);
    setAmount(parsed.amount ? formatAmountFromNumber(parsed.amount) : "");
    setCurrency(parsed.currency);
    setConcept(parsed.concept);
    setMethod(parsed.paymentMethod);
    setCuotas(parsed.installmentCount ? String(parsed.installmentCount) : "");
    setEnCuotas(Boolean(parsed.installmentCount && parsed.installmentCount >= 2));
    const { visible: household } = householdCards(cards, transactions);
    const card = matchCard(household.length ? household : cards, parsed.cardNameHint, parsed.cardHint);
    if (card) {
      setCardId(card.id);
      setMethod("tarjeta_credito");
    }
    const cat = matchCategory(categories, parsed.type, parsed.concept, parsed.categoryHint);
    if (cat) setCategoryId(cat.id);
    setEdit(parsed.confidence === "baja");
  }, [parsed, cards, categories, transactions]);

  const categoryName = categories.find((c) => c.id === categoryId)?.name;
  const spokenChoice =
    beta && parsed?.categoryHint && !categoryName
      ? describeCategoryChoice(categories, type, parsed.categoryHint)
      : null;
  const cardName = visible.find((c) => c.id === cardId)?.name ?? cards.find((c) => c.id === cardId)?.name;
  const amountN = parseAmountInput(amount);

  async function confirm() {
    try {
      const n = amountN;
      if (!concept.trim()) {
        toast.error("Falta el concepto.");
        setEdit(true);
        return;
      }
      if (!amount.trim()) {
        toast.error("Poné el monto. Puede ser 0.");
        setEdit(true);
        return;
      }
      if (!Number.isFinite(n) || n < 0) {
        toast.error("El monto no puede ser negativo.");
        setEdit(true);
        return;
      }
      const notes = withObservation(null, observation);
      let resolvedCategoryId = categoryId || null;
      if (beta && !resolvedCategoryId && (parsed?.categoryHint || concept.trim())) {
        const choice = describeCategoryChoice(categories, type, parsed?.categoryHint || concept);
        if (choice.kind === "exact" || choice.kind === "similar") {
          resolvedCategoryId = choice.category.id;
          if (choice.kind === "similar") {
            toast.message(`Ya existe “${choice.category.name}”. La uso en lugar de crear otra.`);
          }
        } else if (choice.kind === "create") {
          const created = await saveCategory({ name: choice.name, type });
          resolvedCategoryId = created.id;
          toast.success(`Categoría nueva: ${created.name}`);
        }
      }
      if (beta && parsed?.intent === "servicio") {
        await saveRecurring({
          name: concept.trim(),
          amount: n,
          currency,
          frequency: "mensual",
          due_day: Math.min(28, new Date().getDate() || 1),
          category_id: resolvedCategoryId,
        });
        toast.success("Servicio mensual guardado");
        setOpen(false);
        setObservation("");
        speech.setTranscript("");
        return;
      }
      let resolvedCardId = cardId || mine?.id || "";
      if (method === "tarjeta_credito" && !resolvedCardId) {
        const created = await saveCard({
          name: "Visa ICBC",
          kind: "principal",
          closing_day: 1,
          due_day: 14,
        });
        resolvedCardId = created.id;
      }
      const cuotaN = enCuotas ? Number(cuotas) : 0;
      if (method === "tarjeta_credito" && cuotaN >= 2 && resolvedCardId) {
        await saveInstallmentPurchase({
          concept,
          installmentAmount: n,
          count: cuotaN,
          currency,
          credit_card_id: resolvedCardId,
          category_id: resolvedCategoryId,
          occurred_on: date,
          source: "voz",
          notes,
        });
      } else {
        await saveTransaction({
          type,
          amount: n,
          currency,
          concept,
          payment_method: method,
          category_id: resolvedCategoryId,
          credit_card_id: method === "tarjeta_credito" ? resolvedCardId || null : null,
          occurred_on: date,
          source: "voz",
          notes,
        });
      }
      toast.success(type === "ingreso" ? "Cobro sumado a tu cuenta" : method === "tarjeta_credito" ? "Sumado a la tarjeta" : "Descontado de tu plata");
      setOpen(false);
      setObservation("");
      speech.setTranscript("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "default" : "mic"}
        size={compact ? "lg" : undefined}
        className={compact ? "w-full" : "h-24 w-24 shadow-xl"}
        onClick={() => {
          setOpen(true);
          setEdit(false);
          speech.start();
        }}
        aria-label="Dictar"
      >
        <Mic className={compact ? "h-4 w-4" : "h-10 w-10"} />
        {compact ? "Dictar" : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%-1rem,28rem)]">
          <DialogHeader>
            <DialogTitle>{speech.listening ? "Te escucho…" : "¿Está bien?"}</DialogTitle>
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
              En el celular usá Chrome. El micrófono necesita HTTPS (o localhost).
            </p>
          )}
          {speech.error && <p className="mb-3 text-sm text-destructive">{speech.error}</p>}

          <p className="mb-3 min-h-10 rounded-xl bg-muted p-3 text-sm">
            {speech.transcript ||
              (beta
                ? "Probá: “Gasté 2 mil pesos en cigarrillos”."
                : "Probá: “Cobré 2 millones” o “Compré milanesa por 15 mil”.")}
          </p>

          {!edit && parsed ? (
            <div className="mb-4 space-y-1 rounded-2xl border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {parsed?.intent === "servicio"
                  ? "Servicio mensual"
                  : type === "ingreso"
                    ? "Ingreso"
                    : method === "tarjeta_credito"
                      ? "Gasto con tarjeta"
                      : "Egreso"}
              </p>
              <p className="text-3xl font-semibold">{amountN ? formatMoney(amountN, currency) : "—"}</p>
              <p className="text-sm font-medium">{concept || "Sin concepto"}</p>
              <p className="text-xs text-muted-foreground">
                {categoryName
                  ? categoryLabel(categoryName)
                  : beta && parsed?.categoryHint
                    ? parsed.categoryHint
                    : "Sin categoría"}
                {parsed?.intent === "servicio"
                  ? " · todos los meses"
                  : method === "tarjeta_credito"
                    ? ` · ${cardName ?? "Tarjeta"}`
                    : " · sale de tu plata"}
              </p>
              {spokenChoice?.kind === "similar" ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Ya existe “{spokenChoice.category.name}”. Al guardar uso esa.
                </p>
              ) : null}
              {spokenChoice?.kind === "create" ? (
                <p className="text-xs text-muted-foreground">Si no existe, se crea “{spokenChoice.name}”.</p>
              ) : null}
            </div>
          ) : null}

          {edit ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                  <option value="egreso">Gasto</option>
                  <option value="ingreso">Cobro</option>
                </Select>
              </Field>
              <Field label="Monto">
                <AmountInput value={amount} onChange={setAmount} />
              </Field>
              <Field label="Qué fue" className="col-span-2">
                <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
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
              <Field label="Pago">
                <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta_credito">Tarjeta</option>
                </Select>
              </Field>
              {method === "tarjeta_credito" ? (
                <>
                  <Field label="Tarjeta" className="col-span-2">
                    <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                      {visible.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.kind === "extension" ? `${c.name} · extensión` : c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-700"
                      checked={enCuotas}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setEnCuotas(on);
                        if (!on) setCuotas("");
                      }}
                    />
                    Va en cuotas
                  </label>
                  {enCuotas ? (
                    <Field label="Cuotas">
                      <Input value={cuotas} onChange={(e) => setCuotas(e.target.value)} inputMode="numeric" placeholder="Ej 12" />
                    </Field>
                  ) : null}
                </>
              ) : null}
              <Field label="Fecha" className={method === "tarjeta_credito" && enCuotas ? "" : "col-span-2"}>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          ) : null}

          <Textarea
            className="mt-3 min-h-16"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Observación (opcional)"
          />

          <div className="mt-4 flex flex-col gap-2">
            <Button className="h-12 text-base" onClick={() => void confirm()}>
              Listo, guardar
            </Button>
            <Button variant="outline" onClick={() => setEdit((v) => !v)}>
              {edit ? "Ver resumen" : "Corregir"}
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Ej: {(beta ? BETA_VOICE_EXAMPLES : VOICE_EXAMPLES)[0]}
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

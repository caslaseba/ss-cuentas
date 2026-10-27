"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, monthKey } from "@/lib/utils";
import { DAD_CARD_NAME, MASTERCARD_NAME, MY_CARD_NAME, cardChoiceLabel, householdCards } from "@/lib/finance/cards";
import { closeOnForMonth, parseCloseOn } from "@/lib/finance/close-cycle";
import { closeMessage, dueMessage, summarizeCard } from "@/lib/finance/settlement";
import { shiftMonth } from "@/lib/finance/wallet";

export function CardManager() {
  const { cards, transactions, installments, profile, saveCard, updateCard } = useFinance();
  const { mine, papa, visible } = householdCards(cards, transactions);

  if (!mine) {
    return <CreateHousehold onCreate={() => saveCard({ name: MY_CARD_NAME, kind: "principal", closing_day: 1, due_day: 14 })} />;
  }

  const summary = profile ? summarizeCard(mine, transactions, installments, profile, cards) : null;
  const schedule = summary?.schedule;
  const papaSpent = summary?.byCard.find((r) => r.id === papa?.id)?.amount ?? 0;
  const others = visible.filter((card) => card.kind === "principal" && card.id !== mine.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarjetas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {schedule && summary ? (
          <div className="space-y-1">
            <p className="text-2xl font-semibold">{formatMoney(summary.totalLocal, "ARS")}</p>
            <p className="text-xs text-muted-foreground">{summary.cycle.label}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone={schedule.daysToClose <= 3 ? "danger" : schedule.daysToClose <= 5 ? "warn" : "default"}>
                {closeMessage(schedule)}
              </Badge>
              <Badge tone={schedule.daysToDue <= 3 ? "warn" : "usd"}>{dueMessage(schedule)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Visa mía: {formatMoney(summary.byCard.find((r) => r.id === mine.id)?.amount ?? 0, "ARS")}
            </p>
            <p className="text-sm text-muted-foreground">
              Extensión de papá: {formatMoney(papaSpent, "ARS")}
            </p>
          </div>
        ) : null}

        <CardCycleForm
          label="Visa mía"
          closing={mine.closing_day}
          due={mine.due_day}
          onSave={async (patch) => {
            try {
              await updateCard(mine.id, { ...patch, name: MY_CARD_NAME });
              toast.success("Cierre y vencimiento guardados");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error");
            }
          }}
        />

        <MonthCloseDates cardId={mine.id} closingDay={mine.closing_day} />

        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Extensión de papá</p>
          <p className="text-xs text-muted-foreground">Extensión de tu papá. Entra en el mismo cierre y lo pagás vos.</p>
          <p className="mt-1 text-sm font-semibold">{formatMoney(papaSpent, "ARS")} este resumen</p>
          {!papa ? (
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                void saveCard({
                  name: DAD_CARD_NAME,
                  kind: "extension",
                  parent_card_id: mine.id,
                  closing_day: mine.closing_day,
                  due_day: mine.due_day,
                })
                  .then(() => toast.success("Extensión de papá lista"))
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
              }}
            >
              Crear extensión de papá
            </Button>
          ) : null}
        </div>

        {others.map((card) => (
          <div key={card.id} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{cardChoiceLabel(card)}</p>
            <p className="text-xs text-muted-foreground">
              Cierra el día {card.closing_day}. Los gastos de esta tarjeta usan esta fecha.
            </p>
            <CardCycleForm
              label={card.name}
              closing={card.closing_day}
              due={card.due_day}
              onSave={async (patch) => {
                try {
                  await updateCard(card.id, patch);
                  toast.success("Cierre guardado");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error");
                }
              }}
            />
            <MonthCloseDates cardId={card.id} closingDay={card.closing_day} />
          </div>
        ))}

        <AddCardForm
          suggestedName={cards.some((card) => card.name.toLowerCase().includes("master")) ? "" : MASTERCARD_NAME}
          onCreate={async (input) => {
            await saveCard({ ...input, kind: "principal" });
            toast.success(`${input.name} lista. Ya podés elegirla en un gasto con tarjeta.`);
          }}
        />
      </CardContent>
    </Card>
  );
}

function CardCycleForm({
  label,
  closing,
  due,
  onSave,
}: {
  label: string;
  closing: number;
  due: number;
  onSave: (patch: { closing_day: number; due_day: number }) => Promise<void> | void;
}) {
  const [closeDay, setCloseDay] = useState(String(closing));
  const [dueDay, setDueDay] = useState(String(due));

  return (
    <form
      className="grid grid-cols-2 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          closing_day: Math.min(28, Math.max(1, Number(closeDay) || 1)),
          due_day: Math.min(28, Math.max(1, Number(dueDay) || 14)),
        });
      }}
    >
      <div>
        <Label>Día de cierre · {label}</Label>
        <Input className="mt-1.5" inputMode="numeric" value={closeDay} onChange={(e) => setCloseDay(e.target.value)} />
      </div>
      <div>
        <Label>Día de vencimiento</Label>
        <Input className="mt-1.5" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
      </div>
      <Button className="col-span-2" type="submit">
        Guardar cierre y vencimiento
      </Button>
    </form>
  );
}

function AddCardForm({
  suggestedName,
  onCreate,
}: {
  suggestedName: string;
  onCreate: (input: { name: string; closing_day: number; due_day: number }) => Promise<void>;
}) {
  const [name, setName] = useState(suggestedName);
  const [closeDay, setCloseDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2 rounded-xl border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const closing = Math.min(28, Math.max(1, Number(closeDay) || 0));
        const due = Math.min(28, Math.max(1, Number(dueDay) || closing));
        if (!name.trim() || !(Number(closeDay) >= 1)) {
          toast.error("Escribí el nombre y el día de cierre.");
          return;
        }
        setBusy(true);
        void onCreate({ name: name.trim(), closing_day: closing, due_day: due })
          .then(() => {
            setName("");
            setCloseDay("");
            setDueDay("");
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : "No se pudo agregar la tarjeta"))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm font-medium">Agregar tarjeta</p>
      <p className="text-xs text-muted-foreground">Por ahora, además de la Visa y la extensión, la MasterCard ICBC.</p>
      <div>
        <Label htmlFor="nueva-tarjeta">Nombre</Label>
        <Input id="nueva-tarjeta" className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} placeholder="MasterCard ICBC" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="nueva-cierre">Día de cierre</Label>
          <Input id="nueva-cierre" className="mt-1.5" inputMode="numeric" value={closeDay} onChange={(event) => setCloseDay(event.target.value)} placeholder="Ej. 15" />
        </div>
        <div>
          <Label htmlFor="nueva-vence">Día de vencimiento</Label>
          <Input id="nueva-vence" className="mt-1.5" inputMode="numeric" value={dueDay} onChange={(event) => setDueDay(event.target.value)} placeholder="Ej. 25" />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Agregando…" : "Agregar tarjeta"}
      </Button>
    </form>
  );
}

function MonthCloseDates({ cardId, closingDay }: { cardId: string; closingDay: number }) {
  const { monthCloses, saveMonthClose } = useFinance();
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), 1);
  const previous = shiftMonth(current, -1);
  const rows = [
    { month: previous, label: "Cierre del mes pasado" },
    { month: current, label: "Cierre de este mes" },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">Fechas de cierre</p>
      <p className="text-xs text-muted-foreground">Están acá, no en el resumen. El día de arriba es el habitual.</p>
      {rows.map((row) => {
        const value = closeOnForMonth(row.month, closingDay, monthCloses, cardId);
        return (
          <label key={monthKey(row.month)} className="block text-xs font-medium">
            {row.label}
            <input
              type="date"
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={value}
              onChange={(event) => {
                const closingOn = parseCloseOn(event.target.value);
                if (!closingOn) return;
                void saveMonthClose(cardId, monthKey(row.month), closingOn)
                  .then(() => toast.success("Cierre guardado"))
                  .catch((err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar el cierre"));
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

function CreateHousehold({ onCreate }: { onCreate: () => Promise<unknown> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visa ICBC</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Solo usamos tu Visa ICBC y la extensión de papá.
        </p>
        <Button
          onClick={() => {
            void onCreate()
              .then(() => toast.success("Visa ICBC lista. La extensión de papá se crea sola."))
              .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
          }}
        >
          Crear Visa ICBC
        </Button>
      </CardContent>
    </Card>
  );
}

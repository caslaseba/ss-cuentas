"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import { DAD_CARD_NAME, MY_CARD_NAME, householdCards } from "@/lib/finance/cards";
import { closeMessage, dueMessage, summarizeCard } from "@/lib/finance/settlement";

export function CardManager() {
  const { cards, transactions, installments, profile, saveCard, updateCard } = useFinance();
  const { mine, papa } = householdCards(cards, transactions);

  if (!mine) {
    return <CreateHousehold onCreate={() => saveCard({ name: MY_CARD_NAME, kind: "principal", closing_day: 1, due_day: 14 })} />;
  }

  const summary = profile ? summarizeCard(mine, transactions, installments, profile, cards) : null;
  const schedule = summary?.schedule;
  const papaSpent = summary?.byCard.find((r) => r.id === papa?.id)?.amount ?? 0;

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
              {MY_CARD_NAME}: {formatMoney(summary.byCard.find((r) => r.id === mine.id)?.amount ?? 0, "ARS")}
            </p>
            <p className="text-sm text-muted-foreground">
              {DAD_CARD_NAME}: {formatMoney(papaSpent, "ARS")}
            </p>
          </div>
        ) : null}

        <CardCycleForm
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

        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{DAD_CARD_NAME}</p>
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
      </CardContent>
    </Card>
  );
}

function CardCycleForm({
  closing,
  due,
  onSave,
}: {
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
        <Label>Día de cierre · {MY_CARD_NAME}</Label>
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

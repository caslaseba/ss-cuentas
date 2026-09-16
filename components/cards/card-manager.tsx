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
import { closeMessage, dueMessage, summarizeCard } from "@/lib/finance/settlement";

export function CardManager() {
  const { cards, transactions, installments, profile, saveCard, updateCard } = useFinance();
  const principals = cards.filter((c) => c.kind === "principal");

  return (
    <div className="space-y-4">
      {principals.map((card) => {
        const extensions = cards.filter((c) => c.parent_card_id === card.id);
        const summary = profile ? summarizeCard(card, transactions, installments, profile, cards) : null;
        const schedule = summary?.schedule;
        return (
          <Card key={card.id}>
            <CardHeader>
              <CardTitle>{card.name}</CardTitle>
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
                  {summary.byCard.length > 1
                    ? summary.byCard.map((row) => (
                        <p key={row.id} className="text-sm text-muted-foreground">
                          {row.kind === "extension" ? row.name : "Tuya"}: {formatMoney(row.amount, "ARS")}
                        </p>
                      ))
                    : null}
                </div>
              ) : null}

              <CardCycleForm
                name={card.name}
                closing={card.closing_day}
                due={card.due_day}
                onSave={async (patch) => {
                  try {
                    await updateCard(card.id, patch);
                    toast.success("Tarjeta actualizada");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error");
                  }
                }}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Extensiones</p>
                {extensions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Si tu papá tiene extensión, agregala. Sus consumos entran en el mismo cierre y los pagás vos.
                  </p>
                ) : null}
                {extensions.map((ext) => (
                  <ExtensionRow
                    key={ext.id}
                    name={ext.name}
                    spent={summary?.byCard.find((r) => r.id === ext.id)?.amount ?? 0}
                    onSave={async (name) => {
                      try {
                        await updateCard(ext.id, { name });
                        toast.success("Extensión actualizada");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Error");
                      }
                    }}
                  />
                ))}
                <AddExtension
                  onAdd={async (name) => {
                    try {
                      await saveCard({
                        name,
                        kind: "extension",
                        parent_card_id: card.id,
                        closing_day: card.closing_day,
                        due_day: card.due_day,
                      });
                      toast.success("Extensión lista. Cargá sus gastos eligiendo esta tarjeta.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Error");
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {principals.length === 0 ? <NewPrincipal /> : <NewPrincipal compact />}
    </div>
  );
}

function CardCycleForm({
  name,
  closing,
  due,
  onSave,
}: {
  name: string;
  closing: number;
  due: number;
  onSave: (patch: { name: string; closing_day: number; due_day: number }) => Promise<void> | void;
}) {
  const [cardName, setCardName] = useState(name);
  const [closeDay, setCloseDay] = useState(String(closing));
  const [dueDay, setDueDay] = useState(String(due));

  return (
    <form
      className="grid grid-cols-2 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          name: cardName.trim() || name,
          closing_day: Math.min(28, Math.max(1, Number(closeDay) || 10)),
          due_day: Math.min(28, Math.max(1, Number(dueDay) || 20)),
        });
      }}
    >
      <div className="col-span-2">
        <Label>Nombre</Label>
        <Input className="mt-1.5" value={cardName} onChange={(e) => setCardName(e.target.value)} />
      </div>
      <div>
        <Label>Día de cierre</Label>
        <Input className="mt-1.5" inputMode="numeric" value={closeDay} onChange={(e) => setCloseDay(e.target.value)} />
        <p className="mt-1 text-[11px] text-muted-foreground">Último día que entra en este resumen (1–28).</p>
      </div>
      <div>
        <Label>Día de vencimiento</Label>
        <Input className="mt-1.5" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        <p className="mt-1 text-[11px] text-muted-foreground">Cuándo hay que pagar el resumen (1–28).</p>
      </div>
      <Button className="col-span-2" type="submit">
        Guardar cierre y vencimiento
      </Button>
    </form>
  );
}

function ExtensionRow({
  name,
  spent,
  onSave,
}: {
  name: string;
  spent: number;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(value.trim() || name);
      }}
    >
      <div className="flex-1">
        <Label>Extensión</Label>
        <Input className="mt-1.5" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <p className="pb-2 text-xs text-muted-foreground">{formatMoney(spent, "ARS")}</p>
      <Button type="submit" variant="outline" size="sm">
        OK
      </Button>
    </form>
  );
}

function AddExtension({ onAdd }: { onAdd: (name: string) => Promise<void> | void }) {
  const [name, setName] = useState("Extensión papá");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(name.trim() || "Extensión papá");
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Extensión papá" />
      <Button type="submit" variant="outline">
        Agregar
      </Button>
    </form>
  );
}

function NewPrincipal({ compact = false }: { compact?: boolean }) {
  const { saveCard } = useFinance();
  const [cardName, setCardName] = useState("Visa");
  const [closing, setClosing] = useState("10");
  const [due, setDue] = useState("20");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{compact ? "Otra tarjeta" : "Nueva tarjeta"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-3 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveCard({
              name: cardName,
              kind: "principal",
              closing_day: Number(closing) || 10,
              due_day: Number(due) || 20,
            })
              .then(() => toast.success("Tarjeta lista"))
              .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
          }}
        >
          <div className="col-span-3">
            <Label>Nombre</Label>
            <Input className="mt-1.5" value={cardName} onChange={(e) => setCardName(e.target.value)} />
          </div>
          <div>
            <Label>Cierre</Label>
            <Input className="mt-1.5" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </div>
          <div>
            <Label>Vence</Label>
            <Input className="mt-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button className="self-end" type="submit">
            Agregar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

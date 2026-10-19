"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RecurringEdit } from "@/components/entry/recurring-edit";
import { CategorySuggest } from "@/components/entry/category-suggest";
import { ServiceSubField } from "@/components/entry/service-sub-field";
import { useEdition } from "@/components/providers/edition-provider";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { householdCards } from "@/lib/finance/cards";
import { parseAmountInput } from "@/lib/finance/amount";
import {
  guessServiceSubcategory,
  isCardRecurring,
  recurringSubcategory,
  withRecurringSub,
  withRecurringVia,
  type ServiceSubcategory,
} from "@/lib/finance/recurring";
import { describeCategoryChoice } from "@/lib/finance/similar-category";
import { formatMoney } from "@/lib/utils";
import type { RecurringPayment } from "@/lib/types";

export function RecurringPanel() {
  const { recurring, saveRecurring, cards, transactions, categories, saveCategory } = useFinance();
  const { beta } = useEdition();
  const { visible } = householdCards(cards, transactions);
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedDay, setFixedDay] = useState("10");
  const [fixedPay, setFixedPay] = useState("plata");
  const [categoryName, setCategoryName] = useState("");
  const [serviceSub, setServiceSub] = useState<ServiceSubcategory>("Otro");
  const [subTouched, setSubTouched] = useState(false);
  const [editing, setEditing] = useState<RecurringPayment | null>(null);

  return (
    <div className="space-y-3">
      {recurring.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay fijos. Agregá luz, internet, Netflix…</p>
      ) : (
        <p className="text-xs text-muted-foreground">Tocá uno para cambiar el monto, si se debita de la Visa, o borrarlo.</p>
      )}
      {recurring.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setEditing(item)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm"
        >
          <span className="min-w-0">
            {item.name}{" "}
            <span className="text-muted-foreground">
              · {recurringSubcategory(item)}
              {isCardRecurring(item) ? " · se debita con la Visa" : ` · día ${item.due_day}${item.is_paid ? " · pagado" : ""}`}
            </span>
          </span>
          <span className="shrink-0 font-medium">{formatMoney(Number(item.amount), item.currency)}</span>
        </button>
      ))}
      <form
        className="grid grid-cols-3 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const choice = beta ? describeCategoryChoice(categories, "egreso", categoryName || fixedName) : null;
          void (async () => {
            let categoryId: string | null = null;
            if (choice?.kind === "exact" || choice?.kind === "similar") {
              categoryId = choice.category.id;
              if (choice.kind === "similar") {
                toast.message(`Usé la categoría existente “${choice.category.name}”.`);
              }
            } else if (choice?.kind === "create") {
              const created = await saveCategory({ name: choice.name, type: "egreso" });
              categoryId = created.id;
              toast.success(`Categoría nueva: ${created.name}`);
            }
            await saveRecurring({
              name: fixedName,
              amount: parseAmountInput(fixedAmount),
              due_day: fixedPay === "plata" ? Number(fixedDay) || 10 : 1,
              frequency: "mensual",
              category_id: categoryId,
              notes: withRecurringSub(
                withRecurringVia(
                  null,
                  fixedPay !== "plata",
                  fixedPay !== "plata" && fixedPay !== "tarjeta" ? fixedPay : visible[0]?.id ?? null,
                ),
                serviceSub,
              ),
            });
            toast.success(
              fixedPay === "plata"
                ? "Servicio agregado. Lo ves en Hoy para marcarlo pagado."
                : "Servicio de tarjeta agregado. Aparece en Hoy sin restar de tu plata.",
            );
            setFixedName("");
            setFixedAmount("");
            setCategoryName("");
            setFixedPay("plata");
            setSubTouched(false);
            setServiceSub("Otro");
          })().catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
        }}
      >
        <Input
          className="col-span-3"
          value={fixedName}
          onChange={(event) => {
            const value = event.target.value;
            setFixedName(value);
            if (!subTouched) setServiceSub(guessServiceSubcategory(value));
          }}
          placeholder="Luz, gas, Netflix…"
          required
        />
        {beta ? (
          <div className="col-span-3">
            <CategorySuggest
              categories={categories}
              type="egreso"
              value={categoryName}
              onChange={setCategoryName}
              placeholder="Categoría (si la dejás vacía, usa el nombre)"
            />
          </div>
        ) : null}
        <div className="col-span-3">
          <ServiceSubField
            value={serviceSub}
            onChange={(value) => {
              setSubTouched(true);
              setServiceSub(value);
            }}
          />
        </div>
        <AmountInput value={fixedAmount} onChange={setFixedAmount} placeholder="Monto" required />
        {fixedPay === "plata" ? (
          <label className="block text-[11px] text-muted-foreground">
            Día del mes
            <Input className="mt-1" inputMode="numeric" value={fixedDay} onChange={(event) => setFixedDay(event.target.value)} placeholder="10" />
          </label>
        ) : (
          <p className="self-center text-xs text-muted-foreground">Sin vencimiento: se paga con la tarjeta</p>
        )}
        <Select className="col-span-3" value={fixedPay} onChange={(event) => setFixedPay(event.target.value)}>
          <option value="plata">Lo pago yo</option>
          {visible.map((card) => (
            <option key={card.id} value={card.id}>
              Se debita de {card.name}
            </option>
          ))}
        </Select>
        <Button type="submit" className="col-span-3 sm:col-span-1">
          Agregar
        </Button>
      </form>
      <RecurringEdit item={editing} open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} />
    </div>
  );
}

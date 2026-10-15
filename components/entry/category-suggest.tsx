"use client";

import { Input } from "@/components/ui/input";
import { describeCategoryChoice } from "@/lib/finance/similar-category";
import type { Category, TransactionType } from "@/lib/types";

export function CategorySuggest({
  categories,
  type,
  value,
  onChange,
  placeholder = "Categoría",
}: {
  categories: Category[];
  type: TransactionType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const listId = `categorias-${type}`;
  const choice = describeCategoryChoice(categories, type, value);
  const names = categories
    .filter((category) => category.type === type)
    .map((category) => category.name)
    .sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="space-y-1">
      <Input
        value={value}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {choice.kind === "similar" ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Ya existe “{choice.category.name}”. Si guardás, uso esa y no creo otra.
        </p>
      ) : null}
      {choice.kind === "create" ? (
        <p className="text-xs text-muted-foreground">Se va a crear la categoría {choice.name}.</p>
      ) : null}
    </div>
  );
}

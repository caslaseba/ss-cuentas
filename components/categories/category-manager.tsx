"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Category } from "@/lib/types";

export function CategoryManager() {
  const { categories, saveCategory, updateCategory, deleteCategory } = useFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState<Category["type"]>("egreso");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  const expenses = categories.filter((c) => c.type === "egreso").sort((a, b) => a.name.localeCompare(b.name, "es"));
  const incomes = categories.filter((c) => c.type === "ingreso").sort((a, b) => a.name.localeCompare(b.name, "es"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveCategory({ name, type });
      toast.success("Categoría agregada");
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await updateCategory(id, { name: editingName });
      toast.success("Categoría actualizada");
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(cat: Category) {
    if (!confirm(`¿Borrar “${cat.name}”? Los gastos quedan, pero sin esa categoría.`)) return;
    setBusy(true);
    try {
      await deleteCategory(cat.id);
      toast.success("Categoría borrada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Estas son las que ves en el resumen. Agregá las que uses (farmacia, mascotas, colegio…) para que no se mezclen.
        </p>
        <CategoryList
          title="Gastos"
          items={expenses}
          editingId={editingId}
          editingName={editingName}
          busy={busy}
          onEdit={(cat) => {
            setEditingId(cat.id);
            setEditingName(cat.name);
          }}
          onChangeName={setEditingName}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
          onRemove={remove}
        />
        <CategoryList
          title="Ingresos"
          items={incomes}
          editingId={editingId}
          editingName={editingName}
          busy={busy}
          onEdit={(cat) => {
            setEditingId(cat.id);
            setEditingName(cat.name);
          }}
          onChangeName={setEditingName}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
          onRemove={remove}
        />
        <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={(e) => void add(e)}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nueva categoría"
            required
          />
          <Select value={type} onChange={(e) => setType(e.target.value as Category["type"])}>
            <option value="egreso">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Select>
          <Button className="col-span-2" disabled={busy} type="submit">
            Agregar categoría
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryList({
  title,
  items,
  editingId,
  editingName,
  busy,
  onEdit,
  onChangeName,
  onSave,
  onCancel,
  onRemove,
}: {
  title: string;
  items: Category[];
  editingId: string | null;
  editingName: string;
  busy: boolean;
  onEdit: (cat: Category) => void;
  onChangeName: (name: string) => void;
  onSave: (id: string) => Promise<void>;
  onCancel: () => void;
  onRemove: (cat: Category) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.map((cat) => (
        <div key={cat.id} className="flex items-center gap-2 rounded-xl border border-border px-2 py-1.5">
          {editingId === cat.id ? (
            <>
              <Input
                className="h-8"
                value={editingName}
                onChange={(e) => onChangeName(e.target.value)}
                autoFocus
              />
              <Button size="sm" disabled={busy} type="button" onClick={() => void onSave(cat.id)}>
                OK
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm"
                onClick={() => onEdit(cat)}
              >
                {cat.name}
              </button>
              <Button size="sm" variant="ghost" type="button" onClick={() => onEdit(cat)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => onRemove(cat)}>
                Borrar
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

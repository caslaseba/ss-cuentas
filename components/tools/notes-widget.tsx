"use client";

import { useEffect, useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const KEY = "ss-cuentas-notes";

type Note = {
  id: string;
  text: string;
  updatedAt: string;
};

function readNotes(): Note[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as Note[];
    return Array.isArray(parsed) ? parsed.filter((note) => note && typeof note.text === "string") : [];
  } catch {
    return [];
  }
}

export function NotesWidget() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setNotes(readNotes());
  }, [open]);

  function persist(next: Note[]) {
    setNotes(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function add() {
    const text = draft.trim();
    if (!text) return;
    persist([{ id: crypto.randomUUID(), text, updatedAt: new Date().toISOString() }, ...notes]);
    setDraft("");
  }

  function update(id: string, text: string) {
    persist(notes.map((note) => (note.id === id ? { ...note, text, updatedAt: new Date().toISOString() } : note)));
  }

  function remove(id: string) {
    persist(notes.filter((note) => note.id !== id));
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Notas">
        <StickyNote className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%-1rem,32rem)]">
          <DialogHeader>
            <DialogTitle>Notas rápidas</DialogTitle>
          </DialogHeader>
          <p className="mb-3 text-xs text-muted-foreground">
            Quedan guardadas en este navegador. No se pierden al cerrar la ventana.
          </p>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Anotá algo y guardalo"
            className="min-h-20"
          />
          <Button type="button" className="mt-2 w-full" onClick={add} disabled={!draft.trim()}>
            Guardar nota
          </Button>
          <div className="mt-4 space-y-2">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay notas.</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border p-2">
                  <Textarea
                    value={note.text}
                    onChange={(event) => update(note.id, event.target.value)}
                    className="min-h-16 border-0 bg-transparent p-1 shadow-none"
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(note.id)} aria-label="Borrar nota">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

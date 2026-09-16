const OBS_PREFIX = "obs:";
const CARGO_PREFIX = "cargo:";

function notesLines(notes: string | null | undefined) {
  return (notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function observationOf(notes: string | null | undefined) {
  const line = notesLines(notes).find((l) => l.toLowerCase().startsWith(OBS_PREFIX));
  return line ? line.slice(OBS_PREFIX.length).trim() : "";
}

export function withObservation(notes: string | null | undefined, observation: string) {
  const extra = notesLines(notes).filter((l) => !l.toLowerCase().startsWith(OBS_PREFIX));
  const text = observation.trim();
  if (text) extra.push(`${OBS_PREFIX} ${text}`);
  return extra.length ? extra.join("\n") : null;
}

export type CardChargeKind = "impuesto" | "interes" | "otro";

export function cardChargeOf(notes: string | null | undefined): CardChargeKind | null {
  const line = notesLines(notes).find((l) => l.toLowerCase().startsWith(CARGO_PREFIX));
  if (!line) return null;
  const kind = line.slice(CARGO_PREFIX.length).trim().toLowerCase();
  if (kind === "impuesto" || kind === "interes" || kind === "otro") return kind;
  return "otro";
}

export function withCardCharge(notes: string | null | undefined, kind: CardChargeKind) {
  const extra = notesLines(notes).filter((l) => !l.toLowerCase().startsWith(CARGO_PREFIX));
  extra.unshift(`${CARGO_PREFIX}${kind}`);
  return extra.join("\n");
}

export function notesHasLine(notes: string | null | undefined, line: string) {
  return notesLines(notes).includes(line);
}

export function isLeftoverTx(notes: string | null | undefined) {
  return notesLines(notes).some((l) => l.startsWith("sobra:"));
}

import type { Installment } from "@/lib/types";

const PROJECTED_CUOTA_PREFIX = "cuota-";

/** Id de una cuota estimada: `cuota-<plan uuid>-<número>`. */
export function planIdFromProjectedCuota(id: string) {
  if (!id.startsWith(PROJECTED_CUOTA_PREFIX)) return null;
  const rest = id.slice(PROJECTED_CUOTA_PREFIX.length);
  const match = rest.match(/^(.*)-(\d+)$/);
  return match?.[1] || null;
}

export function installmentDropPrompts(plan: Pick<Installment, "concept" | "current_installment" | "installment_count">) {
  const total = Math.max(1, Number(plan.installment_count) || 1);
  const current = Math.min(Math.max(Number(plan.current_installment) || 1, 1), total);
  const left = Math.max(0, total - current);
  const name = plan.concept.trim() || "Esta compra";
  if (left > 0) {
    const future =
      left === 1
        ? "la cuota del mes que viene va a desaparecer"
        : `las ${left} cuotas que faltan van a desaparecer, incluida la del mes que viene`;
    return {
      first: `${name} está en la cuota ${current} de ${total}. Si lo eliminás, ${future}. ¿Seguís?`,
      second:
        left === 1
          ? `Confirmá otra vez: se borra el plan de ${name} y la cuota del mes que viene no va a aparecer.`
          : `Confirmá otra vez: se borra el plan de ${name} y las ${left} cuotas que faltan no van a aparecer.`,
    };
  }
  return {
    first: `${name} es la última cuota (${current} de ${total}). Si lo eliminás, el plan se borra y no vuelve a generarse solo. ¿Seguís?`,
    second: `Confirmá otra vez: se elimina ${name} y no queda ninguna cuota.`,
  };
}

/** Dos preguntas seguidas. Cancelar cualquiera de las dos deja el plan como está. */
export function confirmDropInstallment(plan: Pick<Installment, "concept" | "current_installment" | "installment_count">) {
  const { first, second } = installmentDropPrompts(plan);
  return confirm(first) && confirm(second);
}

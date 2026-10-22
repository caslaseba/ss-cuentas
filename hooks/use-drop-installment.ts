"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/providers/finance-provider";
import { confirmDropInstallment, planIdFromProjectedCuota } from "@/lib/finance/installment-drop";
import type { Transaction } from "@/lib/types";

/** Si la fila es una cuota estimada, pide doble confirmación y borra el plan. */
export function useDropInstallment() {
  const { installments, deleteInstallment } = useFinance();

  return useCallback(
    async (tx: Transaction) => {
      const planId = planIdFromProjectedCuota(tx.id);
      if (!planId) return false;
      const plan = installments.find((item) => item.id === planId);
      if (!plan) {
        toast.message("Es una proyección: todavía no se debitó.");
        return true;
      }
      if (!confirmDropInstallment(plan)) return true;
      try {
        await deleteInstallment(plan.id);
        toast.success(`${plan.concept} eliminado. No vuelve a aparecer.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
      return true;
    },
    [deleteInstallment, installments],
  );
}

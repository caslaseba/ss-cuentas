-- El precio de un mensual queda guardado por mes.
-- Borrarlo no lo saca de los meses ya pasados: desde void_from figura anulado.

alter table public.recurring_payments
  add column if not exists price_log jsonb not null default '[]'::jsonb,
  add column if not exists void_from date;

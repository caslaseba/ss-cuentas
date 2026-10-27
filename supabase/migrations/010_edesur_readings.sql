-- Lectura de cada medidor y el momento en que se tomó.

alter table public.edesur_months
  add column if not exists brother_reading numeric,
  add column if not exists brother_read_at timestamptz,
  add column if not exists brother2_reading numeric,
  add column if not exists brother2_read_at timestamptz,
  add column if not exists mine_reading numeric,
  add column if not exists mine_read_at timestamptz;

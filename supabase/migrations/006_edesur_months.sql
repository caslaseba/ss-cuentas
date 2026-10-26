-- Reparto de EDESUR por mes. Cada mes guarda sus propios kWh.

create table if not exists public.edesur_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  total_kwh numeric not null,
  total_bill numeric not null,
  mine_kwh numeric not null,
  brother_kwh numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, month_key)
);

create index if not exists idx_edesur_months_user on public.edesur_months (user_id, month_key);

alter table public.edesur_months enable row level security;

drop policy if exists "edesur_months_all_own" on public.edesur_months;
create policy "edesur_months_all_own"
  on public.edesur_months
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.edesur_months to authenticated;
grant all on public.edesur_months to service_role;

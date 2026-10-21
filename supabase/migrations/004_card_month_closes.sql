-- Cierre de la tarjeta por mes. Si esta tabla todavía no existe,
-- la app guarda el mismo dato en sync_queue.

create table if not exists public.card_month_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  closing_on date not null,
  created_at timestamptz not null default now(),
  unique (credit_card_id, month_key)
);

create index if not exists idx_card_month_closes_user on public.card_month_closes (user_id, month_key);

alter table public.card_month_closes enable row level security;

drop policy if exists "card_month_closes_all_own" on public.card_month_closes;
create policy "card_month_closes_all_own"
  on public.card_month_closes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

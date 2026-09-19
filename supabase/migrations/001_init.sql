-- SS Cuentas — esquema inicial, RLS y semillas
-- Ejecutar en el SQL Editor de Supabase (o via CLI: supabase db push)

-- Extensiones
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type public.transaction_type as enum ('ingreso', 'egreso');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.currency_code as enum ('ARS', 'USD');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_kind as enum ('efectivo', 'caja_ahorro', 'billetera');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.card_kind as enum ('principal', 'extension');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum (
    'efectivo',
    'debito',
    'transferencia',
    'billetera',
    'tarjeta_credito'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.recurrence_frequency as enum ('mensual', 'semanal', 'anual');
exception when duplicate_object then null;
end $$;

-- Perfiles (1:1 con auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  local_currency public.currency_code not null default 'ARS',
  usd_exchange_rate numeric(14, 4) not null default 1300,
  tax_surcharge_pct numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categorías
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type public.transaction_type not null,
  icon text not null default 'tag',
  monthly_limit numeric(14, 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

-- Cuentas / cajas / billeteras
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind public.account_kind not null default 'efectivo',
  currency public.currency_code not null default 'ARS',
  balance numeric(14, 2) not null default 0,
  is_savings_box boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- Tarjetas de crédito (principal / extensión)
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind public.card_kind not null default 'principal',
  parent_card_id uuid references public.credit_cards (id) on delete set null,
  closing_day smallint not null default 10 check (closing_day between 1 and 28),
  due_day smallint not null default 20 check (due_day between 1 and 28),
  credit_limit numeric(14, 2) not null default 0,
  available_limit numeric(14, 2) not null default 0,
  usd_tax_pct numeric(6, 2) not null default 0,
  last4 text,
  created_at timestamptz not null default now(),
  constraint extension_has_parent check (
    (kind = 'principal' and parent_card_id is null)
    or (kind = 'extension')
  )
);

-- Compras en cuotas
create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  concept text not null,
  currency public.currency_code not null default 'ARS',
  total_amount numeric(14, 2) not null,
  installment_count smallint not null check (installment_count >= 2),
  installment_amount numeric(14, 2) not null,
  start_date date not null,
  current_installment smallint not null default 1,
  created_at timestamptz not null default now()
);

-- Transacciones
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.transaction_type not null,
  amount numeric(14, 2) not null check (amount >= 0),
  currency public.currency_code not null default 'ARS',
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  credit_card_id uuid references public.credit_cards (id) on delete set null,
  installment_id uuid references public.installments (id) on delete set null,
  installment_number smallint,
  concept text not null,
  payment_method public.payment_method not null default 'efectivo',
  occurred_on date not null default (timezone('America/Argentina/Buenos_Aires', now()))::date,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'voz', 'recurrente', 'cuota')),
  created_at timestamptz not null default now()
);

-- Pagos fijos / suscripciones
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  amount numeric(14, 2) not null,
  currency public.currency_code not null default 'ARS',
  frequency public.recurrence_frequency not null default 'mensual',
  due_day smallint not null default 1 check (due_day between 1 and 28),
  is_paid boolean not null default false,
  paid_month date,
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- Cola offline (opcional, espejo en cliente; útil para auditoría)
create table if not exists public.sync_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_categories_user on public.categories (user_id);
create index if not exists idx_accounts_user on public.accounts (user_id);
create index if not exists idx_cards_user on public.credit_cards (user_id);
create index if not exists idx_tx_user_date on public.transactions (user_id, occurred_on desc);
create index if not exists idx_tx_category on public.transactions (category_id);
create index if not exists idx_tx_card on public.transactions (credit_card_id);
create index if not exists idx_installments_user on public.installments (user_id);
create index if not exists idx_recurring_user on public.recurring_payments (user_id);

-- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Semillas de categorías por usuario
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, icon, monthly_limit, is_default)
  values
    (p_user_id, 'Sueldo', 'ingreso', 'wallet', null, true),
    (p_user_id, 'Transferencia', 'ingreso', 'arrow-left-right', null, true),
    (p_user_id, 'Freelance', 'ingreso', 'briefcase', null, true),
    (p_user_id, 'Inversiones', 'ingreso', 'trending-up', null, true),
    (p_user_id, 'Otros ingresos', 'ingreso', 'plus-circle', null, true),
    (p_user_id, 'Alimentación', 'egreso', 'utensils', 150000, true),
    (p_user_id, 'Supermercado', 'egreso', 'shopping-cart', 200000, true),
    (p_user_id, 'Transporte', 'egreso', 'car', 80000, true),
    (p_user_id, 'Vivienda', 'egreso', 'home', 400000, true),
    (p_user_id, 'Servicios', 'egreso', 'zap', 80000, true),
    (p_user_id, 'Suscripciones', 'egreso', 'repeat', 30000, true),
    (p_user_id, 'Salud', 'egreso', 'heart-pulse', 50000, true),
    (p_user_id, 'Educación', 'egreso', 'graduation-cap', 40000, true),
    (p_user_id, 'Ocio', 'egreso', 'clapperboard', 60000, true),
    (p_user_id, 'Ropa', 'egreso', 'shirt', 40000, true),
    (p_user_id, 'Tecnología', 'egreso', 'smartphone', null, true),
    (p_user_id, 'Impuestos', 'egreso', 'receipt', null, true),
    (p_user_id, 'Transferencias', 'egreso', 'arrow-left-right', null, true),
    (p_user_id, 'Otros egresos', 'egreso', 'circle-dot', null, true)
  on conflict (user_id, name, type) do nothing;
end;
$$;

-- Alta de perfil + semillas al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  perform public.seed_default_categories(new.id);

  insert into public.accounts (user_id, name, kind, is_savings_box)
  select new.id, v.name, v.kind, v.is_savings_box
  from (
    values
      ('Efectivo'::text, 'efectivo'::public.account_kind, false),
      ('Caja de ahorro', 'caja_ahorro', false),
      ('Fondo emergencia', 'caja_ahorro', true)
  ) as v(name, kind, is_savings_box)
  where not exists (
    select 1 from public.accounts a
    where a.user_id = new.id and a.name = v.name
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.installments enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.sync_queue enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "categories_all_own" on public.categories;
drop policy if exists "accounts_all_own" on public.accounts;
drop policy if exists "cards_all_own" on public.credit_cards;
drop policy if exists "installments_all_own" on public.installments;
drop policy if exists "transactions_all_own" on public.transactions;
drop policy if exists "recurring_all_own" on public.recurring_payments;
drop policy if exists "sync_all_own" on public.sync_queue;

-- Políticas: el usuario solo ve y muta sus filas
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_all_own" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_all_own" on public.credit_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "installments_all_own" on public.installments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_all_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_all_own" on public.recurring_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sync_all_own" on public.sync_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Insert de perfil propio (por si el trigger no corre en algún entorno)
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

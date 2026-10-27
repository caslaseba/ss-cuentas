-- Fotos del medidor de EDESUR, una por lectura y por mes.

create table if not exists public.edesur_meter_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  storage_path text not null,
  label text not null check (label in ('mio', 'hermano')),
  created_at timestamptz not null default now()
);

create index if not exists idx_edesur_meter_photos_user on public.edesur_meter_photos (user_id, month_key);

alter table public.edesur_meter_photos enable row level security;

drop policy if exists "edesur_meter_photos_all_own" on public.edesur_meter_photos;
create policy "edesur_meter_photos_all_own"
  on public.edesur_meter_photos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.edesur_meter_photos to authenticated;
grant all on public.edesur_meter_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edesur-meters', 'edesur-meters', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "edesur_meters_read_own" on storage.objects;
create policy "edesur_meters_read_own"
  on storage.objects
  for select
  using (
    bucket_id = 'edesur-meters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "edesur_meters_insert_own" on storage.objects;
create policy "edesur_meters_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'edesur-meters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "edesur_meters_delete_own" on storage.objects;
create policy "edesur_meters_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'edesur-meters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- El hermano tiene dos medidores. El segundo kWh queda en 0 en los meses ya guardados.

alter table public.edesur_months
  add column if not exists brother_kwh_2 numeric not null default 0;

alter table public.edesur_meter_photos drop constraint if exists edesur_meter_photos_label_check;

alter table public.edesur_meter_photos
  add constraint edesur_meter_photos_label_check
  check (label in ('mio', 'hermano', 'hermano2', 'factura'));

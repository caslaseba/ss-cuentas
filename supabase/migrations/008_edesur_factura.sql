-- La factura de EDESUR se archiva junto con las fotos del medidor.

alter table public.edesur_meter_photos drop constraint if exists edesur_meter_photos_label_check;

alter table public.edesur_meter_photos
  add constraint edesur_meter_photos_label_check
  check (label in ('mio', 'hermano', 'factura'));

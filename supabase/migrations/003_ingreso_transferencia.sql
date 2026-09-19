-- Categoría de ingreso Transferencia (MP y transferencia son el mismo medio).
insert into public.categories (user_id, name, type, icon, monthly_limit, is_default)
select p.id, 'Transferencia', 'ingreso', 'arrow-left-right', null, true
from public.profiles p
on conflict (user_id, name, type) do nothing;

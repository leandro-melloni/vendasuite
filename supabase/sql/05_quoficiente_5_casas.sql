-- Execute no SQL Editor do Supabase para permitir cinco casas decimais no quoficiente.
alter table public.produtos
  alter column quoficiente type numeric(12,5)
  using round(coalesce(quoficiente, 0)::numeric, 5);

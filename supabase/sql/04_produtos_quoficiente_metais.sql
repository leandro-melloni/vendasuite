-- Execute este arquivo no SQL Editor do Supabase antes de publicar esta versão.
alter table public.produtos
  add column if not exists quoficiente numeric(12,5) default 0;

create table if not exists public.configuracoes_metais (
  id integer primary key default 1 check (id = 1),
  valor_ouro numeric(12,2) not null default 0,
  valor_prata numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_metais (id, valor_ouro, valor_prata)
values (1, 0, 0)
on conflict (id) do nothing;

alter table public.configuracoes_metais enable row level security;
drop policy if exists "dev_all_configuracoes_metais" on public.configuracoes_metais;
create policy "dev_all_configuracoes_metais"
on public.configuracoes_metais for all
using (true) with check (true);

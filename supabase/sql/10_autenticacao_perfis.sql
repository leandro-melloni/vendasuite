-- Autenticação e perfis de acesso. Execute no SQL Editor do Supabase.
do $$ begin
  create type public.perfil_acesso as enum ('administracao', 'escrita', 'leitura');
exception when duplicate_object then null;
end $$;

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  perfil public.perfil_acesso not null default 'leitura',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, perfil)
  values (new.id, coalesce(new.email, ''), 'leitura')
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists criar_perfil_apos_usuario on auth.users;
create trigger criar_perfil_apos_usuario after insert or update of email on auth.users
for each row execute function public.criar_perfil_novo_usuario();

insert into public.perfis (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do update set email = excluded.email;

create or replace function public.perfil_atual()
returns public.perfil_acesso language sql stable security definer set search_path = public as $$
  select perfil from public.perfis where id = auth.uid()
$$;

alter table public.perfis enable row level security;
drop policy if exists "perfil proprio ou lista admin" on public.perfis;
create policy "perfil proprio ou lista admin" on public.perfis for select to authenticated
using (id = auth.uid() or public.perfil_atual() = 'administracao');
drop policy if exists "admin atualiza perfis" on public.perfis;
create policy "admin atualiza perfis" on public.perfis for update to authenticated
using (public.perfil_atual() = 'administracao') with check (public.perfil_atual() = 'administracao');

-- Remove as policies abertas de desenvolvimento.
drop policy if exists "dev_all_vendedoras" on public.vendedoras;
drop policy if exists "dev_all_produtos" on public.produtos;
drop policy if exists "dev_all_mostruarios" on public.mostruarios;
drop policy if exists "dev_all_mostruario_itens" on public.mostruario_itens;
drop policy if exists "dev_all_acertos" on public.acertos;
drop policy if exists "dev_all_configuracoes_metais" on public.configuracoes_metais;

-- Todos os perfis autenticados podem consultar os dados.
drop policy if exists "autenticados leem vendedoras" on public.vendedoras;
drop policy if exists "autenticados leem produtos" on public.produtos;
drop policy if exists "autenticados leem mostruarios" on public.mostruarios;
drop policy if exists "autenticados leem itens" on public.mostruario_itens;
drop policy if exists "autenticados leem acertos" on public.acertos;
drop policy if exists "autenticados leem metais" on public.configuracoes_metais;
create policy "autenticados leem vendedoras" on public.vendedoras for select to authenticated using (true);
create policy "autenticados leem produtos" on public.produtos for select to authenticated using (true);
create policy "autenticados leem mostruarios" on public.mostruarios for select to authenticated using (true);
create policy "autenticados leem itens" on public.mostruario_itens for select to authenticated using (true);
create policy "autenticados leem acertos" on public.acertos for select to authenticated using (true);
create policy "autenticados leem metais" on public.configuracoes_metais for select to authenticated using (true);

-- Escrita cadastra vendedoras, produtos e mostruários. Administração possui acesso total.
drop policy if exists "escrita vendedoras" on public.vendedoras;
drop policy if exists "escrita produtos" on public.produtos;
drop policy if exists "escrita mostruarios" on public.mostruarios;
drop policy if exists "escrita itens" on public.mostruario_itens;
drop policy if exists "admin acertos" on public.acertos;
drop policy if exists "admin metais" on public.configuracoes_metais;
create policy "escrita vendedoras" on public.vendedoras for all to authenticated using (public.perfil_atual() in ('administracao','escrita')) with check (public.perfil_atual() in ('administracao','escrita'));
create policy "escrita produtos" on public.produtos for all to authenticated using (public.perfil_atual() in ('administracao','escrita')) with check (public.perfil_atual() in ('administracao','escrita'));
create policy "escrita mostruarios" on public.mostruarios for all to authenticated using (public.perfil_atual() in ('administracao','escrita')) with check (public.perfil_atual() in ('administracao','escrita'));
create policy "escrita itens" on public.mostruario_itens for all to authenticated using (public.perfil_atual() in ('administracao','escrita')) with check (public.perfil_atual() in ('administracao','escrita'));
create policy "admin acertos" on public.acertos for all to authenticated using (public.perfil_atual() = 'administracao') with check (public.perfil_atual() = 'administracao');
create policy "admin metais" on public.configuracoes_metais for all to authenticated using (public.perfil_atual() = 'administracao') with check (public.perfil_atual() = 'administracao');

-- Após executar, transforme manualmente o primeiro usuário em administrador:
-- update public.perfis set perfil = 'administracao' where email = 'seu-email@exemplo.com';

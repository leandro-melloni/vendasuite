-- Alinha autenticação, tenant e políticas do ambiente multi-tenant.
-- Execute no SQL Editor do Supabase depois da migração que criou public.tenants
-- e as colunas tenant_id. O script é idempotente.

begin;

create or replace function public.tenant_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
    from public.perfis
   where id = auth.uid()
$$;

create or replace function public.perfil_atual()
returns public.perfil_acesso
language sql
stable
security definer
set search_path = public
as $$
  select perfil
    from public.perfis
   where id = auth.uid()
$$;

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  begin
    v_tenant_id := nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    v_tenant_id := null;
  end;

  insert into public.perfis (id, email, perfil, tenant_id)
  values (new.id, coalesce(new.email, ''), 'leitura', v_tenant_id)
  on conflict (id) do update
    set email = excluded.email,
        tenant_id = coalesce(public.perfis.tenant_id, excluded.tenant_id),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists criar_perfil_apos_usuario on auth.users;
create trigger criar_perfil_apos_usuario
after insert or update of email on auth.users
for each row execute function public.criar_perfil_novo_usuario();

-- O próprio usuário lê seu perfil; administradores leem somente seu tenant.
drop policy if exists "perfil proprio ou lista admin" on public.perfis;
create policy "perfil proprio ou lista admin"
on public.perfis for select to authenticated
using (
  id = auth.uid()
  or (
    public.perfil_atual() = 'administracao'
    and tenant_id = public.tenant_atual_id()
  )
);

drop policy if exists "admin atualiza perfis" on public.perfis;
create policy "admin atualiza perfis"
on public.perfis for update to authenticated
using (
  public.perfil_atual() = 'administracao'
  and tenant_id = public.tenant_atual_id()
)
with check (
  public.perfil_atual() = 'administracao'
  and tenant_id = public.tenant_atual_id()
);

-- Permite que todo usuário autenticado consulte apenas o tenant ao qual pertence.
alter table public.tenants enable row level security;
drop policy if exists "usuario consulta tenant atual" on public.tenants;
create policy "usuario consulta tenant atual"
on public.tenants for select to authenticated
using (id = public.tenant_atual_id());

-- Recria as políticas operacionais com isolamento explícito por tenant.
drop policy if exists "dev_all_vendedoras" on public.vendedoras;
drop policy if exists "dev_all_produtos" on public.produtos;
drop policy if exists "dev_all_mostruarios" on public.mostruarios;
drop policy if exists "dev_all_mostruario_itens" on public.mostruario_itens;
drop policy if exists "dev_all_acertos" on public.acertos;
drop policy if exists "dev_all_configuracoes_metais" on public.configuracoes_metais;
drop policy if exists "autenticados leem vendedoras" on public.vendedoras;
drop policy if exists "autenticados leem produtos" on public.produtos;
drop policy if exists "autenticados leem mostruarios" on public.mostruarios;
drop policy if exists "autenticados leem itens" on public.mostruario_itens;
drop policy if exists "autenticados leem acertos" on public.acertos;
drop policy if exists "autenticados leem metais" on public.configuracoes_metais;
drop policy if exists "escrita vendedoras" on public.vendedoras;
drop policy if exists "escrita produtos" on public.produtos;
drop policy if exists "escrita mostruarios" on public.mostruarios;
drop policy if exists "escrita itens" on public.mostruario_itens;
drop policy if exists "admin acertos" on public.acertos;
drop policy if exists "admin metais" on public.configuracoes_metais;

do $$
declare
  v_tabela text;
  v_politica record;
begin
  foreach v_tabela in array array[
    'vendedoras', 'produtos', 'mostruarios', 'mostruario_itens',
    'acertos', 'configuracoes_metais'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_tabela);
    for v_politica in
      select policyname
        from pg_policies
       where schemaname = 'public'
         and tablename = v_tabela
    loop
      execute format('drop policy if exists %I on public.%I', v_politica.policyname, v_tabela);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id = public.tenant_atual_id())',
      'tenant leitura', v_tabela
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (
         tenant_id = public.tenant_atual_id()
         and public.perfil_atual() in (''administracao'', ''escrita'')
       ) with check (
         tenant_id = public.tenant_atual_id()
         and public.perfil_atual() in (''administracao'', ''escrita'')
       )',
      'tenant escrita', v_tabela
    );
  end loop;
end
$$;

commit;

-- Diagnóstico final do usuário superadmin e do tenant principal.
select
  p.email,
  p.perfil,
  p.tenant_id,
  t.slug as tenant
from public.perfis p
join public.tenants t on t.id = p.tenant_id
where lower(p.email) = 'lmvalle01@hotmail.com';

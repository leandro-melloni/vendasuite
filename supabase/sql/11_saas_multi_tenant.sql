-- Migração SaaS multi-tenant.
-- Pré-requisito: executar os scripts 01 a 10. Faça backup e valide em homologação.
begin;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  nome text not null,
  dominio_customizado text unique,
  logo_url text,
  cor_primaria text not null default '#7a4f2b',
  cor_secundaria text not null default '#d7b98e',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.tenants (slug, nome)
values ('wn-bijouterias', 'WN Bijouterias')
on conflict (slug) do nothing;

alter table public.perfis add column if not exists tenant_id uuid references public.tenants(id);
alter table public.vendedoras add column if not exists tenant_id uuid references public.tenants(id);
alter table public.produtos add column if not exists tenant_id uuid references public.tenants(id);
alter table public.mostruarios add column if not exists tenant_id uuid references public.tenants(id);
alter table public.mostruario_itens add column if not exists tenant_id uuid references public.tenants(id);
alter table public.acertos add column if not exists tenant_id uuid references public.tenants(id);
alter table public.configuracoes_metais add column if not exists tenant_id uuid references public.tenants(id);

-- Todos os dados anteriores pertencem à loja original.
update public.perfis set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.vendedoras set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.produtos set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.mostruarios set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.mostruario_itens mi set tenant_id = m.tenant_id from public.mostruarios m where mi.mostruario_id = m.id and mi.tenant_id is null;
update public.mostruario_itens set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.acertos a set tenant_id = m.tenant_id from public.mostruarios m where a.mostruario_id = m.id and a.tenant_id is null;
update public.acertos set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;
update public.configuracoes_metais set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias') where tenant_id is null;

alter table public.perfis alter column tenant_id set not null;
alter table public.vendedoras alter column tenant_id set not null;
alter table public.produtos alter column tenant_id set not null;
alter table public.mostruarios alter column tenant_id set not null;
alter table public.mostruario_itens alter column tenant_id set not null;
alter table public.acertos alter column tenant_id set not null;
alter table public.configuracoes_metais alter column tenant_id set not null;

create or replace function public.tenant_atual()
returns uuid language sql stable security definer set search_path = public
as $$ select tenant_id from public.perfis where id = auth.uid() $$;

create or replace function public.eh_superadmin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.plataforma_admins where user_id = auth.uid()) $$;

create or replace function public.tenant_ativo(tenant uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.tenants where id = tenant and ativo) $$;

revoke all on function public.tenant_atual() from public;
revoke all on function public.eh_superadmin() from public;
revoke all on function public.tenant_ativo(uuid) from public;
grant execute on function public.tenant_atual() to authenticated, service_role;
grant execute on function public.eh_superadmin() to authenticated, service_role;
grant execute on function public.tenant_ativo(uuid) to authenticated, service_role;

alter table public.vendedoras alter column tenant_id set default public.tenant_atual();
alter table public.produtos alter column tenant_id set default public.tenant_atual();
alter table public.mostruarios alter column tenant_id set default public.tenant_atual();
alter table public.mostruario_itens alter column tenant_id set default public.tenant_atual();
alter table public.acertos alter column tenant_id set default public.tenant_atual();
alter table public.configuracoes_metais alter column tenant_id set default public.tenant_atual();

alter table public.vendedoras drop constraint if exists vendedoras_codigo_key;
alter table public.produtos drop constraint if exists produtos_codigo_key;
alter table public.mostruarios drop constraint if exists mostruarios_numero_key;
alter table public.configuracoes_metais drop constraint if exists configuracoes_metais_pkey;

create unique index if not exists vendedoras_tenant_codigo_key on public.vendedoras(tenant_id, codigo);
create unique index if not exists produtos_tenant_codigo_key on public.produtos(tenant_id, codigo);
create unique index if not exists mostruarios_tenant_numero_key on public.mostruarios(tenant_id, numero);
alter table public.configuracoes_metais add constraint configuracoes_metais_pkey primary key (tenant_id, id);
create unique index if not exists vendedoras_tenant_id_key on public.vendedoras(tenant_id, id);
create unique index if not exists produtos_tenant_id_key on public.produtos(tenant_id, id);
create unique index if not exists mostruarios_tenant_id_key on public.mostruarios(tenant_id, id);

-- Relações compostas impedem referências cruzadas mesmo em operações privilegiadas.
alter table public.mostruarios drop constraint if exists mostruarios_vendedora_id_fkey;
alter table public.mostruarios add constraint mostruarios_tenant_vendedora_fkey
  foreign key (tenant_id, vendedora_id) references public.vendedoras(tenant_id, id) on delete set null (vendedora_id);
alter table public.mostruario_itens drop constraint if exists mostruario_itens_mostruario_id_fkey;
alter table public.mostruario_itens drop constraint if exists mostruario_itens_produto_id_fkey;
alter table public.mostruario_itens add constraint itens_tenant_mostruario_fkey
  foreign key (tenant_id, mostruario_id) references public.mostruarios(tenant_id, id) on delete cascade;
alter table public.mostruario_itens add constraint itens_tenant_produto_fkey
  foreign key (tenant_id, produto_id) references public.produtos(tenant_id, id) on delete set null (produto_id);
alter table public.acertos drop constraint if exists acertos_mostruario_id_fkey;
alter table public.acertos drop constraint if exists acertos_vendedora_id_fkey;
alter table public.acertos add constraint acertos_tenant_mostruario_fkey
  foreign key (tenant_id, mostruario_id) references public.mostruarios(tenant_id, id) on delete set null (mostruario_id);
alter table public.acertos add constraint acertos_tenant_vendedora_fkey
  foreign key (tenant_id, vendedora_id) references public.vendedoras(tenant_id, id) on delete set null (vendedora_id);

-- O primeiro administrador existente passa a administrar a plataforma.
insert into public.plataforma_admins (user_id)
select id from public.perfis where perfil = 'administracao' order by created_at limit 1
on conflict (user_id) do nothing;

-- Perfis são provisionados exclusivamente pela Edge Function admin-users.
-- Não confiar em raw_user_meta_data evita que um cadastro público escolha tenant ou perfil.
drop trigger if exists criar_perfil_apos_usuario on auth.users;

create or replace function public.criar_configuracao_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.configuracoes_metais (tenant_id, id, valor_ouro, valor_prata)
  values (new.id, 1, 0, 0) on conflict (tenant_id, id) do nothing;
  return new;
end; $$;
drop trigger if exists criar_configuracao_apos_tenant on public.tenants;
create trigger criar_configuracao_apos_tenant after insert on public.tenants
for each row execute function public.criar_configuracao_tenant();

alter table public.tenants enable row level security;
alter table public.plataforma_admins enable row level security;
revoke all on public.tenants, public.plataforma_admins from anon;
grant select, insert, update, delete on public.tenants to authenticated;
grant select on public.plataforma_admins to authenticated;

-- Remove policies antigas e recria isolamento por tenant.
do $$
declare tabela regclass; politica record; nome_tabela text;
begin
  foreach tabela in array array[
    'public.perfis'::regclass, 'public.vendedoras'::regclass, 'public.produtos'::regclass,
    'public.mostruarios'::regclass, 'public.mostruario_itens'::regclass,
    'public.acertos'::regclass, 'public.configuracoes_metais'::regclass
  ] loop
    select relname into nome_tabela from pg_class where oid = tabela;
    for politica in select policyname from pg_policies where schemaname = 'public' and tablename = nome_tabela
    loop execute format('drop policy if exists %I on %s', politica.policyname, tabela); end loop;
  end loop;
end $$;

create policy "membro le proprio perfil" on public.perfis for select to authenticated
using (id = auth.uid() or (tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao') or public.eh_superadmin());
create policy "admin atualiza perfil do tenant" on public.perfis for update to authenticated
using ((tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao') or public.eh_superadmin())
with check ((tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao') or public.eh_superadmin());

create policy "membro le tenant" on public.tenants for select to authenticated
using (id = public.tenant_atual() or public.eh_superadmin());
create policy "superadmin cria tenant" on public.tenants for insert to authenticated with check (public.eh_superadmin());
create policy "superadmin atualiza tenant" on public.tenants for update to authenticated using (public.eh_superadmin()) with check (public.eh_superadmin());
create policy "superadmin remove tenant" on public.tenants for delete to authenticated using (public.eh_superadmin());
create policy "superadmin ve proprio acesso" on public.plataforma_admins for select to authenticated
using (user_id = auth.uid());

create policy "tenant le vendedoras" on public.vendedoras for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve vendedoras" on public.vendedoras for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita')) with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));
create policy "tenant le produtos" on public.produtos for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve produtos" on public.produtos for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita')) with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));
create policy "tenant le mostruarios" on public.mostruarios for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve mostruarios" on public.mostruarios for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita')) with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));
create policy "tenant le itens" on public.mostruario_itens for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve itens" on public.mostruario_itens for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita')) with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));
create policy "tenant le acertos" on public.acertos for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "admin gerencia acertos" on public.acertos for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao') with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao');
create policy "tenant le metais" on public.configuracoes_metais for select to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "admin gerencia metais" on public.configuracoes_metais for all to authenticated using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao') with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao');

-- Uploads são segregados pelo primeiro diretório: <tenant_id>/produtos/arquivo.
drop policy if exists "dev_all_storage_produtos" on storage.objects;
drop policy if exists "tenant insere imagens" on storage.objects;
drop policy if exists "tenant altera imagens" on storage.objects;
drop policy if exists "tenant exclui imagens" on storage.objects;
create policy "tenant insere imagens" on storage.objects for insert to authenticated
with check (bucket_id = 'produtos' and (storage.foldername(name))[1] = public.tenant_atual()::text);
create policy "tenant altera imagens" on storage.objects for update to authenticated
using (bucket_id = 'produtos' and (storage.foldername(name))[1] = public.tenant_atual()::text)
with check (bucket_id = 'produtos' and (storage.foldername(name))[1] = public.tenant_atual()::text);
create policy "tenant exclui imagens" on storage.objects for delete to authenticated
using (bucket_id = 'produtos' and (storage.foldername(name))[1] = public.tenant_atual()::text);

commit;

-- Se nenhum administrador existia durante a migração, promova manualmente:
-- insert into public.plataforma_admins(user_id)
-- select id from auth.users where email = 'seu-email@exemplo.com';

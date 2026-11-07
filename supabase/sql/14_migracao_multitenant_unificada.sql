-- Migração unificada do banco legado (scripts 01 a 10) para o modelo SaaS.
--
-- ANTES DE EXECUTAR:
-- 1. Faça backup do banco.
-- 2. Substitua o e-mail abaixo pelo usuário que será o superadmin da VendaSuite.
-- 3. Execute este arquivo inteiro uma única vez no SQL Editor do Supabase.
--
-- Não execute os scripts 11, 12 e 13 separadamente quando usar este arquivo.

begin;

create temporary table _config_migracao_multitenant (
  superadmin_email text not null
) on commit drop;

insert into _config_migracao_multitenant (superadmin_email)
values ('SUBSTITUA-PELO-EMAIL-DO-SUPERADMIN');

-- Interrompe antes de qualquer mudança persistente se a configuração estiver errada.
do $$
declare
  v_email text;
  v_quantidade integer;
begin
  select lower(trim(superadmin_email)) into v_email
  from _config_migracao_multitenant;

  if v_email = '' or v_email not like '%@%' or v_email like 'substitua-%' then
    raise exception 'Informe o e-mail real do superadmin em _config_migracao_multitenant.';
  end if;

  select count(*) into v_quantidade
  from auth.users
  where lower(email) = v_email;

  if v_quantidade <> 1 then
    raise exception 'O e-mail % precisa identificar exatamente um usuário em auth.users; encontrados: %.', v_email, v_quantidade;
  end if;

  if to_regclass('public.perfis') is null then
    raise exception 'A tabela public.perfis não existe. Execute os scripts 01 a 10 antes desta migração.';
  end if;
end $$;

-- Evita alterações concorrentes enquanto os registros recebem tenant_id.
lock table
  public.perfis,
  public.vendedoras,
  public.produtos,
  public.mostruarios,
  public.mostruario_itens,
  public.acertos,
  public.configuracoes_metais
in share row exclusive mode;

create table if not exists public.migracoes_aplicadas (
  nome text primary key,
  aplicada_em timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from public.migracoes_aplicadas
    where nome = '14_migracao_multitenant_unificada'
  ) then
    raise exception 'A migração multi-tenant unificada já foi aplicada neste banco.';
  end if;
end $$;

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

insert into public.tenants (slug, nome, ativo)
values
  ('vendasuite', 'VendaSuite', true),
  ('wn-bijouterias', 'WN Bijouterias', true)
on conflict (slug) do update
set nome = excluded.nome,
    ativo = true,
    updated_at = now();

alter table public.perfis add column if not exists tenant_id uuid references public.tenants(id);
alter table public.vendedoras add column if not exists tenant_id uuid references public.tenants(id);
alter table public.produtos add column if not exists tenant_id uuid references public.tenants(id);
alter table public.mostruarios add column if not exists tenant_id uuid references public.tenants(id);
alter table public.mostruario_itens add column if not exists tenant_id uuid references public.tenants(id);
alter table public.acertos add column if not exists tenant_id uuid references public.tenants(id);
alter table public.configuracoes_metais add column if not exists tenant_id uuid references public.tenants(id);

-- Garante que todo usuário preexistente possua perfil. Usuários sem perfil entram
-- como leitura; perfis já existentes mantêm exatamente a permissão atual.
insert into public.perfis (id, email, perfil, tenant_id)
select
  u.id,
  coalesce(u.email, ''),
  'leitura'::public.perfil_acesso,
  wn.id
from auth.users u
cross join public.tenants wn
where wn.slug = 'wn-bijouterias'
on conflict (id) do update
set email = excluded.email;

-- Todos os usuários legados começam na WN sem alteração de perfil.
update public.perfis p
set tenant_id = wn.id,
    updated_at = now()
from public.tenants wn
where wn.slug = 'wn-bijouterias';

-- Apenas o usuário explicitamente escolhido vai para a VendaSuite e vira superadmin.
update public.perfis p
set tenant_id = vs.id,
    perfil = 'administracao'::public.perfil_acesso,
    updated_at = now()
from auth.users u
cross join public.tenants vs
cross join _config_migracao_multitenant cfg
where p.id = u.id
  and vs.slug = 'vendasuite'
  and lower(u.email) = lower(trim(cfg.superadmin_email));

delete from public.plataforma_admins;
insert into public.plataforma_admins (user_id)
select u.id
from auth.users u
cross join _config_migracao_multitenant cfg
where lower(u.email) = lower(trim(cfg.superadmin_email));

-- Todo dado operacional legado pertence exclusivamente à WN Bijouterias.
update public.vendedoras set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');
update public.produtos set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');
update public.mostruarios set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');
update public.mostruario_itens set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');
update public.acertos set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');
update public.configuracoes_metais set tenant_id = (select id from public.tenants where slug = 'wn-bijouterias');

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
revoke all on function public.perfil_atual() from public;
grant execute on function public.tenant_atual() to authenticated, service_role;
grant execute on function public.eh_superadmin() to authenticated, service_role;
grant execute on function public.tenant_ativo(uuid) to authenticated, service_role;
grant execute on function public.perfil_atual() to authenticated, service_role;

alter table public.vendedoras alter column tenant_id set default public.tenant_atual();
alter table public.produtos alter column tenant_id set default public.tenant_atual();
alter table public.mostruarios alter column tenant_id set default public.tenant_atual();
alter table public.mostruario_itens alter column tenant_id set default public.tenant_atual();
alter table public.acertos alter column tenant_id set default public.tenant_atual();
alter table public.configuracoes_metais alter column tenant_id set default public.tenant_atual();

alter table public.vendedoras drop constraint if exists vendedoras_codigo_key;
alter table public.produtos drop constraint if exists produtos_codigo_key;
alter table public.mostruarios drop constraint if exists mostruarios_numero_key;
alter table public.mostruarios drop constraint if exists mostruarios_numero_unique;
drop index if exists public.mostruarios_tenant_numero_key;

create unique index if not exists vendedoras_tenant_codigo_key on public.vendedoras(tenant_id, codigo);
create unique index if not exists produtos_tenant_codigo_key on public.produtos(tenant_id, codigo);
-- O número do mostruário permanece reutilizável, conforme o fluxo do script 07.
create index if not exists mostruarios_tenant_numero_idx on public.mostruarios(tenant_id, numero);
create index if not exists perfis_tenant_id_idx on public.perfis(tenant_id);
create index if not exists itens_tenant_id_idx on public.mostruario_itens(tenant_id);
create index if not exists acertos_tenant_id_idx on public.acertos(tenant_id);
create unique index if not exists vendedoras_tenant_id_key on public.vendedoras(tenant_id, id);
create unique index if not exists produtos_tenant_id_key on public.produtos(tenant_id, id);
create unique index if not exists mostruarios_tenant_id_key on public.mostruarios(tenant_id, id);

alter table public.configuracoes_metais drop constraint if exists configuracoes_metais_pkey;
alter table public.configuracoes_metais
  add constraint configuracoes_metais_pkey primary key (tenant_id, id);

-- Relacionamentos compostos impedem referências entre tenants inclusive em
-- operações feitas por papéis privilegiados.
alter table public.mostruarios drop constraint if exists mostruarios_vendedora_id_fkey;
alter table public.mostruarios drop constraint if exists mostruarios_tenant_vendedora_fkey;
alter table public.mostruarios add constraint mostruarios_tenant_vendedora_fkey
  foreign key (tenant_id, vendedora_id)
  references public.vendedoras(tenant_id, id)
  on delete set null (vendedora_id);

alter table public.mostruario_itens drop constraint if exists mostruario_itens_mostruario_id_fkey;
alter table public.mostruario_itens drop constraint if exists mostruario_itens_produto_id_fkey;
alter table public.mostruario_itens drop constraint if exists itens_tenant_mostruario_fkey;
alter table public.mostruario_itens drop constraint if exists itens_tenant_produto_fkey;
alter table public.mostruario_itens add constraint itens_tenant_mostruario_fkey
  foreign key (tenant_id, mostruario_id)
  references public.mostruarios(tenant_id, id)
  on delete cascade;
alter table public.mostruario_itens add constraint itens_tenant_produto_fkey
  foreign key (tenant_id, produto_id)
  references public.produtos(tenant_id, id)
  on delete set null (produto_id);

alter table public.acertos drop constraint if exists acertos_mostruario_id_fkey;
alter table public.acertos drop constraint if exists acertos_vendedora_id_fkey;
alter table public.acertos drop constraint if exists acertos_tenant_mostruario_fkey;
alter table public.acertos drop constraint if exists acertos_tenant_vendedora_fkey;
alter table public.acertos add constraint acertos_tenant_mostruario_fkey
  foreign key (tenant_id, mostruario_id)
  references public.mostruarios(tenant_id, id)
  on delete set null (mostruario_id);
alter table public.acertos add constraint acertos_tenant_vendedora_fkey
  foreign key (tenant_id, vendedora_id)
  references public.vendedoras(tenant_id, id)
  on delete set null (vendedora_id);

create or replace function public.criar_configuracao_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.configuracoes_metais (tenant_id, id, valor_ouro, valor_prata)
  values (new.id, 1, 0, 0)
  on conflict (tenant_id, id) do nothing;
  return new;
end; $$;

drop trigger if exists criar_configuracao_apos_tenant on public.tenants;
create trigger criar_configuracao_apos_tenant
after insert on public.tenants
for each row execute function public.criar_configuracao_tenant();

insert into public.configuracoes_metais (tenant_id, id, valor_ouro, valor_prata)
select id, 1, 0, 0 from public.tenants
on conflict (tenant_id, id) do nothing;

-- Usuários futuros são provisionados exclusivamente pela Edge Function.
drop trigger if exists criar_perfil_apos_usuario on auth.users;

alter table public.perfis enable row level security;
alter table public.tenants enable row level security;
alter table public.plataforma_admins enable row level security;
alter table public.vendedoras enable row level security;
alter table public.produtos enable row level security;
alter table public.mostruarios enable row level security;
alter table public.mostruario_itens enable row level security;
alter table public.acertos enable row level security;
alter table public.configuracoes_metais enable row level security;

-- Remove todas as policies anteriores das tabelas migradas.
do $$
declare
  tabela regclass;
  politica record;
  nome_tabela text;
begin
  foreach tabela in array array[
    'public.perfis'::regclass,
    'public.tenants'::regclass,
    'public.plataforma_admins'::regclass,
    'public.vendedoras'::regclass,
    'public.produtos'::regclass,
    'public.mostruarios'::regclass,
    'public.mostruario_itens'::regclass,
    'public.acertos'::regclass,
    'public.configuracoes_metais'::regclass
  ] loop
    select relname into nome_tabela from pg_class where oid = tabela;
    for politica in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = nome_tabela
    loop
      execute format('drop policy if exists %I on %s', politica.policyname, tabela);
    end loop;
  end loop;
end $$;

create policy "membro le proprio perfil"
on public.perfis for select to authenticated
using (
  id = auth.uid()
  or (tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao')
  or public.eh_superadmin()
);

create policy "admin atualiza perfil do tenant"
on public.perfis for update to authenticated
using (
  (tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao')
  or public.eh_superadmin()
)
with check (
  (tenant_id = public.tenant_atual() and public.perfil_atual() = 'administracao')
  or public.eh_superadmin()
);

create policy "membro le tenant"
on public.tenants for select to authenticated
using (id = public.tenant_atual() or public.eh_superadmin());
create policy "superadmin cria tenant"
on public.tenants for insert to authenticated
with check (public.eh_superadmin());
create policy "superadmin atualiza tenant"
on public.tenants for update to authenticated
using (public.eh_superadmin()) with check (public.eh_superadmin());
create policy "superadmin remove tenant"
on public.tenants for delete to authenticated
using (public.eh_superadmin());
create policy "superadmin ve proprio acesso"
on public.plataforma_admins for select to authenticated
using (user_id = auth.uid());

create policy "tenant le vendedoras" on public.vendedoras for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve vendedoras" on public.vendedoras for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'))
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));

create policy "tenant le produtos" on public.produtos for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve produtos" on public.produtos for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'))
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));

create policy "tenant le mostruarios" on public.mostruarios for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve mostruarios" on public.mostruarios for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'))
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));

create policy "tenant le itens" on public.mostruario_itens for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "tenant escreve itens" on public.mostruario_itens for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'))
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() in ('administracao','escrita'));

create policy "tenant le acertos" on public.acertos for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "admin gerencia acertos" on public.acertos for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao')
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao');

create policy "tenant le metais" on public.configuracoes_metais for select to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id));
create policy "admin gerencia metais" on public.configuracoes_metais for all to authenticated
using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao')
with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao');

-- Privilégios SQL: RLS continua responsável pelo isolamento de linhas.
revoke all on table
  public.tenants,
  public.plataforma_admins,
  public.perfis,
  public.vendedoras,
  public.produtos,
  public.mostruarios,
  public.mostruario_itens,
  public.acertos,
  public.configuracoes_metais
from anon;

grant usage on schema public to authenticated, service_role;
grant select, update on table public.perfis to authenticated;
grant select, insert, update, delete on table public.tenants to authenticated;
grant select on table public.plataforma_admins to authenticated;
grant select, insert, update, delete on table
  public.vendedoras,
  public.produtos,
  public.mostruarios,
  public.mostruario_itens,
  public.acertos,
  public.configuracoes_metais
to authenticated;

grant select, insert, update, delete on table
  public.tenants,
  public.plataforma_admins,
  public.perfis,
  public.vendedoras,
  public.produtos,
  public.mostruarios,
  public.mostruario_itens,
  public.acertos,
  public.configuracoes_metais
to service_role;

-- Storage: objetos novos ficam em <tenant_id>/produtos/<arquivo>.
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

-- Validações finais dentro da transação. Qualquer divergência faz rollback total.
do $$
declare
  v_superadmin uuid;
  v_vendasuite uuid;
  v_wn uuid;
  v_incorretos bigint;
begin
  select id into v_vendasuite from public.tenants where slug = 'vendasuite';
  select id into v_wn from public.tenants where slug = 'wn-bijouterias';
  select pa.user_id into v_superadmin from public.plataforma_admins pa;

  if v_superadmin is null then
    raise exception 'Validação falhou: nenhum superadmin foi criado.';
  end if;

  if not exists (
    select 1 from public.perfis
    where id = v_superadmin and tenant_id = v_vendasuite and perfil = 'administracao'
  ) then
    raise exception 'Validação falhou: o superadmin não está na VendaSuite como administração.';
  end if;

  select count(*) into v_incorretos
  from public.perfis
  where id <> v_superadmin and tenant_id <> v_wn;
  if v_incorretos > 0 then
    raise exception 'Validação falhou: % perfis legados não ficaram na WN.', v_incorretos;
  end if;

  select
    (select count(*) from public.vendedoras where tenant_id <> v_wn)
    + (select count(*) from public.produtos where tenant_id <> v_wn)
    + (select count(*) from public.mostruarios where tenant_id <> v_wn)
    + (select count(*) from public.mostruario_itens where tenant_id <> v_wn)
    + (select count(*) from public.acertos where tenant_id <> v_wn)
  into v_incorretos;
  if v_incorretos > 0 then
    raise exception 'Validação falhou: % registros operacionais não ficaram na WN.', v_incorretos;
  end if;
end $$;

insert into public.migracoes_aplicadas (nome)
values ('14_migracao_multitenant_unificada');

commit;

notify pgrst, 'reload schema';

-- Relatório pós-migração.
select
  u.email,
  p.perfil,
  t.nome as tenant,
  (pa.user_id is not null) as superadmin
from public.perfis p
join auth.users u on u.id = p.id
join public.tenants t on t.id = p.tenant_id
left join public.plataforma_admins pa on pa.user_id = p.id
order by t.slug, u.email;

select
  t.nome,
  (select count(*) from public.perfis p where p.tenant_id = t.id) as usuarios,
  (select count(*) from public.produtos p where p.tenant_id = t.id) as produtos,
  (select count(*) from public.vendedoras v where v.tenant_id = t.id) as vendedoras,
  (select count(*) from public.mostruarios m where m.tenant_id = t.id) as mostruarios,
  (select count(*) from public.acertos a where a.tenant_id = t.id) as acertos
from public.tenants t
order by t.slug;

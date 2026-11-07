-- Separa o tenant administrativo da plataforma dos tenants clientes.
-- Execute depois de 11_saas_multi_tenant.sql.
begin;

insert into public.tenants (slug, nome, ativo)
values ('vendasuite', 'VendaSuite', true)
on conflict (slug) do update
set nome = excluded.nome,
    ativo = true,
    updated_at = now();

-- Todo superadmin precisa de um perfil porque o front-end carrega o tenant
-- atual antes de liberar o portal da plataforma.
insert into public.perfis (id, email, perfil, tenant_id, updated_at)
select
  pa.user_id,
  coalesce(u.email, ''),
  'administracao'::public.perfil_acesso,
  t.id,
  now()
from public.plataforma_admins pa
join auth.users u on u.id = pa.user_id
cross join public.tenants t
where t.slug = 'vendasuite'
on conflict (id) do update
set email = excluded.email,
    perfil = excluded.perfil,
    tenant_id = excluded.tenant_id,
    updated_at = excluded.updated_at;

-- Privilégios de tabela necessários antes da avaliação das policies RLS.
grant usage on schema public to authenticated;
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

grant usage on schema public to service_role;
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

commit;

notify pgrst, 'reload schema';

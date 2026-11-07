-- Auditoria de usuários, tenants e perfis de acesso.
-- Este script é somente leitura e não altera nenhum dado.
-- Execute-o no SQL Editor do Supabase.

select
  u.id as usuario_id,
  u.email,
  case
    when p.id is null then 'SEM PERFIL'
    else p.perfil::text
  end as perfil,
  p.tenant_id,
  case
    when p.id is null then 'SEM PERFIL'
    when p.tenant_id is null then 'SEM TENANT'
    when t.id is null then 'TENANT NÃO ENCONTRADO'
    else t.slug
  end as tenant,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.created_at as usuario_criado_em,
  p.updated_at as perfil_atualizado_em
from auth.users u
left join public.perfis p
  on p.id = u.id
left join public.tenants t
  on t.id = p.tenant_id
order by
  case when p.id is null or p.tenant_id is null or t.id is null then 0 else 1 end,
  t.slug nulls first,
  p.perfil nulls first,
  u.email;


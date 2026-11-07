-- Endurecimento de acesso para o ambiente SaaS multi-tenant.
--
-- O Supabase gerenciado já criptografa o projeto em repouso. Este script não
-- cria chaves dentro do próprio banco nem usa pgsodium (em descontinuação).
-- Ele garante que dados operacionais só sejam expostos a sessões autenticadas,
-- sempre sujeitos às políticas RLS definidas na migração 13.

begin;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'tenants', 'perfis', 'vendedoras', 'produtos', 'mostruarios',
    'mostruario_itens', 'acertos', 'configuracoes_metais'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('revoke all on table public.%I from anon', v_tabela);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', v_tabela);
  end loop;
end
$$;

revoke all on function public.tenant_atual_id() from public, anon;
revoke all on function public.perfil_atual() from public, anon;
revoke all on function public.tenant_ativo() from public, anon;
revoke all on function public.eh_superadmin() from public, anon;

grant execute on function public.tenant_atual_id() to authenticated;
grant execute on function public.perfil_atual() to authenticated;
grant execute on function public.tenant_ativo() to authenticated;
grant execute on function public.eh_superadmin() to authenticated;

-- Auth e Storage possuem esquemas e controles próprios do Supabase.
-- Nunca conceda service_role ao frontend e nunca grave chaves no public schema.

commit;

-- Auditoria: nenhuma tabela abaixo deve conceder privilégios ao papel anon.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in (
    'tenants', 'perfis', 'vendedoras', 'produtos', 'mostruarios',
    'mostruario_itens', 'acertos', 'configuracoes_metais'
  )
order by table_name, privilege_type;

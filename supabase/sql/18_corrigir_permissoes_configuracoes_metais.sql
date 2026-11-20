-- Corrige permissões da tabela de valores de metais.
-- Execute no SQL Editor do Supabase usando um usuário administrador.
-- O acesso continua restrito a usuários autenticados; não conceda acesso ao anon.

grant usage on schema public to authenticated;
grant select, update on table public.configuracoes_metais to authenticated;

alter table public.configuracoes_metais enable row level security;

drop policy if exists "autenticados leem metais" on public.configuracoes_metais;
drop policy if exists "admin metais" on public.configuracoes_metais;
drop policy if exists "tenant le metais" on public.configuracoes_metais;
drop policy if exists "admin gerencia metais" on public.configuracoes_metais;

-- Compatível com a tabela legada sem tenant_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'configuracoes_metais'
      and column_name = 'tenant_id'
  ) then
    execute $policy$
      create policy "tenant le metais" on public.configuracoes_metais
      for select to authenticated
      using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id))
    $policy$;
    execute $policy$
      create policy "admin gerencia metais" on public.configuracoes_metais
      for update to authenticated
      using (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao')
      with check (tenant_id = public.tenant_atual() and public.tenant_ativo(tenant_id) and public.perfil_atual() = 'administracao')
    $policy$;
  else
    execute $policy$
      create policy "autenticados leem metais" on public.configuracoes_metais
      for select to authenticated using (true)
    $policy$;
    execute $policy$
      create policy "admin metais" on public.configuracoes_metais
      for update to authenticated
      using (public.perfil_atual() = 'administracao')
      with check (public.perfil_atual() = 'administracao')
    $policy$;
  end if;
end $$;

notify pgrst, 'reload schema';

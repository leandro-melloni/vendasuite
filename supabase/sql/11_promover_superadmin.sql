-- Promove um usuário existente do Supabase Auth ao nível máximo de acesso.
--
-- No modelo atual da aplicação, o papel equivalente a superadmin chama-se
-- "administracao".

do $$
declare
  v_email text := lower(trim('lmvalle01@hotmail.com'));
  v_user_id uuid;
  v_tenant_id uuid;
begin
  if v_email = '' then
    raise exception
      'Informe o e-mail real do usuário na variável v_email antes de executar.';
  end if;

  select id
    into v_user_id
    from auth.users
   where lower(email) = v_email;

  if v_user_id is null then
    raise exception
      'Usuário com o e-mail % não foi encontrado em Authentication > Users.',
      v_email;
  end if;

  select id
    into v_tenant_id
    from public.tenants
   where lower(slug) = 'vendasuite';

  if v_tenant_id is null then
    raise exception
      'Tenant principal com slug vendasuite não foi encontrado em public.tenants.';
  end if;

  insert into public.perfis (id, email, perfil, tenant_id, updated_at)
  values (v_user_id, v_email, 'administracao', v_tenant_id, now())
  on conflict (id) do update
    set email = excluded.email,
        perfil = excluded.perfil,
        tenant_id = excluded.tenant_id,
        updated_at = excluded.updated_at;

  raise notice
    'Usuário % transferido para o tenant vendasuite e promovido a superadmin (perfil administracao).',
    v_email;
end
$$;

-- Confirmação: confira o e-mail promovido entre os administradores abaixo.
select p.id, p.email, p.perfil, p.tenant_id, t.slug as tenant, p.updated_at
  from public.perfis p
  join public.tenants t on t.id = p.tenant_id
 where lower(p.email) = 'lmvalle01@hotmail.com'
 order by p.email;

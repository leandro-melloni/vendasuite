-- A Edge Function admin-users usa service_role para provisionar usuários.
-- O bypass de RLS não substitui os privilégios SQL concedidos às tabelas.
begin;

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


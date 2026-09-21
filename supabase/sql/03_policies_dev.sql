alter table public.vendedoras enable row level security;
alter table public.produtos enable row level security;
alter table public.mostruarios enable row level security;
alter table public.mostruario_itens enable row level security;

drop policy if exists "dev_all_vendedoras" on public.vendedoras;
create policy "dev_all_vendedoras" on public.vendedoras for all using (true) with check (true);
drop policy if exists "dev_all_produtos" on public.produtos;
create policy "dev_all_produtos" on public.produtos for all using (true) with check (true);
drop policy if exists "dev_all_mostruarios" on public.mostruarios;
create policy "dev_all_mostruarios" on public.mostruarios for all using (true) with check (true);
drop policy if exists "dev_all_mostruario_itens" on public.mostruario_itens;
create policy "dev_all_mostruario_itens" on public.mostruario_itens for all using (true) with check (true);

drop policy if exists "dev_all_storage_produtos" on storage.objects;
create policy "dev_all_storage_produtos" on storage.objects for all using (bucket_id = 'produtos') with check (bucket_id = 'produtos');

alter table public.configuracoes_metais enable row level security;
drop policy if exists "dev_all_configuracoes_metais" on public.configuracoes_metais;
create policy "dev_all_configuracoes_metais" on public.configuracoes_metais for all using (true) with check (true);

-- Execute no SQL Editor do Supabase antes de publicar a interface da lixeira.
-- O registro e todos os seus itens/pagamentos permanecem na tabela acertos.
alter table public.acertos
  add column if not exists excluido_em timestamptz;

create index if not exists acertos_ativos_tenant_data_idx
  on public.acertos (tenant_id, data_acerto)
  where excluido_em is null;

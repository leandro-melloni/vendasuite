-- Execute depois de 16_lixeira_acertos.sql no SQL Editor do Supabase.
-- A limpeza roda diariamente às 03:00 UTC. Cada acerto permanece recuperável
-- por pelo menos 30 dias completos a partir de excluido_em.
create extension if not exists pg_cron with schema extensions;

create index if not exists acertos_lixeira_excluido_em_idx
  on public.acertos (excluido_em)
  where excluido_em is not null;

select cron.schedule(
  'sanitizar-lixeira-acertos-30-dias',
  '0 3 * * *',
  $$delete from public.acertos
    where excluido_em is not null
      and excluido_em <= now() - interval '30 days'$$
);

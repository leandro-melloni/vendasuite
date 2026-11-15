alter table public.acertos add column if not exists pagamentos jsonb not null default '[]'::jsonb;

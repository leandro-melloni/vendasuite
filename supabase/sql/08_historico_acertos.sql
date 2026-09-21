-- Execute no SQL Editor do Supabase para habilitar o novo fluxo de acertos.
create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  mostruario_id uuid references public.mostruarios(id) on delete set null,
  vendedora_id uuid references public.vendedoras(id) on delete set null,
  data_acerto date not null default current_date,
  itens jsonb not null default '[]'::jsonb,
  total_pecas integer not null default 0,
  valor_total numeric(12,2) not null default 0,
  comissao_percentual numeric(5,2) not null default 50,
  valor_comissao numeric(12,2) not null default 0,
  valor_receber numeric(12,2) not null default 0,
  forma_pagamento text not null check (forma_pagamento in ('Pix', 'Dinheiro')),
  created_at timestamptz not null default now()
);

alter table public.acertos enable row level security;
drop policy if exists "dev_all_acertos" on public.acertos;
create policy "dev_all_acertos" on public.acertos for all using (true) with check (true);

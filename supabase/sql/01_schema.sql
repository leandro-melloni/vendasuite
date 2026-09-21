create extension if not exists "pgcrypto";

create table if not exists public.vendedoras (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  cpf text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  celular text,
  ultimo text,
  proximo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  descricao text not null,
  categoria text,
  tipo text,
  preco numeric(10,2) default 0,
  foto_url text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.mostruarios (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  vendedora_id uuid references public.vendedoras(id) on delete set null,
  data_envio date,
  data_acerto date,
  status text default 'aberto',
  created_at timestamptz default now()
);

create table if not exists public.mostruario_itens (
  id uuid primary key default gen_random_uuid(),
  mostruario_id uuid references public.mostruarios(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  quantidade integer default 0,
  created_at timestamptz default now()
);

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
  forma_pagamento text not null check (forma_pagamento in ('Pix','Dinheiro')),
  pagamentos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.acertos enable row level security;
drop policy if exists "dev_all_acertos" on public.acertos;
create policy "dev_all_acertos" on public.acertos for all using (true) with check (true);
-- Execute este arquivo no SQL Editor do Supabase antes de publicar esta versão.
alter table public.produtos
  add column if not exists quoficiente numeric(12,5) default 0;

create table if not exists public.configuracoes_metais (
  id integer primary key default 1 check (id = 1),
  valor_ouro numeric(12,2) not null default 0,
  valor_prata numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_metais (id, valor_ouro, valor_prata)
values (1, 0, 0)
on conflict (id) do nothing;

alter table public.configuracoes_metais enable row level security;
drop policy if exists "dev_all_configuracoes_metais" on public.configuracoes_metais;
create policy "dev_all_configuracoes_metais"
on public.configuracoes_metais for all
using (true) with check (true);

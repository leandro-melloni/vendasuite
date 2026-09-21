create extension if not exists "pgcrypto";

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  cpf text,
  address text,
  number text,
  complement text,
  district text,
  phone text,
  last_settlement_date date,
  next_settlement_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text not null,
  category text,
  cost_price numeric(12,2) default 0,
  sale_price numeric(12,2) default 0,
  stock_qty integer default 0,
  image_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.showcases (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  seller_id uuid references public.sellers(id) on delete restrict,
  date date,
  settlement_date date,
  items jsonb not null default '[]'::jsonb,
  status text default 'pendente',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  showcase_id uuid references public.showcases(id) on delete cascade,
  seller_id uuid references public.sellers(id) on delete restrict,
  settlement_date date default current_date,
  sold_items jsonb default '[]'::jsonb,
  returned_items jsonb default '[]'::jsonb,
  total_sold numeric(12,2) default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_sellers_updated on public.sellers;
create trigger trg_sellers_updated before update on public.sellers for each row execute function public.set_updated_at();
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists trg_showcases_updated on public.showcases;
create trigger trg_showcases_updated before update on public.showcases for each row execute function public.set_updated_at();
drop trigger if exists trg_settlements_updated on public.settlements;
create trigger trg_settlements_updated before update on public.settlements for each row execute function public.set_updated_at();

alter table public.sellers enable row level security;
alter table public.products enable row level security;
alter table public.showcases enable row level security;
alter table public.settlements enable row level security;

-- Para iniciar rápido com chave anon no frontend. Em produção, troque por políticas com auth.
drop policy if exists "public read sellers" on public.sellers;
create policy "public read sellers" on public.sellers for select using (true);
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select using (true);
drop policy if exists "public read showcases" on public.showcases;
create policy "public read showcases" on public.showcases for select using (true);
drop policy if exists "public read settlements" on public.settlements;
create policy "public read settlements" on public.settlements for select using (true);

-- Escrita será feita pelas Edge Functions usando SERVICE_ROLE_KEY.

insert into storage.buckets (id, name, public)
values ('product-images','product-images', true
on conflict (id) do update set public = true;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "anon upload product images" on storage.objects;
create policy "anon upload product images" on storage.objects for insert with check (bucket_id = 'product-images');
drop policy if exists "anon update product images" on storage.objects;
create policy "anon update product images" on storage.objects for update using (bucket_id = 'product-images');

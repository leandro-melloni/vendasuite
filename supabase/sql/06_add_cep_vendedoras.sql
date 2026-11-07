-- Migração: adiciona o campo CEP à tabela vendedoras
-- Execute este script no SQL Editor do Supabase.

alter table public.vendedoras
  add column if not exists cep text;

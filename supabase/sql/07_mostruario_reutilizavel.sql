-- Migração: permite reutilização de número de mostruário
-- Execute este script no SQL Editor do Supabase.

-- 1. Remover a constraint UNIQUE do campo 'numero'
--    (o nome da constraint pode variar; usamos DROP CONSTRAINT IF EXISTS nos dois padrões comuns)
ALTER TABLE public.mostruarios DROP CONSTRAINT IF EXISTS mostruarios_numero_key;
ALTER TABLE public.mostruarios DROP CONSTRAINT IF EXISTS mostruarios_numero_unique;

-- 2. Garantir que o campo 'status' existe com valor padrão
ALTER TABLE public.mostruarios
  ALTER COLUMN status SET DEFAULT 'disponivel';

-- 3. Atualizar registros antigos sem vendedora para 'disponivel'
UPDATE public.mostruarios
  SET status = 'disponivel'
  WHERE vendedora_id IS NULL AND (status IS NULL OR status = 'aberto');

-- 4. Atualizar registros com vendedora para 'alocado'
UPDATE public.mostruarios
  SET status = 'alocado'
  WHERE vendedora_id IS NOT NULL AND (status IS NULL OR status = 'aberto');

-- Impede que novos itens de mostruário sejam gravados com quantidade inválida.
-- NOT VALID preserva eventuais registros legados, mas a regra já é aplicada a
-- todas as novas inserções e atualizações.
alter table public.mostruario_itens
  drop constraint if exists mostruario_itens_quantidade_positiva;

alter table public.mostruario_itens
  add constraint mostruario_itens_quantidade_positiva
  check (quantidade is not null and quantidade > 0) not valid;

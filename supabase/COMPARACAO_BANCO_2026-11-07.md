# Comparação do banco `osldfmfljqzronykiqgs`

Dump gerado em 2026-11-07 do esquema `public`. O arquivo `remote_public_schema_2026-11-07.sql` contém a estrutura; `backups/osldfmfljqzronykiqgs_public_2026-11-07.dump` contém estrutura e dados no formato custom do PostgreSQL e está ignorado pelo Git. Os esquemas gerenciados pelo Supabase (`auth`, `storage`, entre outros) não fazem parte deste dump.

## Resultado

- O banco remoto contém as tabelas da aplicação: `acertos`, `configuracoes_metais`, `mostruario_itens`, `mostruarios`, `perfis`, `plataforma_admins`, `produtos`, `tenants` e `vendedoras`.
- O banco tem as funções de isolamento por tenant `tenant_atual`, `tenant_atual_id`, `tenant_ativo`, `perfil_atual` e `eh_superadmin`. Isso confirma que há lógica multitenant implantada, embora o histórico da CLI (`supabase migration list`) esteja vazio.
- A restrição `mostruario_itens_quantidade_positiva`, definida em `sql/15_quantidade_positiva_mostruario.sql`, não existe no remoto. Uma consulta de leitura encontrou **0** itens com quantidade nula ou menor ou igual a zero. Esse script é um candidato concreto para aplicação.
- A tabela `migracoes_aplicadas`, criada por `sql/14_migracao_multitenant_unificada.sql`, não existe no remoto. O banco pode ter recebido os scripts separados; a ausência dessa tabela não justifica executar a migração unificada sobre o banco atual sem análise adicional.
- `sql/schema.sql` descreve um modelo antigo (`sellers`, `products`, `showcases`, `settlements`) e não representa o banco remoto atual. Para manutenção, use `sql/01_schema.sql` e os scripts posteriores como histórico, junto com o dump remoto como fotografia do estado atual.

## Implantação em 2026-11-07

O script `sql/15_quantidade_positiva_mostruario.sql` foi aplicado ao projeto `osldfmfljqzronykiqgs` em uma transação. A consulta ao catálogo confirmou a restrição `mostruario_itens_quantidade_positiva` com `CHECK (quantidade IS NOT NULL AND quantidade > 0) NOT VALID`, como definido no script. O dump acima é a fotografia anterior a essa implantação.

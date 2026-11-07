# WN Bijouterias — Vite + Supabase

Esta versão foi refeita usando o frontend do GitHub como base, mantendo os módulos e IDs originais do sistema:

- Mostruário
- Vendedoras
- Acerto
- Cadastro Produto
- Configurações

## Como configurar

1. Crie o projeto no Supabase.
2. Rode os scripts em `supabase/sql` nesta ordem:
   - `01_schema.sql`
   - `02_storage.sql`
   - `03_policies_dev.sql`
   - `04_produtos_quoficiente_metais.sql` até `10_autenticacao_perfis.sql`, em ordem numérica
   - `11_saas_multi_tenant.sql` (faça backup e valide primeiro em homologação)
3. Crie/copiei `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

4. Instale e rode:

```bash
npm install
npm run dev
```

## Evolução para SaaS

A pesquisa, a arquitetura recomendada e o plano de migração multi-tenant estão em [`docs/ARQUITETURA_SAAS_MULTI_TENANT.md`](docs/ARQUITETURA_SAAS_MULTI_TENANT.md).

A migração `11_saas_multi_tenant.sql` transforma os registros existentes no tenant inicial “WN Bijouterias”, cria o papel de superadmin e habilita o portal de administração da plataforma. Depois da migração, publique novamente a Edge Function `admin-users` para que convites e exclusões respeitem os tenants.

## Observação

As policies de desenvolvimento estão liberadas para facilitar o teste inicial. Depois que tudo estiver aprovado, recomenda-se endurecer a segurança com login e permissões por usuário.

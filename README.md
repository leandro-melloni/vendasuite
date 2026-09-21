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

## Observação

As policies de desenvolvimento estão liberadas para facilitar o teste inicial. Depois que tudo estiver aprovado, recomenda-se endurecer a segurança com login e permissões por usuário.

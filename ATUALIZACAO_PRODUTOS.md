# Atualização do cadastro de produtos

Antes de publicar o frontend, execute no **SQL Editor do Supabase** o arquivo:

`supabase/sql/04_produtos_quoficiente_metais.sql`

A atualização adiciona:
- campo `quoficiente` na tabela `produtos`;
- tabela única `configuracoes_metais` para salvar ouro e prata;
- política de acesso necessária para o frontend atual.

Depois, execute:

```bash
npm install
npm run build
```

A pasta `dist` será recriada com a versão atualizada.

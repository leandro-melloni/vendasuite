# Correção aplicada

Esta versão mantém o frontend visual do GitHub e corrige o problema de renderização no GitHub Pages/Vite.

Ajustes feitos:

- `vite.config.js` com `base: './'` para evitar quebra de CSS/JS em subpasta do GitHub Pages.
- Caminhos das imagens corrigidos de `/assets/...` para `assets/...`.
- Validação de variáveis do Supabase para não tentar buscar dados quando ainda estiver com placeholder.
- Mantida a estrutura visual original: telas, IDs, botões, imagens e classes.

Para publicar no GitHub Pages:

```bash
npm install
npm run build
```

Publique a pasta `dist`.

Configure o Supabase em um arquivo `.env` antes do build:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

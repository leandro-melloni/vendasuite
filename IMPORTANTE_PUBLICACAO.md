# WN Bijouterias — publicação correta

Este pacote mantém a estrutura visual original do frontend publicado.

## Para desenvolver com Vite
1. Copie `.env.example` para `.env`
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
3. Rode:

```bash
npm install
npm run dev
```

## Para publicar no GitHub Pages sem quebrar o layout
O GitHub Pages deve apontar para a pasta `docs`.

No GitHub:
Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: `/docs`

A pasta `docs` já contém a versão compilada com CSS, JS e imagens no caminho correto.

## Atenção
Não publique a pasta `src` diretamente no GitHub Pages. Ela é para o Vite em desenvolvimento.

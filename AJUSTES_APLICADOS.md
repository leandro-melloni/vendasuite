# Ajustes aplicados

- Cadastro de Mostruário: campo **Cód. do Produto** agora aceita no máximo 4 caracteres.
- Cadastro de Mostruário: ao atingir 4 caracteres no código do produto, o foco pula automaticamente para o próximo campo editável, que é **Qtd.**.
- Códigos de produto ficam sempre em **UPPERCASE** nos campos:
  - Cadastro de Produto
  - Produto dentro do Mostruário
  - Produto dentro do Acerto
- Datas de **Último Acerto** e **Próximo Acerto** no cadastro de Mostruário agora são campos nativos de data (`type="date"`), não texto.
- A conversão para Supabase aceita a data no formato nativo `AAAA-MM-DD`.
- A pasta `docs` já está compilada para publicar no GitHub Pages em `main / docs`.

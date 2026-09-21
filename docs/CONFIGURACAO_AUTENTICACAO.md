# Configuração de autenticação

1. Execute `supabase/sql/10_autenticacao_perfis.sql` no SQL Editor do Supabase.
2. Crie o primeiro usuário em **Authentication > Users**.
3. Promova esse usuário no SQL Editor:

```sql
update public.perfis
set perfil = 'administracao'
where email = 'seu-email@exemplo.com';
```

4. Publique a função administrativa:

```sh
supabase functions deploy admin-users
```

5. Em **Authentication > URL Configuration**, defina a **Site URL** com a URL publicada do sistema e adicione a mesma URL às **Redirect URLs**. Inclua o caminho completo da aplicação, por exemplo `https://usuario.github.io/wn-bijouterias/`.

Novos usuários devem ser convidados pela tela **Configurações**. O banco cria automaticamente todos os convidados com o perfil `leitura`; um administrador pode alterá-los para `escrita` ou `administracao`.

Na mesma tela, o administrador pode excluir um usuário que precise ser convidado novamente. A conta atualmente conectada não pode excluir a si própria.

O convite não contém senha temporária. Ao clicar no link, o usuário é direcionado ao sistema para criar sua própria senha. Se a tela não abrir, confira se a URL exata do sistema (incluindo o caminho, por exemplo `/wn-bijouterias/`) está cadastrada nas Redirect URLs e publique novamente a função `admin-users` após alterações.

## Limite de envio de convites

O serviço de e-mail padrão do Supabase permite somente 2 e-mails de autenticação por hora e é destinado a testes. Esse total inclui convites, recuperação de senha e outros e-mails do Auth. Para uso normal, configure um provedor em **Authentication > Emails > SMTP Settings**. Depois disso, revise também **Authentication > Rate Limits**.

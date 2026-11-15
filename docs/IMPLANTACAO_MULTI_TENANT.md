# Implantação da migração multi-tenant

## Antes de começar

1. Faça um backup do banco de produção.
2. Crie ou use um projeto Supabase de homologação com uma cópia dos dados.
3. Confirme que os scripts `01` a `10` já foram executados.
4. Não cadastre a segunda loja antes de concluir os testes de isolamento.

## Aplicação em banco legado com dados

Para migrar um banco que já possui usuários, produtos, vendedoras, mostruários
e acertos, use somente a migração unificada:

```text
supabase/sql/14_migracao_multitenant_unificada.sql
```

Antes de executar, substitua no início do arquivo:

```sql
values ('SUBSTITUA-PELO-EMAIL-DO-SUPERADMIN');
```

pelo e-mail exato do usuário que administrará a VendaSuite. Não execute os
scripts `11`, `12` e `13` antes ou depois do script unificado; eles permanecem
no repositório apenas como histórico da implementação incremental.

A migração unificada roda em uma única transação e:

- cria `tenants` e `plataforma_admins`;
- cria `vendasuite` como tenant da plataforma e `wn-bijouterias` como cliente;
- vincula o usuário escolhido à VendaSuite como `administracao` e superadmin;
- vincula todos os outros usuários à WN sem alterar o perfil atual;
- associa todos os registros operacionais existentes à WN;
- converte códigos e números únicos em chaves únicas por tenant;
- adiciona relacionamentos compostos para impedir referências entre lojas;
- substitui as policies abertas por RLS tenant-aware;
- separa uploads novos por diretório de tenant;
- aplica os privilégios necessários para `authenticated` e `service_role`;
- valida todas as associações antes do `commit` e faz rollback se algo divergir.

O número do mostruário continua reutilizável. A migração não recria a restrição
única removida pelo script `07`.

Confira o superadmin criado:

```sql
select u.email, p.perfil, t.nome as tenant_principal, pa.created_at
from public.plataforma_admins pa
join auth.users u on u.id = pa.user_id
join public.perfis p on p.id = pa.user_id
join public.tenants t on t.id = p.tenant_id;
```

O próprio script retorna ao final a relação de usuários, tenants, perfis e as
contagens dos dados operacionais por tenant para conferência.

## Edge Functions

Faça o deploy da função administrativa atualizada:

```bash
supabase functions deploy admin-users
```

Se as funções REST `vendedoras`, `produtos` ou `mostruarios` estiverem publicadas, faça também o redeploy. Elas agora propagam o JWT do usuário e deixam o RLS aplicar o isolamento:

```bash
supabase functions deploy vendedoras
supabase functions deploy produtos
supabase functions deploy mostruarios
```

As funções legadas `save-*`, `delete-*` e `upload-product-image` não são usadas pelo front-end atual. Remova-as do projeto Supabase se estiverem publicadas; elas pertencem ao modelo de dados antigo em inglês.

## Front-end

Publique a nova build depois da migração e do deploy de `admin-users`:

```bash
npm install
npm run build
```

O primeiro superadmin encontra **Abrir portal superadmin** em Configurações. Nesse portal é possível:

- criar uma loja e enviar o convite para o primeiro administrador;
- reenviar/convidar outro administrador;
- suspender ou reativar uma loja;
- acompanhar a quantidade de usuários por loja.

Administradores de loja permanecem na tela normal de Configurações e só gerenciam usuários do próprio tenant.

## Testes mínimos em homologação

1. Crie duas lojas pelo portal e aceite os dois convites em navegadores ou perfis separados.
2. Cadastre produto, vendedora, mostruário e acerto na loja A.
3. Confirme que a loja B não lista esses registros.
4. Tente consultar e alterar um UUID da loja A usando a sessão da loja B; a resposta deve retornar zero linhas ou negar a operação.
5. Confirme que códigos iguais podem existir nas duas lojas.
6. Faça upload de imagens nas duas lojas e confira os diretórios `<tenant_id>/produtos/`.
7. Confirme que um administrador de loja não lista nem exclui usuários de outro tenant.
8. Suspenda a loja B e confirme que seus usuários não conseguem abrir a aplicação.

## Observação sobre imagens

O bucket `produtos` continua público para preservar as URLs já gravadas. A migração isola criação, alteração e exclusão dos novos objetos, mas uma URL pública conhecida continua legível. Para imagens privadas, altere o bucket para privado, migre o front-end para URLs assinadas e revise as URLs persistidas antes de produção.

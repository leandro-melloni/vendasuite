# Arquitetura SaaS multi-tenant

Pesquisa e proposta para a issue [#3](https://github.com/lelegp11/wn-bijouterias/issues/3).

> Pesquisa revisada em 19/09/2026. Preços e limites dos fornecedores podem mudar; valide-os antes da contratação.

## Resumo executivo

A recomendação para o MVP é manter **um único projeto Supabase e uma única aplicação**, compartilhados por todas as lojas, e separar cada registro por `tenant_id` (identificador da loja). O PostgreSQL Row Level Security (RLS) deve garantir que um usuário só veja e altere registros do seu tenant.

O front-end pode sair do GitHub Pages e ser publicado na **Vercel**, inicialmente em um domínio como `app.vendasuite.com.br`. Cada loja pode receber um subdomínio (`loja-a.vendasuite.com.br`) apontando para o mesmo deploy. Domínios próprios podem entrar numa fase posterior.

Essa opção entrega o menor custo e a menor carga operacional para o estágio atual. Criar um projeto Supabase para cada cliente aumenta o isolamento, mas também multiplica migrações, funções, monitoramento e custo: no Supabase pago, cada projeto é uma instância dedicada, e projetos adicionais começam em aproximadamente US$ 10/mês, além do plano da organização ([documentação de cobrança](https://supabase.com/docs/guides/platform/billing-faq), [preços](https://supabase.com/pricing)).

## Comparação das alternativas


| Modelo                                       | Isolamento                          | Operação                                   | Custo inicial   | Indicação                                   |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------: | ---------------: | ------------------------------------------- |
| Um Supabase, tabelas com `tenant_id` e RLS   | Alto, se as policies forem testadas | Baixa                                      | Menor           | **MVP e crescimento inicial**               |
| Um schema PostgreSQL por loja                | Alto                                | Média/alta; migrações ficam complexas      | Médio           | Não recomendado agora                       |
| Um projeto Supabase por loja                 | Máximo                              | Alta; deploy e observabilidade por cliente | Cresce por loja | Clientes enterprise ou exigência contratual |


O Supabase recomenda RLS em toda tabela exposta e esclarece que `service_role` ignora RLS ([guia oficial de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)). Portanto, o isolamento não pode depender de filtros colocados apenas no JavaScript.

## Modelo de dados proposto

```text
tenants
  id, slug, nome, dominio_customizado, logo_url, cores, ativo
     │
     ├── perfis (user_id, tenant_id, perfil)
     ├── produtos (tenant_id, ...)
     ├── vendedoras (tenant_id, ...)
     ├── mostruarios (tenant_id, ...)
     ├── mostruario_itens (tenant_id, ...)
     ├── acertos (tenant_id, ...)
     └── configuracoes_metais (tenant_id, ...)
```

Para o MVP, cada usuário pertence a uma loja. Isso permite manter `perfis.id = auth.users.id` e apenas adicionar `tenant_id`. Se, no futuro, um usuário puder acessar várias lojas, `perfis` deve ser dividido em `usuarios` e `tenant_membros`, e a sessão deverá carregar o tenant ativo.

Regras obrigatórias:

1. Toda tabela de negócio recebe `tenant_id uuid not null references tenants(id)`.
2. Chaves únicas passam a ser compostas: por exemplo, `unique (tenant_id, codigo)` em produtos e vendedoras e `unique (tenant_id, numero)` em mostruários.
3. Chaves estrangeiras também devem impedir vínculos entre tenants. Um item não pode referenciar um produto ou mostruário de outra loja.
4. Toda policy usa o tenant do usuário autenticado. Escrita continua respeitando os perfis `administracao`, `escrita` e `leitura`.
5. O cliente nunca escolhe livremente o `tenant_id`; ele é obtido da associação autenticada e validado no banco.

Exemplo simplificado de policy:

```sql
create or replace function public.tenant_atual()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.perfis where id = auth.uid()
$$;

create policy "usuario le produtos do tenant"
on public.produtos for select to authenticated
using (tenant_id = (select public.tenant_atual()));

create policy "usuario escreve produtos do tenant"
on public.produtos for all to authenticated
using (
  tenant_id = (select public.tenant_atual())
  and public.perfil_atual() in ('administracao', 'escrita')
)
with check (
  tenant_id = (select public.tenant_atual())
  and public.perfil_atual() in ('administracao', 'escrita')
);
```

O mesmo princípio se aplica ao Storage. Os arquivos devem usar o caminho `<tenant_id>/produtos/<arquivo>` e policies em `storage.objects` devem validar o primeiro segmento. O Supabase Storage usa RLS para controlar operações nos objetos ([controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control)). O bucket atual é público; assim, conhecer uma URL basta para abrir uma imagem. Se as fotos forem privadas, o bucket deve ser privado e as imagens entregues por URLs assinadas.

## Front-end e resolução da loja

Uma única build Vite atende todas as lojas. No carregamento:

1. ler `window.location.hostname`;
2. resolver o hostname para um registro em `tenants` (ou carregar o tenant pelo perfil após o login);
3. confirmar que o usuário pertence ao tenant resolvido;
4. aplicar nome, logo e cores armazenados no tenant;
5. deixar o RLS filtrar todas as consultas.

O hostname melhora a experiência e o branding, mas não é uma barreira de segurança. A autorização permanece no Supabase.

Para convites, a função `admin-users` deve copiar o `tenant_id` do administrador para o novo perfil. Em exclusões e atualizações, ela precisa filtrar simultaneamente por `user_id` e `tenant_id`. Hoje ela usa `service_role`, que contorna RLS; sem esse filtro, um administrador poderia afetar um usuário de outra loja.

As demais Edge Functions antigas que usam `SUPABASE_SERVICE_ROLE_KEY` também devem ser desativadas se não forem utilizadas, ou passar a validar o JWT e o tenant antes de qualquer consulta. Nunca se deve confiar em `tenant_id` recebido no corpo da requisição.

## Hospedagem pesquisada

### Recomendação: Vercel

A Vercel documenta aplicações multi-tenant com uma única base de código, subdomínios wildcard, domínios próprios e certificados SSL automáticos ([Vercel for Platforms](https://vercel.com/kb/guide/nextjs-multi-tenant-application)). A aplicação Vite atual pode ser hospedada sem migração para Next.js; a resolução do hostname pode ocorrer no navegador. Next.js só passa a ser interessante quando houver páginas públicas indexáveis por loja, renderização no servidor ou onboarding automatizado de muitos domínios.

O plano Hobby serve para uma prova de conceito, mas é destinado a projeto pessoal. Para operação comercial, considerar o Pro, listado a US$ 20/mês na data desta pesquisa ([preços da Vercel](https://vercel.com/pricing)).

Configuração de build:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
Variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

Adicionar o domínio principal e `*.vendasuite.com.br` ao mesmo projeto. No Supabase Auth, cadastrar a URL de produção e os retornos autorizados dos subdomínios usados pelos convites.

### Alternativa: Cloudflare Pages/Workers

Cloudflare Pages aceita domínios personalizados ([documentação](https://developers.cloudflare.com/pages/configuration/custom-domains/)). Para domínios próprios de muitos clientes, Cloudflare for SaaS oferece hostnames customizados, validação e certificados, mas exige uma configuração mais especializada de fallback origin e DNS ([guia oficial](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)). É uma boa evolução se volume de tráfego, edge routing ou custo de muitos domínios justificar a complexidade.

GitHub Pages continua adequado para documentação e demos, mas não é a melhor base operacional para onboarding de tenants, ambientes separados, variáveis e automação de domínios.

## Segurança e riscos encontrados no estado atual

- As policies da migração `10_autenticacao_perfis.sql` usam `using (true)` para leitura por qualquer autenticado. Antes de cadastrar a segunda loja, elas precisam ser substituídas pelas policies com tenant.
- `configuracoes_metais` fixa `id = 1`; no modelo SaaS, a chave deve ser `(tenant_id, id)` ou a própria `tenant_id` deve ser a chave primária.
- O upload atual grava todos os produtos na raiz do bucket público. Deve incluir o tenant no caminho e receber policies de Storage.
- `codigo` e `numero` são únicos globalmente. Precisam ser únicos apenas dentro da loja.
- A listagem administrativa de perfis deve retornar somente usuários da mesma loja.
- Funções com `service_role` são fronteiras privilegiadas e precisam de teste específico de autorização.
- Dados como CPF, endereço e telefone exigem controles de acesso, retenção, backup e processo de atendimento aos titulares compatíveis com a LGPD.

## Plano de execução

### Fase 1 — isolamento (bloqueia a entrada da segunda loja)

1. Fazer backup e criar ambiente de homologação.
2. Criar `tenants` e cadastrar a WN Bijouterias como tenant inicial.
3. Adicionar e preencher `tenant_id` em perfis e tabelas existentes.
4. Alterar constraints únicas e relacionamentos.
5. Substituir todas as policies por policies tenant-aware.
6. Segmentar o Storage e corrigir `admin-users`.
7. Criar testes com dois tenants provando que leitura, escrita, relacionamento, Storage e administração não atravessam lojas.

### Fase 2 — publicação

1. Publicar a build Vite na Vercel.
2. Configurar domínio, wildcard, SSL e URLs do Supabase Auth.
3. Implementar resolução de hostname e branding básico.
4. Validar login, convite, recuperação de senha e logout em produção.

### Fase 3 — operação SaaS

1. Criar painel de superadmin separado das funções de administrador de loja.
2. Automatizar criação, suspensão e auditoria de tenants.
3. Integrar cobrança (por exemplo, Stripe ou Mercado Pago) somente após validar planos e regras de negócio.
4. Adicionar logs de auditoria, métricas, alertas, política de backup/restauração e termos de privacidade.
5. Avaliar domínios próprios por cliente como recurso de plano pago.

## Critérios de aceite antes do primeiro cliente

- Usuário da loja A recebe zero registros da loja B mesmo alterando requisições manualmente.
- IDs válidos de outra loja não podem ser lidos, atualizados, excluídos nem usados em relacionamentos.
- Administrador da loja A não lista, convida, altera ou exclui usuários da loja B.
- Arquivos de uma loja não podem ser alterados por usuários de outra loja.
- Um deploy atualiza todas as lojas sem duplicar código.
- Backup e restauração foram ensaiados em homologação.
- O custo mensal e os limites dos planos estão monitorados.

## Decisão recomendada

Adotar **banco compartilhado com `tenant_id` + RLS, um deploy Vite na Vercel e subdomínios por loja**. Não habilitar uma segunda loja enquanto a Fase 1 e seus testes de isolamento não estiverem concluídos. Manter projetos Supabase separados apenas como opção futura para clientes que exijam isolamento físico ou contrato dedicado.

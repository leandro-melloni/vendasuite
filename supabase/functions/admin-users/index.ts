import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const functionVersion = '2026-11-07-vendasuite-3';
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://vendasuite.vercel.app')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const originAllowed = !origin || allowedOrigins.includes(origin);
  const corsHeaders = {
    'Access-Control-Allow-Origin': originAllowed && origin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (!originAllowed) return new Response(JSON.stringify({ error: 'Origem não autorizada.' }), {
    status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Version': functionVersion }
  });
  const friendlyAuthError = (error: { message?: string; code?: string; status?: number }) => {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    if (code.includes('user_already_exists') || message.includes('already') || message.includes('registered') || message.includes('exists')) {
      return { error: 'Este e-mail já possui um usuário. Exclua o cadastro existente na lista e tente novamente.', code: 'usuario_existente' };
    }
    if (code.includes('over_email_send_rate_limit') || message.includes('rate limit') || message.includes('too many')) {
      return { error: 'O limite de 2 e-mails por hora do Supabase foi atingido. Aguarde a liberação do limite ou configure um SMTP próprio antes de tentar novamente.', code: 'limite_email' };
    }
    if (code.includes('email_address_invalid') || message.includes('invalid email')) {
      return { error: 'O endereço de e-mail informado não é válido.', code: 'email_invalido' };
    }
    if (message.includes('database error') || message.includes('saving new user')) {
      return { error: 'O Supabase não conseguiu criar o usuário. Verifique se as migrações 10 e 11 foram executadas por completo.', code: 'erro_banco_usuario' };
    }
    if (message.includes('redirect') || message.includes('url')) {
      return { error: 'A URL da aplicação não está autorizada no Supabase. Revise Authentication → URL Configuration.', code: 'redirect_invalido' };
    }
    return { error: 'Não foi possível enviar o convite agora. Tente novamente em alguns minutos.', code: 'erro_convite' };
  };

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);

    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'Token da sessão não informado.', code: 'token_ausente', version: functionVersion }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !user) return json({ error: 'Sessão inválida.', code: 'sessao_invalida', version: functionVersion }, 401);

    const body = await req.json();
    const [profileResult, platformAdminResult, superadminRpcResult] = await Promise.all([
      admin.from('perfis').select('perfil,tenant_id').eq('id', user.id).maybeSingle(),
      admin.from('plataforma_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      userClient.rpc('eh_superadmin')
    ]);
    const profile = profileResult.data;
    const platformAdmin = platformAdminResult.data;
    const isSuperadmin = Boolean(platformAdmin) || superadminRpcResult.data === true;
    if (profile?.perfil !== 'administracao' && !isSuperadmin) {
      console.error('Autorização administrativa ausente', {
        userId: user.id,
        email: user.email,
        profileError: profileResult.error?.message,
        platformAdminError: platformAdminResult.error?.message,
        superadminRpcError: superadminRpcResult.error?.message
      });
      return json({
        error: 'Apenas administradores podem gerenciar usuários.',
        code: 'acesso_admin_ausente',
        version: functionVersion
      }, 403);
    }

    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return json({ error: 'Informe o e-mail que receberá o convite.', code: 'email_nao_informado' });
      const requestedTenant = String(body.tenantId || profile?.tenant_id || '').trim();
      if (!requestedTenant) return json({ error: 'Loja não informada.', code: 'tenant_nao_informado' }, 400);
      if (!isSuperadmin && requestedTenant !== profile?.tenant_id) {
        return json({ error: 'Você não pode convidar usuários para outra loja.', code: 'tenant_negado' }, 403);
      }
      const { data: tenant, error: tenantError } = await admin.from('tenants').select('id,nome,slug,ativo').eq('id', requestedTenant).maybeSingle();
      if (tenantError) {
        console.error('Falha ao consultar tenant do convite', { requestedTenant, message: tenantError.message, code: tenantError.code });
        return json({
          error: 'Não foi possível validar a loja informada.',
          code: 'erro_consulta_tenant',
          version: functionVersion
        }, 500);
      }
      if (!tenant) return json({
        error: 'A loja informada não existe.',
        code: 'tenant_nao_encontrado',
        version: functionVersion
      }, 404);
      if (!tenant.ativo) return json({
        error: `A loja ${tenant.nome} está suspensa.`,
        code: 'tenant_inativo',
        version: functionVersion
      }, 400);
      const requestedProfile = isSuperadmin && body.perfil === 'administracao' ? 'administracao' : 'leitura';
      const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;
      let result = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { senha_pendente: true, tenant_id: requestedTenant, perfil: requestedProfile }
      });
      if (result.error && redirectTo && /redirect|url/i.test(result.error.message)) {
        result = await admin.auth.admin.inviteUserByEmail(email, {
          data: { senha_pendente: true, tenant_id: requestedTenant, perfil: requestedProfile }
        });
      }
      if (result.error) {
        console.error('Falha ao convidar usuário', { status: result.error.status, code: result.error.code, message: result.error.message });
        return json(friendlyAuthError(result.error));
      }
      const invitedUser = result.data.user;
      if (!invitedUser) return json({ error: 'O convite não retornou um usuário.', code: 'usuario_nao_criado' }, 500);
      const { error: profileError } = await admin.from('perfis').upsert({
        id: invitedUser.id,
        email,
        perfil: requestedProfile,
        tenant_id: requestedTenant,
        updated_at: new Date().toISOString()
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(invitedUser.id);
        console.error('Falha ao criar perfil do convite', { message: profileError.message });
        return json({ error: 'O convite não pôde ser associado à loja. Tente novamente.', code: 'erro_perfil' }, 500);
      }
      return json({ success: true, user: result.data.user });
    }

    if (body.action === 'delete') {
      const userId = String(body.userId || '');
      if (!userId) return json({ error: 'Selecione um usuário para excluir.', code: 'usuario_nao_informado' });
      if (userId === user.id) return json({ error: 'Você não pode excluir o usuário que está conectado.', code: 'proprio_usuario' });
      const { data: targetProfile } = await admin.from('perfis').select('tenant_id').eq('id', userId).maybeSingle();
      if (!targetProfile) return json({ error: 'Usuário não encontrado.', code: 'usuario_nao_encontrado' }, 404);
      if (!isSuperadmin && targetProfile.tenant_id !== profile?.tenant_id) {
        return json({ error: 'Você não pode excluir usuários de outra loja.', code: 'tenant_negado' }, 403);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Ação inválida.', code: 'acao_invalida' });
  } catch (error) {
    const authError = error as { message?: string; code?: string; status?: number };
    console.error('Erro inesperado em admin-users', { status: authError?.status, code: authError?.code, message: authError?.message });
    return json(friendlyAuthError(authError));
  }
});

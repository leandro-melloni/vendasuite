import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      return { error: 'O Supabase não conseguiu criar o usuário. Verifique se a migração 10_autenticacao_perfis.sql foi executada por completo.', code: 'erro_banco_usuario' };
    }
    if (message.includes('redirect') || message.includes('url')) {
      return { error: 'A URL da aplicação não está autorizada no Supabase. Revise Authentication → URL Configuration.', code: 'redirect_invalido' };
    }
    return { error: 'Não foi possível enviar o convite agora. Tente novamente em alguns minutos.', code: 'erro_convite' };
  };

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);

    const admin = createClient(url, serviceKey);
    const { data: profile } = await admin.from('perfis').select('perfil').eq('id', user.id).single();
    if (profile?.perfil !== 'administracao') return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);

    const body = await req.json();
    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return json({ error: 'Informe o e-mail que receberá o convite.', code: 'email_nao_informado' });
      const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;
      let result = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { senha_pendente: true }
      });
      if (result.error && redirectTo && /redirect|url/i.test(result.error.message)) {
        result = await admin.auth.admin.inviteUserByEmail(email, { data: { senha_pendente: true } });
      }
      if (result.error) {
        console.error('Falha ao convidar usuário', { status: result.error.status, code: result.error.code, message: result.error.message });
        return json(friendlyAuthError(result.error));
      }
      return json({ success: true, user: result.data.user });
    }

    if (body.action === 'delete') {
      const userId = String(body.userId || '');
      if (!userId) return json({ error: 'Selecione um usuário para excluir.', code: 'usuario_nao_informado' });
      if (userId === user.id) return json({ error: 'Você não pode excluir o usuário que está conectado.', code: 'proprio_usuario' });
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

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const table = url.pathname.split('/').filter(Boolean).pop() || 'produtos';
  const id = url.searchParams.get('id');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    if (req.method === 'GET') {
      const query = supabase.from(table).select('*').order('created_at', { ascending: false });
      const { data, error } = id ? await query.eq('id', id).single() : await query;
      if (error) throw error;
      return Response.json(data, { headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));

    if (req.method === 'POST') {
      const { data, error } = await supabase.from(table).insert(body).select().single();
      if (error) throw error;
      return Response.json(data, { headers: corsHeaders });
    }

    if (req.method === 'PUT') {
      if (!id) throw new Error('Informe ?id= para atualizar.');
      const { data, error } = await supabase.from(table).update(body).eq('id', id).select().single();
      if (error) throw error;
      return Response.json(data, { headers: corsHeaders });
    }

    if (req.method === 'DELETE') {
      if (!id) throw new Error('Informe ?id= para excluir.');
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return new Response('Método não permitido', { status: 405, headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 400, headers: corsHeaders });
  }
});

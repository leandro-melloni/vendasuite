import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const body = await req.json();
    const fn = new URL(req.url).pathname.split('/').pop();
    let result;

    if (fn === 'save-seller') {
      const payload = {
        code: body.code, name: body.name, cpf: body.cpf || null, address: body.address || null,
        number: body.number || null, complement: body.complement || null, district: body.district || null,
        phone: body.phone || null, last_settlement_date: body.last_settlement_date || null,
        next_settlement_date: body.next_settlement_date || null
      };
      result = body.id
        ? await supabase.from('sellers').update(payload).eq('id', body.id).select().single()
        : await supabase.from('sellers').insert(payload).select().single();
    }

    if (fn === 'delete-seller') result = await supabase.from('sellers').delete().eq('id', body.id).select().single();

    if (fn === 'save-product') {
      const payload = {
        code: body.code, description: body.description, category: body.category || null,
        cost_price: Number(body.cost_price || 0), sale_price: Number(body.sale_price || 0),
        stock_qty: Number(body.stock_qty || 0), image_url: body.image_url || null, active: body.active ?? true
      };
      result = body.id
        ? await supabase.from('products').update(payload).eq('id', body.id).select().single()
        : await supabase.from('products').insert(payload).select().single();
    }

    if (fn === 'delete-product') result = await supabase.from('products').delete().eq('id', body.id).select().single();

    if (fn === 'save-showcase') {
      const payload = {
        number: body.number, seller_id: body.seller_id, date: body.date || null,
        settlement_date: body.settlement_date || null, items: body.items || [], status: body.status || 'pendente'
      };
      result = body.id
        ? await supabase.from('showcases').update(payload).eq('id', body.id).select().single()
        : await supabase.from('showcases').insert(payload).select().single();
    }

    if (fn === 'delete-showcase') result = await supabase.from('showcases').delete().eq('id', body.id).select().single();

    if (fn === 'upload-product-image') {
      // Mantida como backend reservado. O frontend atual sobe direto no Storage público.
      result = { data: { message: 'Use o bucket product-images ou implemente upload base64 aqui.' }, error: null };
    }

    if (!result) throw new Error('Função não encontrada.');
    if (result.error) throw result.error;
    return new Response(JSON.stringify({ data: result.data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

import { supabase, supabaseConfigured } from '../lib/supabaseClient.js';

function ensure() { if (!supabaseConfigured) throw new Error('Supabase não configurado. Preencha o arquivo .env.'); }
let tenantAtualId = null;

export function definirTenantAtual(tenantId) {
  tenantAtualId = tenantId || null;
}

function tenantId() {
  ensure();
  if (!tenantAtualId) throw new Error('Tenant do usuário não foi identificado. Entre novamente no sistema.');
  return tenantAtualId;
}

export async function listarVendedoras() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('vendedoras').select('*').eq('tenant_id', tenantId()).order('codigo'); if (error) throw error; return data || []; }
export async function buscarVendedoraPorCodigo(codigo) { if (!supabaseConfigured || !codigo) return null; const { data, error } = await supabase.from('vendedoras').select('*').eq('tenant_id', tenantId()).eq('codigo', codigo).maybeSingle(); if (error) throw error; return data; }
export async function salvarVendedora(payload) { const tid = tenantId(); const { id, ...dados } = payload; const q = id ? supabase.from('vendedoras').update(dados).eq('tenant_id', tid).eq('id', id) : supabase.from('vendedoras').insert({ ...dados, tenant_id: tid }); const { data, error } = await q.select().single(); if (error) throw error; return data; }
export async function excluirVendedora(id) { const tid = tenantId(); const { error } = await supabase.from('vendedoras').delete().eq('tenant_id', tid).eq('id', id); if (error) throw error; }


export async function carregarValoresMetais() {
  if (!supabaseConfigured) return { valor_ouro: 0, valor_prata: 0 };
  const { data, error } = await supabase.from('configuracoes_metais').select('*').eq('tenant_id', tenantId()).maybeSingle();
  if (error) throw error;
  return data || { valor_ouro: 0, valor_prata: 0 };
}
export async function salvarValoresMetais(valorOuro, valorPrata) {
  const tid = tenantId();
  const { data: existente, error: buscaError } = await supabase.from('configuracoes_metais').select('id').eq('tenant_id', tid).maybeSingle();
  if (buscaError) throw buscaError;
  const dados = { valor_ouro: valorOuro, valor_prata: valorPrata, updated_at: new Date().toISOString() };
  const query = existente
    ? supabase.from('configuracoes_metais').update(dados).eq('tenant_id', tid).eq('id', existente.id)
    : supabase.from('configuracoes_metais').insert({ ...dados, tenant_id: tid });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function recalcularPrecosProdutos(valorOuro, valorPrata) {
  const tid = tenantId();
  const { data: produtos, error } = await supabase.from('produtos').select('id, tipo, categoria, quoficiente').eq('tenant_id', tid);
  if (error) throw error;

  const atualizacoes = (produtos || []).map((produto) => {
    const tipo = produto.tipo || produto.categoria;
    const valorMetal = tipo === 'ouro' ? Number(valorOuro || 0) : tipo === 'prata' ? Number(valorPrata || 0) : 0;
    const preco = valorMetal > 0 && Number(produto.quoficiente || 0) > 0
      ? Math.round(valorMetal * Number(produto.quoficiente))
      : 0;
    return supabase.from('produtos').update({ preco }).eq('tenant_id', tid).eq('id', produto.id);
  });

  const resultados = await Promise.all(atualizacoes);
  const falha = resultados.find((resultado) => resultado.error);
  if (falha?.error) throw falha.error;
  return resultados.length;
}

export async function listarProdutos() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('produtos').select('*').eq('tenant_id', tenantId()).order('codigo'); if (error) throw error; return data || []; }
export async function buscarProdutoPorCodigo(codigo) { if (!supabaseConfigured || !codigo) return null; const { data, error } = await supabase.from('produtos').select('*').eq('tenant_id', tenantId()).eq('codigo', codigo).maybeSingle(); if (error) throw error; return data; }
export async function buscarProdutosPorPrefixo(prefixo) { if (!supabaseConfigured || !prefixo) return []; const { data, error } = await supabase.from('produtos').select('*').eq('tenant_id', tenantId()).ilike('codigo', `${prefixo}%`).order('codigo').limit(10); if (error) throw error; return data || []; }
export async function salvarProduto(payload) { const tid = tenantId(); const { id, ...dados } = payload; const q = id ? supabase.from('produtos').update(dados).eq('tenant_id', tid).eq('id', id) : supabase.from('produtos').insert({ ...dados, tenant_id: tid }); const { data, error } = await q.select().single(); if (error) throw error; return data; }
export async function excluirProduto(id) { const tid = tenantId(); const { error } = await supabase.from('produtos').delete().eq('tenant_id', tid).eq('id', id); if (error) throw error; }
export async function uploadImagemProduto(file) { const tid = tenantId(); if (!file) return null; const ext = (file.name.split('.').pop() || 'png').toLowerCase(); const path = `${tid}/${Date.now()}-${crypto.randomUUID()}.${ext}`; const { error } = await supabase.storage.from('produtos').upload(path, file, { upsert: false }); if (error) throw error; const { data } = supabase.storage.from('produtos').getPublicUrl(path); return data.publicUrl; }

export async function listarMostruarios() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').eq('tenant_id', tenantId()).order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function listarMostruariosDisponiveis() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').eq('tenant_id', tenantId()).eq('status', 'disponivel').order('numero'); if (error) throw error; return data || []; }
export async function listarMostruariosAlocados() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').eq('tenant_id', tenantId()).eq('status', 'alocado').order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function salvarMostruario(payload) {
  const tid = tenantId();
  const { id, itens = [], ...mostruario } = payload;

  // Determina status automaticamente: alocado se tiver vendedora, disponivel caso contrário
  const status = mostruario.vendedora_id ? 'alocado' : 'disponivel';
  const dadosMostruario = { ...mostruario, status };

  const query = id
    ? supabase.from('mostruarios').update(dadosMostruario).eq('tenant_id', tid).eq('id', id)
    : supabase.from('mostruarios').insert({ ...dadosMostruario, tenant_id: tid });

  const { data, error } = await query.select().single();
  if (error) throw error;

  if (id) {
    const del = await supabase.from('mostruario_itens').delete().eq('tenant_id', tid).eq('mostruario_id', id);
    if (del.error) throw del.error;
  }

  if (itens.length) {
    const rows = itens.map(item => ({
      mostruario_id: data.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      tenant_id: tid
    }));
    const result = await supabase.from('mostruario_itens').insert(rows);
    if (result.error) throw result.error;
  }

  return data;
}
export async function excluirMostruario(id) { const tid = tenantId(); const { error } = await supabase.from('mostruarios').delete().eq('tenant_id', tid).eq('id', id); if (error) throw error; }

export async function salvarAcerto(payload) {
  const tid = tenantId();
  const { data, error } = await supabase.from('acertos').insert({ ...payload, tenant_id: tid }).select().single();
  if (error) throw error;
  return data;
}
export async function listarAcertos() { const tid = tenantId(); const { data, error } = await supabase.from('acertos').select('*, vendedoras(*)').eq('tenant_id', tid).order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function editarAcerto(id, payload) { const tid = tenantId(); const { data, error } = await supabase.from('acertos').update(payload).eq('tenant_id', tid).eq('id', id).select().single(); if (error) throw error; return data; }
export async function excluirAcerto(id) { const tid = tenantId(); const { error } = await supabase.from('acertos').delete().eq('tenant_id', tid).eq('id', id); if (error) throw error; }

export async function finalizarAcertoMostruario(mostruario) {
  ensure();
  return salvarMostruario({ id: mostruario.id, numero: mostruario.numero, vendedora_id: null,
    data_envio: mostruario.data_envio, data_acerto: new Date().toISOString().slice(0, 10),
    itens: (mostruario.mostruario_itens || []).map(item => ({ produto_id: item.produto_id, quantidade: item.quantidade })) });
}

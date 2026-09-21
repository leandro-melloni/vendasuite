import { supabase, supabaseConfigured } from '../lib/supabaseClient.js';

function ensure() { if (!supabaseConfigured) throw new Error('Supabase não configurado. Preencha o arquivo .env.'); }

export async function listarVendedoras() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('vendedoras').select('*').order('codigo'); if (error) throw error; return data || []; }
export async function buscarVendedoraPorCodigo(codigo) { if (!supabaseConfigured || !codigo) return null; const { data, error } = await supabase.from('vendedoras').select('*').eq('codigo', codigo).maybeSingle(); if (error) throw error; return data; }
export async function salvarVendedora(payload) { ensure(); const { id, ...dados } = payload; const q = id ? supabase.from('vendedoras').update(dados).eq('id', id) : supabase.from('vendedoras').insert(dados); const { data, error } = await q.select().single(); if (error) throw error; return data; }
export async function excluirVendedora(id) { ensure(); const { error } = await supabase.from('vendedoras').delete().eq('id', id); if (error) throw error; }


export async function carregarValoresMetais() {
  if (!supabaseConfigured) return { valor_ouro: 0, valor_prata: 0 };
  const { data, error } = await supabase.from('configuracoes_metais').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data || { valor_ouro: 0, valor_prata: 0 };
}
export async function salvarValoresMetais(valorOuro, valorPrata) {
  ensure();
  const { data, error } = await supabase.from('configuracoes_metais').upsert({ id: 1, valor_ouro: valorOuro, valor_prata: valorPrata, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return data;
}

export async function recalcularPrecosProdutos(valorOuro, valorPrata) {
  ensure();
  const { data: produtos, error } = await supabase.from('produtos').select('id, tipo, categoria, quoficiente');
  if (error) throw error;

  const atualizacoes = (produtos || []).map((produto) => {
    const tipo = produto.tipo || produto.categoria;
    const valorMetal = tipo === 'ouro' ? Number(valorOuro || 0) : tipo === 'prata' ? Number(valorPrata || 0) : 0;
    const preco = valorMetal > 0 && Number(produto.quoficiente || 0) > 0
      ? Math.round(valorMetal * Number(produto.quoficiente))
      : 0;
    return supabase.from('produtos').update({ preco }).eq('id', produto.id);
  });

  const resultados = await Promise.all(atualizacoes);
  const falha = resultados.find((resultado) => resultado.error);
  if (falha?.error) throw falha.error;
  return resultados.length;
}

export async function listarProdutos() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('produtos').select('*').order('codigo'); if (error) throw error; return data || []; }
export async function buscarProdutoPorCodigo(codigo) { if (!supabaseConfigured || !codigo) return null; const { data, error } = await supabase.from('produtos').select('*').eq('codigo', codigo).maybeSingle(); if (error) throw error; return data; }
export async function buscarProdutosPorPrefixo(prefixo) { if (!supabaseConfigured || !prefixo) return []; const { data, error } = await supabase.from('produtos').select('*').ilike('codigo', `${prefixo}%`).order('codigo').limit(10); if (error) throw error; return data || []; }
export async function salvarProduto(payload) { ensure(); const { id, ...dados } = payload; const q = id ? supabase.from('produtos').update(dados).eq('id', id) : supabase.from('produtos').insert(dados); const { data, error } = await q.select().single(); if (error) throw error; return data; }
export async function excluirProduto(id) { ensure(); const { error } = await supabase.from('produtos').delete().eq('id', id); if (error) throw error; }
export async function uploadImagemProduto(file) { ensure(); if (!file) return null; const ext = (file.name.split('.').pop() || 'png').toLowerCase(); const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`; const { error } = await supabase.storage.from('produtos').upload(path, file, { upsert: false }); if (error) throw error; const { data } = supabase.storage.from('produtos').getPublicUrl(path); return data.publicUrl; }

export async function listarMostruarios() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function listarMostruariosDisponiveis() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').eq('status', 'disponivel').order('numero'); if (error) throw error; return data || []; }
export async function listarMostruariosAlocados() { if (!supabaseConfigured) return []; const { data, error } = await supabase.from('mostruarios').select('*, vendedoras(*), mostruario_itens(*, produtos(*))').eq('status', 'alocado').order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function salvarMostruario(payload) {
  ensure();
  const { id, itens = [], ...mostruario } = payload;

  // Determina status automaticamente: alocado se tiver vendedora, disponivel caso contrário
  const status = mostruario.vendedora_id ? 'alocado' : 'disponivel';
  const dadosMostruario = { ...mostruario, status };

  const query = id
    ? supabase.from('mostruarios').update(dadosMostruario).eq('id', id)
    : supabase.from('mostruarios').insert(dadosMostruario);

  const { data, error } = await query.select().single();
  if (error) throw error;

  if (id) {
    const del = await supabase.from('mostruario_itens').delete().eq('mostruario_id', id);
    if (del.error) throw del.error;
  }

  if (itens.length) {
    const rows = itens.map(item => ({
      mostruario_id: data.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade
    }));
    const result = await supabase.from('mostruario_itens').insert(rows);
    if (result.error) throw result.error;
  }

  return data;
}
export async function excluirMostruario(id) { ensure(); const { error } = await supabase.from('mostruarios').delete().eq('id', id); if (error) throw error; }

export async function salvarAcerto(payload) {
  ensure();
  const { data, error } = await supabase.from('acertos').insert(payload).select().single();
  if (error) throw error;
  return data;
}
export async function listarAcertos() { ensure(); const { data, error } = await supabase.from('acertos').select('*, vendedoras(*)').order('created_at', { ascending: false }); if (error) throw error; return data || []; }
export async function editarAcerto(id, payload) { ensure(); const { data, error } = await supabase.from('acertos').update(payload).eq('id', id).select().single(); if (error) throw error; return data; }
export async function excluirAcerto(id) { ensure(); const { error } = await supabase.from('acertos').delete().eq('id', id); if (error) throw error; }

export async function finalizarAcertoMostruario(mostruario) {
  ensure();
  return salvarMostruario({ id: mostruario.id, numero: mostruario.numero, vendedora_id: null,
    data_envio: mostruario.data_envio, data_acerto: new Date().toISOString().slice(0, 10),
    itens: (mostruario.mostruario_itens || []).map(item => ({ produto_id: item.produto_id, quantidade: item.quantidade })) });
}

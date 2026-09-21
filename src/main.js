import './style.css';
import { supabase, supabaseConfigured } from './lib/supabaseClient.js';
import {
  listarMostruarios, listarMostruariosDisponiveis, listarMostruariosAlocados,
  salvarMostruario, excluirMostruario,
  buscarVendedoraPorCodigo, listarVendedoras, salvarVendedora, excluirVendedora,
  listarProdutos, buscarProdutoPorCodigo, buscarProdutosPorPrefixo, salvarProduto, excluirProduto, carregarValoresMetais, salvarValoresMetais, recalcularPrecosProdutos, salvarAcerto, listarAcertos, editarAcerto, excluirAcerto
  , definirTenantAtual
} from './services/api.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let produtos = [];
let vendedoras = [];
let mostruarios = [];
let draftProdutos = [];
let acertoItens = [];
let pagamentosAcerto = [{ forma: 'Pix', valor: 0 }];
let acertoEmEdicao = null;
let acertosHistorico = [];
let mostruarioAtual = null;
let valoresMetais = { valor_ouro: 0, valor_prata: 0 };
let paginaProdutos = 1;
let itensPorPaginaProdutos = 10;
let abaAtivaMostruario = 'disponivel'; // 'disponivel' | 'alocado'
let sessaoAtual = null;
let perfilAtual = null;
let tenantAtual = null;
const parametrosIniciais = new URLSearchParams(location.search);
const acessoPorConvite = /(?:[?#&])type=invite(?:&|$)/.test(location.href) || parametrosIniciais.has('code');
const slugDoCaminho = decodeURIComponent(location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
const tenantSolicitado = only(parametrosIniciais.get('tenant') || (slugDoCaminho !== 'index.html' ? slugDoCaminho : '')).toLowerCase();

function only(v){ return (v ?? '').toString().trim(); }

// --- Máscaras de formatação ---
function mascaraCpf(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function mascaraCelular(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0,2)})${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)})${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)})${d.slice(2,7)}-${d.slice(7)}`;
}

function mascaraCep(v) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

async function buscarCep(cep) {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.erro) return;
    if ($('vendedoraEndereco') && data.logradouro) $('vendedoraEndereco').value = data.logradouro;
    if ($('vendedoraBairro') && data.bairro) $('vendedoraBairro').value = data.bairro;
    // Foca no campo Número após preencher
    setTimeout(() => { $('vendedoraNumero')?.focus(); }, 50);
  } catch(e) { console.warn('Erro ao buscar CEP:', e); }
}
function money(v){ return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function html(v){ return (v ?? '').toString().replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
function hoje(){ return new Date().toLocaleDateString('pt-BR'); }
function brToIso(v){
  const raw = only(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const n = raw.replace(/\D/g,'');
  return n.length === 8 ? `${n.slice(4)}-${n.slice(2,4)}-${n.slice(0,2)}` : null;
}
function isoToBr(v){ if(!v) return ''; const [a,m,d] = v.split('-'); return d && m && a ? `${d}/${m}/${a}` : v; }
function n(v){ return Number(String(v || '0').replace(/\./g,'').replace(',','.')) || 0; }
function msgConfig(cols, texto){ return `<tr><td colspan="${cols}" class="empty-table">${texto}</td></tr>`; }
function setStatus(){ const el = $('supabaseStatus'); if(el) el.textContent = supabaseConfigured ? 'Supabase configurado.' : 'Supabase ainda não configurado. Preencha o arquivo .env.'; }
function linkDoTenant(slug){
  return new URL(`/${encodeURIComponent(slug)}`, location.origin).toString();
}

function showScreen(targetId){
  if(!sessaoAtual) return;
  if(targetId === 'acerto' && perfilAtual !== 'administracao') return;
  if(targetId === 'tenants-admin' && !ehSuperadmin()) return;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === targetId));
  if(targetId === 'mostruario') carregarMostruarios();
  if(targetId === 'vendedoras') carregarVendedoras();
  if(targetId === 'estoque') { carregarProdutos(); carregarConfiguracaoMetais(); }
  if(targetId === 'acerto') carregarAcertoBase();
  if(targetId === 'configuracoes' && perfilAtual === 'administracao') carregarUsuarios();
  if(targetId === 'tenants-admin') carregarTenants();
}

const nomesPerfis = { administracao:'Administração', escrita:'Escrita', leitura:'Leitura' };
function ehSuperadmin(){ return perfilAtual === 'administracao' && tenantAtual?.slug?.toLowerCase() === 'vendasuite'; }

function mensagemAutenticacao(error, contexto='operacao'){
  const texto=String(error?.message || error || '').toLowerCase();
  if(texto.includes('invalid login credentials')) return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
  if(texto.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado. Abra o convite recebido e crie sua senha.';
  if(texto.includes('rate limit') || texto.includes('too many')) return 'O limite de envio de e-mails foi atingido. Aguarde a liberação ou configure um SMTP próprio no Supabase.';
  if(texto.includes('password') && texto.includes('characters')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if(texto.includes('network') || texto.includes('fetch')) return 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.';
  if(contexto === 'convite') return 'Não foi possível enviar o convite. Confira o e-mail e tente novamente.';
  if(contexto === 'exclusao') return 'Não foi possível excluir este usuário. Atualize a página e tente novamente.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}

async function mensagemErroFuncao(error, data, contexto){
  if(data?.error) return data.error;
  try{
    const resposta = error?.context;
    if(resposta && typeof resposta.json === 'function'){
      const payload = await resposta.json();
      if(payload?.error) return payload.error;
    }
  }catch(_erro){}
  return mensagemAutenticacao(error, contexto);
}

function mostrarLogin(mensagem=''){
  $('authGate').classList.remove('hidden');
  $('appShell').classList.add('auth-pending');
  $('loginMensagem').textContent = mensagem;
  setTimeout(() => $('loginEmail')?.focus(), 50);
}

function mostrarCriacaoSenha(){
  $('loginForm').hidden=true;
  $('primeiroAcessoForm').hidden=false;
  $('authGate').classList.remove('hidden');
  $('appShell').classList.add('auth-pending');
  setTimeout(() => $('novaSenha')?.focus(), 50);
}

function aplicarPerfil(){
  const perfil = perfilAtual || 'leitura';
  document.body.dataset.perfil = perfil;
  $('usuarioAtualEmail').textContent = sessaoAtual?.user?.email || '—';
  $('usuarioAtualPerfil').textContent = nomesPerfis[perfil] || perfil;
  if($('usuarioAtualTenant')) $('usuarioAtualTenant').textContent = tenantAtual?.nome || tenantAtual?.slug || '—';
  $('adminUsuarios').hidden = perfil !== 'administracao';
  document.querySelector('[data-target="configuracoes"]')?.classList.toggle('admin-only-hidden', perfil !== 'administracao');
  document.querySelector('[data-target="acerto"]')?.classList.toggle('admin-only-hidden', perfil !== 'administracao');
  $('menuTenantsAdmin')?.classList.toggle('admin-only-hidden', !ehSuperadmin());
}

async function abrirAplicacao(session){
  sessaoAtual = session;
  const { data, error } = await supabase.from('perfis').select('perfil,tenant_id').eq('id', session.user.id).single();
  if(error || !data){
    await supabase.auth.signOut();
    mostrarLogin('Seu usuário ainda não possui um perfil de acesso. Fale com o administrador.');
    return;
  }
  if(!data.tenant_id){
    await supabase.auth.signOut();
    mostrarLogin('Seu usuário ainda não está vinculado a um tenant. Fale com o administrador.');
    return;
  }
  const { data: tenant, error: tenantError } = await supabase.from('tenants').select('*').eq('id', data.tenant_id).eq('ativo', true).single();
  if(tenantError || !tenant){
    await supabase.auth.signOut();
    mostrarLogin('O acesso deste tenant está desativado. Fale com o administrador da plataforma.');
    return;
  }
  if(tenantSolicitado && tenant.slug?.toLowerCase() !== tenantSolicitado){
    await supabase.auth.signOut();
    mostrarLogin(`Este link é exclusivo do tenant ${tenantSolicitado}. Seu usuário pertence a outro tenant.`);
    return;
  }
  perfilAtual = data.perfil;
  tenantAtual = tenant;
  definirTenantAtual(tenant.id);
  document.body.dataset.tenant = tenant.slug || '';
  aplicarPerfil();
  $('authGate').classList.add('hidden');
  $('appShell').classList.remove('auth-pending');
  showScreen('home');
}

async function carregarUsuarios(){
  if(perfilAtual !== 'administracao') return;
  const tbody = $('usuariosTabelaBody');
  tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
  const { data, error } = await supabase.from('perfis').select('id,email,perfil,created_at').eq('tenant_id', tenantAtual.id).order('email');
  if(error){ tbody.innerHTML = '<tr><td colspan="4">Não foi possível carregar os usuários. Atualize a página e tente novamente.</td></tr>'; return; }
  tbody.innerHTML = data.map(usuario => `<tr><td>${html(usuario.email)}</td><td><select class="field-select" data-perfil-usuario="${usuario.id}" ${usuario.id === sessaoAtual.user.id ? 'disabled title="Seu próprio perfil não pode ser alterado aqui"' : ''}>${Object.entries(nomesPerfis).map(([valor,nome]) => `<option value="${valor}" ${usuario.perfil===valor?'selected':''}>${nome}</option>`).join('')}</select></td><td>${new Date(usuario.created_at).toLocaleDateString('pt-BR')}</td><td>${usuario.id === sessaoAtual.user.id ? '<span class="current-user-label">Usuário atual</span>' : `<button type="button" class="mini-btn danger" data-excluir-usuario="${usuario.id}" data-email-usuario="${html(usuario.email)}">Excluir</button>`}</td></tr>`).join('');
}

function limparTenantForm(){
  $('tenantId').value=''; $('tenantNome').value=''; $('tenantSlug').value='';
  $('btnCancelarTenant').hidden=true; $('tenantMensagem').textContent='';
}

async function carregarTenants(){
  if(!ehSuperadmin()) return;
  const tbody=$('tenantsTabelaBody');
  tbody.innerHTML='<tr><td colspan="6">Carregando...</td></tr>';
  const { data, error }=await supabase.from('tenants').select('*').order('nome');
  if(error){ tbody.innerHTML=`<tr><td colspan="6">Erro ao carregar tenants: ${html(error.message)}</td></tr>`; return; }
  tbody.innerHTML=(data||[]).map(t=>{
    const possuiAtivo=Object.prototype.hasOwnProperty.call(t,'ativo');
    const ativo=!possuiAtivo || t.ativo !== false;
    const link=linkDoTenant(t.slug);
    return `<tr><td>${html(t.nome||t.slug)}</td><td>${html(t.slug)}</td><td><button class="mini-btn" data-copiar-link-tenant="${html(link)}">Copiar link</button> <a class="mini-btn" href="${html(link)}" target="_blank" rel="noopener">Abrir</a></td><td>${ativo?'Ativo':'Inativo'}</td><td>${t.created_at?new Date(t.created_at).toLocaleDateString('pt-BR'):'—'}</td><td><button class="mini-btn" data-editar-tenant="${t.id}" data-tenant-nome="${html(t.nome||'')}" data-tenant-slug="${html(t.slug||'')}">Editar</button>${possuiAtivo?` <button class="mini-btn ${ativo?'danger':''}" data-status-tenant="${t.id}" data-tenant-ativo="${ativo}">${ativo?'Desativar':'Ativar'}</button>`:''}</td></tr>`;
  }).join('') || '<tr><td colspan="6">Nenhum tenant cadastrado.</td></tr>';
}

async function iniciarAutenticacao(){
  if(!supabaseConfigured){ mostrarLogin('Configure o Supabase no arquivo .env para entrar.'); return; }
  const { data: { session } } = await supabase.auth.getSession();
  const senhaPendente = session?.user?.user_metadata?.senha_pendente === true;
  if(session && (acessoPorConvite || senhaPendente)){
    mostrarCriacaoSenha();
  } else if(session) await abrirAplicacao(session); else mostrarLogin();
  supabase.auth.onAuthStateChange((evento, novaSessao) => {
    if(evento === 'SIGNED_OUT'){
      sessaoAtual = null; perfilAtual = null; tenantAtual = null; definirTenantAtual(null); mostrarLogin();
    }
    if(evento === 'SIGNED_IN' && novaSessao &&
      (acessoPorConvite || novaSessao.user.user_metadata?.senha_pendente === true)){
      mostrarCriacaoSenha();
    }
  });
}

function filtrar(rows, termo, campos){ const t = only(termo).toLowerCase(); if(!t) return rows; return rows.filter(r => campos.some(c => only(c(r)).toLowerCase().includes(t))); }

async function carregarConfiguracaoMetais(){
  if(!supabaseConfigured) return;
  try{
    valoresMetais = await carregarValoresMetais();
    if($('valorOuro')) $('valorOuro').value = Number(valoresMetais.valor_ouro || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
    if($('valorPrata')) $('valorPrata').value = Number(valoresMetais.valor_prata || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
    atualizarPrecoCalculado();
  }catch(e){ console.error('Erro ao carregar valores dos metais:', e); }
}

function obterValorMetal(tipo){
  return tipo === 'ouro' ? Number(valoresMetais.valor_ouro || 0) : tipo === 'prata' ? Number(valoresMetais.valor_prata || 0) : 0;
}

// Todo preço fracionado é arredondado para o próximo real inteiro.
function calcularPrecoProduto(tipo, quoficiente){
  const valorBruto = obterValorMetal(tipo) * Number(quoficiente || 0);
  return valorBruto > 0 ? Math.round(valorBruto) : 0;
}

function limitarQuoficiente(campo){
  if(!campo) return;
  let valor = campo.value.replace(/[^0-9,]/g, '');
  const partes = valor.split(',');
  valor = partes[0] + (partes.length > 1 ? ',' + partes.slice(1).join('').slice(0, 5) : '');
  campo.value = valor;
}

function atualizarPrecoCalculado(){
  const tipo = only($('produtoTipo')?.value);
  const quoficiente = n($('produtoQuoficiente')?.value);
  const valorMetal = obterValorMetal(tipo);
  const preco = calcularPrecoProduto(tipo, quoficiente);
  if($('produtoPrecoCalculado')) $('produtoPrecoCalculado').textContent = money(preco);
  if($('produtoCalculoDetalhe')) $('produtoCalculoDetalhe').textContent = tipo && quoficiente
    ? `${money(valorMetal)} × ${quoficiente.toLocaleString('pt-BR', { minimumFractionDigits:5, maximumFractionDigits:5 })}`
    : 'Selecione o tipo e informe o quoficiente.';
  return preco;
}

function produtosFiltrados(){
  const termo = $('buscaProduto')?.value;
  const filtro = $('filtroProduto')?.value || 'todos';
  const camposPorFiltro = {
    codigo: [p=>p.codigo],
    descricao: [p=>p.descricao],
    tipo: [p=>p.tipo || p.categoria],
    quoficiente: [p=>p.quoficiente],
    preco: [p=>p.preco],
    dataInclusao: [p=>isoToBr((p.updated_at || p.created_at || '').slice(0,10))]
  };
  const campos = camposPorFiltro[filtro] || [p=>p.codigo,p=>p.descricao,p=>p.tipo || p.categoria,p=>p.quoficiente,p=>p.preco,p=>isoToBr((p.updated_at || p.created_at || '').slice(0,10))];
  return filtrar(produtos, termo, campos);
}

function renderizarProdutos(){
  const tbody = $('produtoTabelaBody'); if(!tbody) return;
  const tableWrap = tbody.closest('.produto-table-wrap');
  if(tableWrap){
    tableWrap.classList.toggle('sem-scroll-vertical', itensPorPaginaProdutos <= 10);
    tableWrap.classList.toggle('com-scroll-vertical', itensPorPaginaProdutos > 10);
    tableWrap.style.maxHeight = '';
  }
  const rows = produtosFiltrados();
  const totalItens = rows.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / itensPorPaginaProdutos));
  paginaProdutos = Math.min(Math.max(1, paginaProdutos), totalPaginas);
  const inicio = (paginaProdutos - 1) * itensPorPaginaProdutos;
  const pagina = rows.slice(inicio, inicio + itensPorPaginaProdutos);

  if(!pagina.length){
    tbody.innerHTML = msgConfig(7, 'Nenhum produto cadastrado');
  } else {
    tbody.innerHTML = pagina.map(p => `
      <tr>
        <td>${html(p.codigo)}</td><td>${html(p.descricao)}</td><td>${html(p.tipo || p.categoria || '')}</td><td>${Number(p.quoficiente || 0).toLocaleString('pt-BR', { minimumFractionDigits:5, maximumFractionDigits:5 })}</td><td>${money(p.preco)}</td><td>${isoToBr((p.updated_at || p.created_at || '').slice(0,10)) || html(p.data || '')}</td>
        <td class="acoes-cell"><button class="mini-btn" data-editar-produto="${p.id}">Editar</button><button class="mini-btn danger" data-excluir-produto="${p.id}">Excluir</button></td>
      </tr>`).join('');
  }

  const primeiro = totalItens ? inicio + 1 : 0;
  const ultimo = Math.min(inicio + itensPorPaginaProdutos, totalItens);
  if($('produtoPaginacaoInfo')) $('produtoPaginacaoInfo').textContent = totalItens ? `Exibindo ${primeiro}–${ultimo} de ${totalItens}` : 'Nenhum item';
  if($('produtoPaginaAtual')) $('produtoPaginaAtual').textContent = `Página ${paginaProdutos} de ${totalPaginas}`;
  if($('produtoPaginaAnterior')) $('produtoPaginaAnterior').disabled = paginaProdutos <= 1;
  if($('produtoProximaPagina')) $('produtoProximaPagina').disabled = paginaProdutos >= totalPaginas;

  // Ao selecionar 20, 50 ou 100, mantém exatamente a área de 10 linhas visíveis.
  // Os registros restantes ficam acessíveis pela rolagem interna da tabela.
  if(tableWrap && itensPorPaginaProdutos > 10){
    requestAnimationFrame(() => {
      const linhas = [...tbody.querySelectorAll('tr')];
      const decimaLinha = linhas[Math.min(9, linhas.length - 1)];
      if(!decimaLinha) return;
      const wrapTopo = tableWrap.getBoundingClientRect().top;
      const linhaFim = decimaLinha.getBoundingClientRect().bottom;
      const alturaBarraHorizontal = tableWrap.scrollWidth > tableWrap.clientWidth ? 16 : 0;
      tableWrap.style.maxHeight = `${Math.ceil(linhaFim - wrapTopo + alturaBarraHorizontal + 2)}px`;
    });
  }
}

async function carregarProdutos(){
  const tbody = $('produtoTabelaBody'); if(!tbody) return;
  try{
    if(!supabaseConfigured){ tbody.innerHTML = msgConfig(7, 'Configure o Supabase para carregar os produtos.'); return; }
    produtos = await listarProdutos();
    renderizarProdutos();
  }catch(e){ tbody.innerHTML = msgConfig(7, 'Não foi possível conectar ao Supabase. Confira o .env, execute a atualização SQL e confira as policies.'); console.error(e); }
}

function limparProduto(){ ['produtoId','produtoCodigo','produtoDescricao','produtoTipo','produtoQuoficiente'].forEach(id=>{ if($(id)) $(id).value=''; }); if($('produtoData')) $('produtoData').value = hoje(); atualizarPrecoCalculado(); }
function mostrarMensagemProduto(texto, tipo='sucesso'){
  const aviso = $('produtoMensagem');
  if(!aviso) return;
  aviso.textContent = texto;
  aviso.className = `form-message ${tipo} visivel`;
  clearTimeout(mostrarMensagemProduto.timer);
  mostrarMensagemProduto.timer = setTimeout(() => aviso.classList.remove('visivel'), 4000);
}
function editarProduto(id){ const p = produtos.find(x=>x.id===id); if(!p) return; $('produtoId').value=p.id; $('produtoCodigo').value=(p.codigo||'').toUpperCase(); $('produtoDescricao').value=p.descricao||''; $('produtoTipo').value=p.tipo || p.categoria || ''; $('produtoQuoficiente').value=String(p.quoficiente ?? '').replace('.', ','); $('produtoData').value=isoToBr((p.updated_at || p.created_at || '').slice(0,10)) || p.data || hoje(); showScreen('produto-cadastro'); atualizarPrecoCalculado(); }
async function salvarFormProduto(){
  try{
    const codigo = only($('produtoCodigo').value).toUpperCase();
    if(codigo.length !== 5) return alert('O código do produto deve conter exatamente 5 caracteres, por exemplo: BR033.');
    const tipo = only($('produtoTipo').value);
    if(!tipo) return alert('Selecione o tipo do produto: ouro ou prata.');
    const quoficiente = n($('produtoQuoficiente').value);
    if(quoficiente <= 0) return alert('Informe um quoficiente maior que zero.');
    const preco = calcularPrecoProduto(tipo, quoficiente);
    await salvarProduto({ id: only($('produtoId')?.value) || undefined, codigo, descricao: only($('produtoDescricao').value), tipo, categoria: tipo, quoficiente, preco, ativo: true });
    limparProduto();
    await carregarProdutos();
    mostrarMensagemProduto('Produto salvo com sucesso!');
    setTimeout(() => {
      const campoCodigo = $('produtoCodigo');
      campoCodigo?.focus();
      campoCodigo?.select();
    }, 50);
  }catch(e){ alert(`Erro ao salvar produto: ${e.message}`); }
}

function valorDataMostruario(m){
  return m?.data_acerto || m?.data_envio || (m?.created_at || '').slice(0, 10) || '';
}

function compararDatasDesc(a, b){
  return valorDataMostruario(b).localeCompare(valorDataMostruario(a));
}

function datasAcertoDaVendedora(vendedora){
  const vinculados = mostruarios
    .filter(m => m.vendedora_id === vendedora.id || m.vendedoras?.id === vendedora.id || String(m.vendedoras?.codigo || '') === String(vendedora.codigo || ''))
    .sort(compararDatasDesc);

  if(!vinculados.length){
    return {
      ultimo: vendedora.ultimo || '',
      proximo: vendedora.proximo || ''
    };
  }

  const ultimoMostruario = vinculados.find(m => m.data_envio || m.data_acerto) || vinculados[0];
  return {
    ultimo: ultimoMostruario?.data_envio || vendedora.ultimo || '',
    proximo: ultimoMostruario?.data_acerto || vendedora.proximo || ''
  };
}

async function carregarVendedoras(){
  const tbody = $('vendedoraTabelaBody'); if(!tbody) return;
  try{
    if(!supabaseConfigured){ tbody.innerHTML = msgConfig(5, 'Configure o Supabase para carregar as vendedoras.'); return; }
    const [listaVendedoras, listaMostruarios] = await Promise.all([listarVendedoras(), listarMostruarios()]);
    mostruarios = listaMostruarios || [];
    vendedoras = (listaVendedoras || []).map(v => ({ ...v, ...datasAcertoDaVendedora(v) }));
    const rows = filtrar(vendedoras, $('buscaVendedora')?.value, [v=>v.codigo,v=>v.nome,v=>isoToBr(v.ultimo),v=>isoToBr(v.proximo)]);
    if(!rows.length){ tbody.innerHTML = msgConfig(5, 'Nenhuma vendedora cadastrada'); return; }
    tbody.innerHTML = rows.map(v => `<tr><td>${html(v.codigo)}</td><td>${html(v.nome)}</td><td>${html(isoToBr(v.ultimo) || '--')}</td><td>${html(isoToBr(v.proximo) || '--')}</td><td class="acoes-cell"><button class="mini-btn" data-editar-vendedora="${v.id}">Editar</button><button class="mini-btn danger" data-excluir-vendedora="${v.id}">Excluir</button></td></tr>`).join('');
  }catch(e){ tbody.innerHTML = msgConfig(5, 'Não foi possível conectar ao Supabase. Confira o .env e as policies.'); console.error(e); }
}

function limparVendedora(){ ['vendedoraId','vendedoraCodigo','vendedoraNome','vendedoraCpf','vendedoraCep','vendedoraEndereco','vendedoraNumero','vendedoraComplemento','vendedoraBairro','vendedoraCelular','vendedoraUltimoAcerto','vendedoraProximoAcerto'].forEach(id=>{ if($(id)) $(id).value=''; }); }
function editarVendedora(id){ const v = vendedoras.find(x=>x.id===id); if(!v) return; $('vendedoraId').value=v.id; $('vendedoraCodigo').value=v.codigo||''; $('vendedoraNome').value=v.nome||''; $('vendedoraCpf').value=mascaraCpf(v.cpf||''); $('vendedoraCep').value=mascaraCep(v.cep||''); $('vendedoraEndereco').value=v.endereco||''; $('vendedoraNumero').value=v.numero||''; $('vendedoraComplemento').value=v.complemento||''; $('vendedoraBairro').value=v.bairro||''; $('vendedoraCelular').value=mascaraCelular(v.celular||''); $('vendedoraUltimoAcerto').value=isoToBr(v.ultimo)||'--'; $('vendedoraProximoAcerto').value=isoToBr(v.proximo)||'--'; showScreen('vendedora-cadastro'); }
async function salvarFormVendedora(){
  try{
    await salvarVendedora({ id: only($('vendedoraId')?.value) || undefined, codigo: only($('vendedoraCodigo').value), nome: only($('vendedoraNome').value), cpf: only($('vendedoraCpf').value), cep: only($('vendedoraCep').value), endereco: only($('vendedoraEndereco').value), numero: only($('vendedoraNumero').value), complemento: only($('vendedoraComplemento').value), bairro: only($('vendedoraBairro').value), celular: only($('vendedoraCelular').value), ultimo: only($('vendedoraUltimoAcerto').value), proximo: only($('vendedoraProximoAcerto').value) });
    limparVendedora(); await carregarVendedoras(); showScreen('vendedoras');
  }catch(e){ alert(`Erro ao salvar vendedora: ${e.message}`); }
}

async function carregarMostruarios(){
  const tbody = $('mostruarioTabelaBody'); if(!tbody) return;
  try{
    if(!supabaseConfigured){ tbody.innerHTML = msgConfig(7, 'Configure o Supabase para carregar os mostruários.'); return; }

    // Carrega as duas listas para atualizar badges
    const [disponiveis, alocados] = await Promise.all([
      listarMostruariosDisponiveis(),
      listarMostruariosAlocados()
    ]);

    // Atualiza badges das abas
    const badgeDisp = $('badgeMostruarioDisponivel');
    const badgeAloc = $('badgeMostruarioAlocado');
    if(badgeDisp) badgeDisp.textContent = disponiveis.length;
    if(badgeAloc) badgeAloc.textContent = alocados.length;

    const lista = abaAtivaMostruario === 'disponivel' ? disponiveis : alocados;
    mostruarios = [...disponiveis, ...alocados]; // mantém pool completo para acerto

    const rows = filtrar(lista, $('buscaMostruario')?.value, [
      m => m.numero,
      m => m.vendedoras?.codigo,
      m => m.vendedoras?.nome,
      m => isoToBr(m.data_envio),
      m => isoToBr(m.data_acerto)
    ]);

    if(!rows.length){
      const msg = abaAtivaMostruario === 'disponivel'
        ? 'Nenhum mostruário disponível. Clique em NOVO MOSTRUÁRIO para cadastrar.'
        : 'Nenhum mostruário alocado.';
      tbody.innerHTML = msgConfig(7, msg);
      return;
    }

    tbody.innerHTML = rows.map(m => {
      const total = (m.mostruario_itens || []).reduce((s,i) => s + Number(i.quantidade||0) * Number(i.produtos?.preco || 0), 0);
      const statusBadge = m.vendedoras
        ? `<span class="badge badge-alocado">Alocado</span>`
        : `<span class="badge badge-disponivel">Disponível</span>`;
      const btnAlocarOuDesalocar = m.vendedoras
        ? `<button class="mini-btn warning" data-desalocar-mostruario="${m.id}">Desalocar</button>`
        : `<button class="mini-btn success" data-alocar-mostruario="${m.id}">Alocar</button>`;

      return `<tr>
        <td>${html(m.numero)} ${statusBadge}</td>
        <td>${html(m.vendedoras?.codigo || '--')}</td>
        <td>${html(m.vendedoras?.nome || '--')}</td>
        <td>${money(total)}</td>
        <td>${isoToBr(m.data_envio) || '--'}</td>
        <td>${isoToBr(m.data_acerto) || '--'}</td>
        <td class="acoes-cell">
          ${btnAlocarOuDesalocar}
          <button class="mini-btn" data-imprimir-mostruario="${m.id}">Imprimir</button>
          <button class="mini-btn" data-ver-mostruario="${m.id}">Editar</button>
          <button class="mini-btn danger" data-excluir-mostruario="${m.id}">Excluir</button>
        </td>
      </tr>`;
    }).join('');
  }catch(e){ tbody.innerHTML = msgConfig(7, 'Não foi possível conectar ao Supabase. Confira o .env e as policies.'); console.error(e); }
}

function limparMostruario(){ ['mostruarioId','numeroMostruario','codigoProduto','descricaoProduto','precoProdutoMostruario','qtdProduto'].forEach(id=>{ if($(id)) $(id).value=''; }); draftProdutos=[]; renderListaProdutos(); }
function renderListaProdutos(){ const box=$('listaProdutosContainer'); if(!box) return; if(!draftProdutos.length){ box.innerHTML='<div class="lista-vazia">Nenhum produto adicionado.</div>'; if($('totalMostruarioValor')) $('totalMostruarioValor').textContent=money(0); return; } let total=0; draftProdutos.sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo),'pt-BR',{numeric:true,sensitivity:'base'})); box.innerHTML=draftProdutos.map((p,i)=>{ total += p.quantidade * p.preco; return `<div class="lista-item"><span>${html(p.codigo)}</span><span>${html(p.descricao)}</span><input aria-label="Quantidade ${html(p.codigo)}" type="number" min="1" value="${Number(p.quantidade)||0}" data-editar-qtd-draft="${i}"><span>${money(p.preco)}</span><div class="produto-acoes"><button class="mini-btn danger" data-remover-produto-draft="${i}">Excluir</button></div></div>`; }).join(''); $('totalMostruarioValor').textContent=money(total); }
function editarMostruario(id){
  const m = mostruarios.find(x => x.id === id);
  if(!m) return;

  if($('mostruarioId')) $('mostruarioId').value = m.id || '';
  $('numeroMostruario').value = m.numero || '';

  draftProdutos = (m.mostruario_itens || []).map(item => ({
    produto_id: item.produto_id,
    codigo: item.produtos?.codigo || '',
    descricao: item.produtos?.descricao || '',
    preco: Number(item.produtos?.preco || 0),
    quantidade: Number(item.quantidade || 0)
  }));

  $('codigoProduto').value = '';
  $('descricaoProduto').value = '';
  $('precoProdutoMostruario').value = '';
  $('qtdProduto').value = '';
  renderListaProdutos();
  showScreen('mostruario-incluir');
}

async function salvarFormMostruario(){
  try{
    const numero = only($('numeroMostruario').value);
    if(!numero) return alert('Informe o número do mostruário.');

    const mExistente = mostruarios.find(x => x.id === only($('mostruarioId')?.value));

    await salvarMostruario({
      id: only($('mostruarioId')?.value) || undefined,
      numero,
      vendedora_id: mExistente?.vendedora_id || null,
      data_envio: mExistente?.data_envio || null,
      data_acerto: mExistente?.data_acerto || null,
      itens: draftProdutos.map(p=>({ produto_id:p.produto_id, quantidade:p.quantidade }))
    });

    limparMostruario(); await carregarMostruarios(); showScreen('mostruario');
  }catch(e){ alert(`Erro ao salvar mostruário: ${e.message}`); }
}

function abrirModalAlocar(id){
  const m = mostruarios.find(x => x.id === id);
  if(!m) return;
  if($('modalAlocarMostruarioId')) $('modalAlocarMostruarioId').value = m.id;
  if($('modalAlocarNumero')) $('modalAlocarNumero').textContent = m.numero || '--';
  if($('modalAlocarCodigoVendedora')) $('modalAlocarCodigoVendedora').value = m.vendedoras?.codigo || '';
  if($('modalAlocarNomeVendedora')) $('modalAlocarNomeVendedora').value = m.vendedoras?.nome || '';
  if($('modalAlocarDataUltimoAcerto')) $('modalAlocarDataUltimoAcerto').value = m.data_envio || new Date().toISOString().slice(0, 10);
  if($('modalAlocarDataProximoAcerto')) $('modalAlocarDataProximoAcerto').value = m.data_acerto || '';

  const modal = $('modalAlocar');
  if(modal) modal.style.display = 'flex';
  setTimeout(() => $('modalAlocarCodigoVendedora')?.focus(), 50);
}

function fecharModalAlocar(){
  const modal = $('modalAlocar');
  if(modal) modal.style.display = 'none';
}

async function confirmarAlocacaoModal(){
  try {
    const id = only($('modalAlocarMostruarioId')?.value);
    if(!id) return;
    const codigoVend = only($('modalAlocarCodigoVendedora')?.value);
    if(!codigoVend) return alert('Informe o código da vendedora.');
    const vendedora = await buscarVendedoraPorCodigo(codigoVend);
    if(!vendedora) return alert('Vendedora não encontrada com este código.');

    const dataUltimoRaw = $('modalAlocarDataUltimoAcerto')?.value;
    const dataProximoRaw = $('modalAlocarDataProximoAcerto')?.value;
    if(!dataUltimoRaw) return alert('A data de Último Acerto é obrigatória.');
    if(!dataProximoRaw) return alert('A data de Próximo Acerto é obrigatória.');

    const m = mostruarios.find(x => x.id === id);
    if(!m) return;

    await salvarMostruario({
      id: m.id,
      numero: m.numero,
      vendedora_id: vendedora.id,
      data_envio: brToIso(dataUltimoRaw),
      data_acerto: brToIso(dataProximoRaw),
      itens: (m.mostruario_itens || []).map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade }))
    });

    fecharModalAlocar();
    abaAtivaMostruario = 'alocado';
    // Atualiza abas visuais
    $$('.aba-mostruario').forEach(b => b.classList.toggle('aba-ativa', b.dataset.aba === 'alocado'));
    await carregarMostruarios();
  } catch(e) {
    alert(`Erro ao alocar vendedora: ${e.message}`);
  }
}

async function desalocarVendedora(id){
  try {
    const m = mostruarios.find(x => x.id === id);
    if(!m) return;
    if(!confirm(`Deseja desalocar a vendedora do mostruário Nº ${m.numero}?`)) return;

    await salvarMostruario({
      id: m.id,
      numero: m.numero,
      vendedora_id: null,
      data_envio: m.data_envio,
      data_acerto: m.data_acerto,
      itens: (m.mostruario_itens || []).map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade }))
    });

    abaAtivaMostruario = 'disponivel';
    $$('.aba-mostruario').forEach(b => b.classList.toggle('aba-ativa', b.dataset.aba === 'disponivel'));
    await carregarMostruarios();
  } catch(e) {
    alert(`Erro ao desalocar vendedora: ${e.message}`);
  }
}

function imprimirMostruario(){
  const numero = only($('numeroMostruario').value) || '--';
  
  // Tenta buscar informações do mostruário atual se estiver em edição
  const m = mostruarios.find(x => x.id === only($('mostruarioId')?.value));
  
  const temVendedora = !!m?.vendedoras;
  const codigoVend = m?.vendedoras?.codigo || '--';
  const nomeVend = m?.vendedoras?.nome || '--';
  const dataEnvio = m?.data_envio ? isoToBr(m.data_envio) : '--';
  const dataAcerto = m?.data_acerto ? isoToBr(m.data_acerto) : '--';

  let totalGeral = 0;
  const itensHtml = draftProdutos.length
    ? draftProdutos.map(p => {
        const subtotal = p.quantidade * p.preco;
        totalGeral += subtotal;
        return `
          <tr>
            <td>${html(p.codigo)}</td>
            <td>${html(p.descricao)}</td>
            <td style="text-align:center">${p.quantidade}</td>
            <td style="text-align:right">${money(p.preco)}</td>
            <td style="text-align:right">${money(subtotal)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#888">Nenhum produto adicionado.</td></tr>';

  const janela = window.open('', '_blank', 'width=850,height=700');
  if(!janela) return alert('Permita pop-ups para imprimir.');
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Mostruário ${html(numero)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; padding: 28px 36px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .subtitulo { font-size: 13px; color: #666; margin-bottom: 20px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px 24px; margin-bottom: 24px; background: #f5f5f5; padding: 14px 18px; border-radius: 8px; }
        .info-item label { display: block; font-size: 11px; color: #888; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
        .info-item span { font-size: 15px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        thead tr { background: #222; color: #fff; }
        th { padding: 9px 10px; text-align: left; font-size: 12px; }
        td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
        tbody tr:nth-child(even) { background: #fafafa; }
        .total-row { background: #222 !important; color: #fff; font-weight: 700; }
        .total-row td { border: none; padding: 10px 10px; }
        .rodape { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .assinatura { border-top: 1px solid #999; padding-top: 8px; text-align: center; font-size: 12px; color: #666; margin-top: 40px; }
        @media print { body { padding: 10px 16px; } }
      </style>
    </head>
    <body>
      <h1>WN Bijouterias — Mostruário Nº ${html(numero)}</h1>
      <p class="subtitulo">Emitido em: ${hoje()}</p>
      <div class="info-grid"${temVendedora ? '' : ' style="grid-template-columns: 1fr 1fr;"'}>
        <div class="info-item"><label>Nº Mostruário</label><span>${html(numero)}</span></div>
        <div class="info-item"><label>Cód. Vendedora</label><span>${html(codigoVend)}</span></div>
        ${temVendedora ? `
        <div class="info-item"><label>Último Acerto</label><span>${html(dataEnvio)}</span></div>
        <div class="info-item"><label>Próximo Acerto</label><span>${html(dataAcerto)}</span></div>
        ` : ''}
        <div class="info-item" style="grid-column:1/-1"><label>Vendedora</label><span>${html(nomeVend)}</span></div>
      </div>
      <table>
        <thead>
          <tr><th>Código</th><th>Descrição</th><th style="text-align:center">Qtd.</th><th style="text-align:right">Preço Unit.</th><th style="text-align:right">Subtotal</th></tr>
        </thead>
        <tbody>
          ${itensHtml}
          <tr class="total-row">
            <td colspan="4">TOTAL DO MOSTRUÁRIO</td>
            <td style="text-align:right">${money(totalGeral)}</td>
          </tr>
        </tbody>
      </table>
      <div class="rodape">
        <div class="assinatura">Assinatura do Responsável</div>
        <div class="assinatura">Assinatura da Vendedora</div>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
  setTimeout(() => { janela.focus(); janela.print(); }, 400);
}

async function carregarAcertoBase(){ if(supabaseConfigured) { mostruarios = await listarMostruarios(); await carregarHistoricoAcertos(); } }
async function carregarHistoricoAcertos(){if(!supabaseConfigured)return;try{acertosHistorico=await listarAcertos();const box=$('acertosHistoricoBody');if(!box)return;box.innerHTML=acertosHistorico.length?acertosHistorico.map(a=>`<tr><td>${isoToBr(a.data_acerto)||'--'}</td><td>${html(a.vendedoras?.codigo||'--')}</td><td>${html(a.vendedoras?.nome||'--')}</td><td>${money(a.valor_receber)}</td><td>${html(resumoPagamentos(a))}</td><td><button class="mini-btn" data-acerto-detalhes="${a.id}">Detalhes</button><button class="mini-btn" data-acerto-imprimir="${a.id}">Imprimir</button><button class="mini-btn" data-acerto-editar="${a.id}">Editar</button><button class="mini-btn danger" data-acerto-excluir="${a.id}">Excluir</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-table">Nenhum acerto realizado.</td></tr>';}catch(e){console.error(e);}}
function resumoPagamentos(a){const ps=a.pagamentos?.length?a.pagamentos:[{forma:a.forma_pagamento,valor:a.valor_receber}];return ps.filter(p=>Number(p.valor||0)>0).map(p=>`${html(p.forma)}: ${money(p.valor)}`).join('\n')||'--';}
function pagamentosDoAcerto(a){return (a.pagamentos?.length?a.pagamentos:[{forma:a.forma_pagamento,valor:a.valor_receber}]).filter(p=>Number(p.valor||0)>0);}
function pagamentosParaImpressao(pagamentos){return pagamentos.length?pagamentos.map(p=>`${html(p.forma||'--')}: ${money(p.valor)}`).join('<br>'):'--';}
function imprimirAcertoHistorico(a){const w=window.open('','_blank','width=800,height=600');if(!w)return;w.document.write(`<html lang="pt-BR"><meta charset="UTF-8"><title>Relatório de Acerto</title><body><h1>Acerto</h1><p>Data: ${isoToBr(a.data_acerto)}<br>Vendedora: ${html(a.vendedoras?.nome||'--')}<br>Total: ${money(a.valor_total)}<br>Comissão: ${money(a.valor_comissao)}<br>Valor a receber: ${money(a.valor_receber)}<br><strong>Formas de pagamento:</strong><br>${pagamentosParaImpressao(pagamentosDoAcerto(a))}</p></body></html>`);w.document.close();w.print();}
function abrirDetalhesAcerto(a){mostruarioAtual={id:a.mostruario_id,numero:a.mostruario_numero||'--',vendedoras:a.vendedoras};acertoItens=(a.itens||[]).map(i=>({...i,preco:Number(i.preco||0),valor:Number(i.valor||0),vendida:Number(i.vendida||0),retirada:Number(i.retirada||0),devolvida:Number(i.devolvida||0)}));$('acertoCodigoVendedora').value=a.vendedoras?.codigo||'';$('acertoNomeVendedora').value=a.vendedoras?.nome||'';$('acertoComissao').value=a.comissao_percentual||0;[...$$('[data-acerto-form="true"]')].forEach(x=>x.style.display='');$('acertosHistorico').style.display='none';const salvar=$('btnSalvarAcerto');if(salvar)salvar.style.display='none';renderAcerto();}
function carregarPagamentosNoFormulario(a,editavel=false){pagamentosAcerto=pagamentosDoAcerto(a).map(p=>({forma:p.forma||'',valor:Number(p.valor||0)}));const box=$('acertoPagamentosLista');if(box)box.innerHTML=pagamentosAcerto.map(p=>`<div class="pagamento-linha"><select class="field-select pagamento-forma"><option>${html(p.forma)}</option></select><input class="pagamento-valor" type="number" min="0" step="0.01" value="${p.valor.toFixed(2)}">${editavel?'<button type="button" class="btn light remover-pagamento">Remover</button>':''}</div>`).join('');}
function modoConsultaAcerto(a){acertoEmEdicao=null;abrirDetalhesAcerto(a);carregarPagamentosNoFormulario(a);$$('[data-acerto-form="true"] input,[data-acerto-form="true"] select').forEach(el=>el.disabled=true);}
function modoEdicaoAcerto(a){acertoEmEdicao=a;abrirDetalhesAcerto(a);carregarPagamentosNoFormulario(a,true);const salvar=$('btnSalvarAcerto');if(salvar)salvar.style.display='';$$('[data-acerto-form="true"] input,[data-acerto-form="true"] select').forEach(el=>{el.disabled=false;el.readOnly=false;});}
function gerarRelatorioAcertos(){const inicio=$('relatorioAcertoInicio').value,fim=$('relatorioAcertoFim').value;if(!inicio||!fim)return alert('Informe as duas datas.');if(inicio>fim)return alert('A data inicial não pode ser maior que a final.');const lista=acertosHistorico.filter(a=>a.data_acerto>=inicio&&a.data_acerto<=fim),total=lista.reduce((s,a)=>s+Number(a.valor_receber||0),0),w=window.open('','_blank','width=900,height=700');if(!w)return alert('Permita pop-ups para gerar o relatório.');w.document.write(`<html><meta charset="utf-8"><title>Relatório de pagamentos</title><style>body{font:14px Arial;padding:25px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style><h1>Relatório de pagamentos</h1><p>Período: ${isoToBr(inicio)} a ${isoToBr(fim)}</p><table><tr><th>Data</th><th>Vendedora</th><th>Pagamento</th><th>Valor recebido</th></tr>${lista.map(a=>`<tr><td>${isoToBr(a.data_acerto)}</td><td>${html(a.vendedoras?.nome||'--')}</td><td>${html(JSON.stringify(a.pagamentos||[{forma:a.forma_pagamento,valor:a.valor_receber}]))}</td><td>${money(a.valor_receber)}</td></tr>`).join('')}</table><h3>Total recebido: ${money(total)}</h3></html>`);w.document.close();w.print();}
function gerarRelatorioAcertosComColunas(){const inicio=$('relatorioAcertoInicio').value,fim=$('relatorioAcertoFim').value;if(!inicio||!fim)return alert('Informe as duas datas.');if(inicio>fim)return alert('A data inicial não pode ser maior que a final.');const lista=acertosHistorico.filter(a=>a.data_acerto>=inicio&&a.data_acerto<=fim),valorForma=(a,forma)=>(a.pagamentos||[{forma:a.forma_pagamento,valor:a.valor_receber}]).filter(p=>String(p.forma).toLowerCase()===forma).reduce((s,p)=>s+Number(p.valor||0),0),pix=lista.reduce((s,a)=>s+valorForma(a,'pix'),0),dinheiro=lista.reduce((s,a)=>s+valorForma(a,'dinheiro'),0),w=window.open('','_blank','width=900,height=700');if(!w)return alert('Permita pop-ups para gerar o relatório.');w.document.write(`<html><meta charset="utf-8"><title>Relatório de pagamentos</title><style>body{font:14px Arial;padding:25px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style><h1>Relatório de pagamentos</h1><p>Período: ${isoToBr(inicio)} a ${isoToBr(fim)}</p><table><tr><th>Data</th><th>Vendedora</th><th>Pix</th><th>Dinheiro</th><th>Total</th></tr>${lista.map(a=>{const p=valorForma(a,'pix'),d=valorForma(a,'dinheiro');return `<tr><td>${isoToBr(a.data_acerto)}</td><td>${html(a.vendedoras?.nome||'--')}</td><td>${money(p)}</td><td>${money(d)}</td><td>${money(p+d)}</td></tr>`}).join('')}</table><h3>Total Pix: ${money(pix)} | Total Dinheiro: ${money(dinheiro)} | Total: ${money(pix+dinheiro)}</h3></html>`);w.document.close();w.print();}
async function preencherMostruariosDaVendedora(){ const codigo=only($('acertoCodigoVendedora').value); $('acertoSelectMostruario').innerHTML='<option value="">Selecione</option>'; $('acertoNomeVendedora').value=''; mostruarioAtual=null; acertoItens=[]; if(!codigo){renderAcerto();return} await carregarAcertoBase(); const lista=mostruarios.filter(m=>m.vendedoras?.codigo===codigo); $('acertoNomeVendedora').value=lista[0]?.vendedoras?.nome||''; $('acertoSelectMostruario').innerHTML='<option value="">Selecione</option>'+lista.map(m=>`<option value="${m.id}">Mostruário ${html(m.numero)} — retorno ${isoToBr(m.data_acerto)||'--'}</option>`).join(''); renderAcerto(); }
function atualizarResumoAcerto(){const total=acertoItens.reduce((s,i)=>s+i.valor,0),pct=Number($('acertoComissao')?.value||0);$('acertoValorReceber').textContent=money(total*(1-pct/100));}
function renderAcerto(){ const box=$('acertoListaContainer'); if(!box)return; if(!mostruarioAtual){box.innerHTML='<div class="lista-vazia">Selecione um mostruário.</div>'; $('acertoTotalPecas').textContent='0';$('acertoTotalValor').textContent=money(0);atualizarResumoAcerto();return} let pecas=0,total=0; box.innerHTML=acertoItens.map((i,index)=>{pecas+=i.vendida;total+=i.valor;return `<div class="acerto-item"><span>${html(i.codigo)}</span><span>${html(i.descricao)}</span><span>${i.retirada}</span><input aria-label="Quantidade devolvida ${html(i.codigo)}" type="number" min="0" max="${i.retirada}" value="${i.devolvida}" data-devolucao="${index}"><span>${i.vendida}</span><span>${money(i.valor)}</span></div>`}).join('');$('acertoTotalPecas').textContent=pecas;$('acertoTotalValor').textContent=money(total);atualizarResumoAcerto(); }
function selecionarMostruarioAcerto(){mostruarioAtual=mostruarios.find(m=>m.id===$('acertoSelectMostruario').value)||null;acertoItens=(mostruarioAtual?.mostruario_itens||[]).map(i=>({produto_id:i.produto_id,codigo:i.produtos?.codigo||'',descricao:i.produtos?.descricao||'',retirada:Number(i.quantidade||0),devolvida:0,vendida:Number(i.quantidade||0),preco:Number(i.produtos?.preco||0),valor:Number(i.quantidade||0)*Number(i.produtos?.preco||0)}));const atraso=mostruarioAtual?.data_acerto&&new Date(`${mostruarioAtual.data_acerto}T23:59:59`)<new Date();$('acertoComissao').value=atraso?'40':'50';renderAcerto();}
function lerPagamentosAcerto(){const linhas=[...$$('#acertoPagamentosLista .pagamento-linha')];if(linhas.length)pagamentosAcerto=linhas.map(l=>({forma:l.querySelector('.pagamento-forma')?.value||'',valor:Number(l.querySelector('.pagamento-valor')?.value)||0}));return pagamentosAcerto.filter(p=>Number(p.valor)>0).map(p=>({forma:p.forma,valor:Number(p.valor)}));}
function validarPagamentosAcerto(){const total=acertoItens.reduce((s,i)=>s+i.valor,0),pct=Number($('acertoComissao')?.value||0),receber=total*(1-pct/100),pago=lerPagamentosAcerto().reduce((s,p)=>s+p.valor,0);let aviso=$('acertoPagamentoAviso');if(!aviso){aviso=document.createElement('small');aviso.id='acertoPagamentoAviso';$('acertoPagamentosLista')?.after(aviso);}aviso.textContent=`Recebido: ${money(pago)} | A receber: ${money(receber)}`;aviso.style.color=Math.abs(pago-receber)<=0.01?'green':'#b00020';return Math.abs(pago-receber)<=0.01;}
function limparListaMostruariosAcerto(){if($('acertoSelectMostruario'))$('acertoSelectMostruario').innerHTML='<option value="">Selecione</option>';}
function limparAcerto(){['acertoCodigoVendedora','acertoNomeVendedora','acertoSelectMostruario'].forEach(id=>{if($(id))$(id).value='';});acertoEmEdicao=null;mostruarioAtual=null;acertoItens=[];pagamentosAcerto=[{forma:'Pix',valor:0}];const box=$('acertoPagamentosLista');if(box)box.innerHTML='<div class="pagamento-linha"><select class="field-select pagamento-forma"><option>Pix</option><option>Dinheiro</option></select><input class="pagamento-valor" type="number" min="0" step="0.01" placeholder="Valor"><button type="button" class="btn light remover-pagamento">Remover</button></div>';renderAcerto();validarPagamentosAcerto();}
async function salvarAcertoAtual(){try{if(!mostruarioAtual||!acertoItens.length)return alert('Selecione um mostruário com itens.');const pagamentos=lerPagamentosAcerto(),total=acertoItens.reduce((s,i)=>s+i.valor,0),pct=Number($('acertoComissao').value),receber=total*(1-pct/100),pago=pagamentos.reduce((s,p)=>s+p.valor,0);if(!pagamentos.length)return alert('Informe ao menos uma forma de pagamento e seu valor.');if(Math.abs(pago-receber)>0.01)return alert(`A soma dos pagamentos (${money(pago)}) deve ser igual ao valor a receber (${money(receber)}).`);const dados={itens:acertoItens,total_pecas:acertoItens.reduce((s,i)=>s+i.vendida,0),valor_total:total,comissao_percentual:pct,valor_comissao:total*pct/100,valor_receber:receber,forma_pagamento:pagamentos[0].forma,pagamentos};if(acertoEmEdicao){await editarAcerto(acertoEmEdicao.id,dados);acertoEmEdicao=null;mostruarioAtual=null;acertoItens=[];await carregarHistoricoAcertos();alert('Acerto atualizado com sucesso.');return;}await salvarAcerto({...dados,mostruario_id:mostruarioAtual.id,vendedora_id:mostruarioAtual.vendedora_id,data_acerto:new Date().toISOString().slice(0,10)});await excluirMostruario(mostruarioAtual.id);mostruarios=mostruarios.filter(m=>m.id!==mostruarioAtual.id);mostruarioAtual=null;acertoItens=[];await carregarMostruarios();alert('Acerto salvo e mostruário removido com sucesso.');}catch(e){alert(`Erro ao salvar acerto: ${e.message}`)}}
function imprimirAcerto(){if(!mostruarioAtual)return alert('Selecione um mostruário.');const total=acertoItens.reduce((s,i)=>s+i.valor,0),pct=Number($('acertoComissao').value),vend=mostruarioAtual.vendedoras||{},pagamentos=lerPagamentosAcerto(),w=window.open('','_blank','width=850,height=700');if(!w)return alert('Permita pop-ups para imprimir.');w.document.write(`<html lang="pt-BR"><meta charset="UTF-8"><title>Relatório de Acerto</title><style>body{font:14px Arial;padding:28px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style><h1>Relatório de Acerto</h1><p>Vendedora: ${html(vend.codigo)} — ${html(vend.nome)} | Mostruário ${html(mostruarioAtual.numero)} | ${hoje()}</p><table><tr><th>Código</th><th>Descrição</th><th>Retirada</th><th>Devolvida</th><th>Vendida</th><th>Preço unit.</th><th>Valor</th></tr>${acertoItens.map(i=>`<tr><td>${html(i.codigo)}</td><td>${html(i.descricao)}</td><td>${i.retirada}</td><td>${i.devolvida}</td><td>${i.vendida}</td><td>${money(i.preco)}</td><td>${money(i.valor)}</td></tr>`).join('')}</table><p>Peças: ${acertoItens.reduce((s,i)=>s+i.vendida,0)}<br>Valor total: ${money(total)}<br>Comissão (${pct}%): ${money(total*pct/100)}<br>Valor a receber: ${money(total*(1-pct/100))}<br><strong>Formas de pagamento:</strong><br>${pagamentosParaImpressao(pagamentos)}</p></html>`);w.document.close();setTimeout(()=>{w.focus();w.print()},300);}

function bind(){
  $('tenantForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!ehSuperadmin()) return;
    const id=only($('tenantId').value), nome=only($('tenantNome').value);
    const slug=only($('tenantSlug').value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const mensagem=$('tenantMensagem'); mensagem.textContent='Salvando...';
    if(!nome||!slug){ mensagem.textContent='Informe o nome e o identificador do tenant.'; return; }
    const query=id?supabase.from('tenants').update({nome,slug}).eq('id',id):supabase.from('tenants').insert({nome,slug});
    const { error }=await query;
    if(error){ mensagem.textContent=`Não foi possível salvar: ${error.message}`; return; }
    limparTenantForm(); await carregarTenants();
  });
  $('btnCancelarTenant')?.addEventListener('click',limparTenantForm);
  $('tenantsTabelaBody')?.addEventListener('click',async e=>{
    const copiar=e.target.closest('[data-copiar-link-tenant]');
    if(copiar){
      try{ await navigator.clipboard.writeText(copiar.dataset.copiarLinkTenant); copiar.textContent='Copiado!'; setTimeout(()=>copiar.textContent='Copiar link',1500); }
      catch(_erro){ window.prompt('Copie o link do tenant:',copiar.dataset.copiarLinkTenant); }
      return;
    }
    const editar=e.target.closest('[data-editar-tenant]');
    if(editar){ $('tenantId').value=editar.dataset.editarTenant; $('tenantNome').value=editar.dataset.tenantNome; $('tenantSlug').value=editar.dataset.tenantSlug; $('btnCancelarTenant').hidden=false; $('tenantNome').focus(); return; }
    const status=e.target.closest('[data-status-tenant]');
    if(!status) return;
    const ativo=status.dataset.tenantAtivo==='true';
    if(ativo && status.dataset.statusTenant===tenantAtual.id){ alert('O tenant principal VendaSuite não pode ser desativado.'); return; }
    const { error }=await supabase.from('tenants').update({ativo:!ativo}).eq('id',status.dataset.statusTenant);
    if(error) alert(`Não foi possível alterar o status: ${error.message}`); else await carregarTenants();
  });
  $('primeiroAcessoForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const senha=$('novaSenha').value, mensagem=$('primeiroAcessoMensagem');
    if(senha !== $('confirmarSenha').value){ mensagem.textContent='As senhas não coincidem.'; return; }
    const { error }=await supabase.auth.updateUser({ password:senha, data:{ senha_pendente:false } });
    if(error){ mensagem.textContent=mensagemAutenticacao(error); return; }
    history.replaceState({}, document.title, tenantSolicitado ? `/${encodeURIComponent(tenantSolicitado)}` : '/');
    $('primeiroAcessoForm').hidden=true; $('loginForm').hidden=false;
    const { data:{session} }=await supabase.auth.getSession();
    await abrirAplicacao(session);
  });
  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const botao=$('btnEntrar'), mensagem=$('loginMensagem');
    botao.disabled=true; mensagem.textContent='Entrando...';
    const { data, error } = await supabase.auth.signInWithPassword({ email:only($('loginEmail').value), password:$('loginSenha').value });
    botao.disabled=false;
    if(error){ mensagem.textContent=mensagemAutenticacao(error, 'login'); return; }
    mensagem.textContent=''; $('loginSenha').value=''; await abrirAplicacao(data.session);
  });
  $('btnLogout')?.addEventListener('click', async () => { await supabase?.auth.signOut(); });
  $('conviteForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const mensagem=$('conviteMensagem'); mensagem.classList.remove('success'); mensagem.textContent='Enviando convite...';
    const { data, error } = await supabase.functions.invoke('admin-users', { body:{ action:'invite', email:only($('conviteEmail').value), tenantId:tenantAtual.id, redirectTo:linkDoTenant(tenantAtual.slug) } });
    if(error || data?.error){ mensagem.textContent=await mensagemErroFuncao(error, data, 'convite'); return; }
    mensagem.classList.add('success'); mensagem.textContent='Convite enviado. O novo usuário recebeu o perfil de Leitura.'; $('conviteEmail').value='';
    setTimeout(carregarUsuarios, 800);
  });
  $('usuariosTabelaBody')?.addEventListener('change', async e => {
    const id=e.target.dataset.perfilUsuario; if(!id)return;
    const { error }=await supabase.from('perfis').update({ perfil:e.target.value, updated_at:new Date().toISOString() }).eq('tenant_id',tenantAtual.id).eq('id',id);
    if(error){ alert('Não foi possível alterar o perfil. Atualize a página e tente novamente.'); await carregarUsuarios(); }
  });
  $('usuariosTabelaBody')?.addEventListener('click', async e => {
    const botao=e.target.closest('[data-excluir-usuario]'); if(!botao)return;
    const email=botao.dataset.emailUsuario;
    if(!confirm(`Excluir o acesso de ${email}?\n\nO usuário será removido e poderá receber um novo convite. Esta ação não pode ser desfeita.`))return;
    botao.disabled=true; botao.textContent='Excluindo...';
    const { data, error }=await supabase.functions.invoke('admin-users', { body:{ action:'delete', userId:botao.dataset.excluirUsuario } });
    if(error || data?.error){ alert(await mensagemErroFuncao(error, data, 'exclusao')); botao.disabled=false; botao.textContent='Excluir'; return; }
    $('conviteMensagem').classList.add('success');
    $('conviteMensagem').textContent=`O usuário ${email} foi excluído. Agora ele pode receber um novo convite.`;
    await carregarUsuarios();
  });
  const relBtn=$('btnGerarRelatorioAcertos'),relToolbar=relBtn?.parentElement,mainToolbar=$('btnNovoAcerto')?.parentElement;if(relBtn&&mainToolbar){mainToolbar.style.gap='28px';mainToolbar.append(relBtn);if(relToolbar&&relToolbar!==mainToolbar)relToolbar.style.display='none';}
  relBtn?.addEventListener('click',e=>{e.stopImmediatePropagation();const old=$('relatorioAcertoModal');if(old)old.remove();const m=document.createElement('div');m.id='relatorioAcertoModal';m.innerHTML='<div class="modal-backdrop"><div class="modal"><h3>Gerar relatório de pagamentos</h3><label>Data inicial <input type="date" id="relatorioAcertoInicio"></label><label>Data final <input type="date" id="relatorioAcertoFim"></label><div class="modal-footer"><button type="button" id="cancelarRelatorio" class="btn light">Cancelar</button><button type="button" id="confirmarRelatorio" class="btn blue">Gerar</button></div></div></div>';document.body.append(m);$('cancelarRelatorio').onclick=()=>m.remove();$('confirmarRelatorio').onclick=()=>{gerarRelatorioAcertosComColunas();m.remove();};},true);
  document.addEventListener('click',e=>{const d=e.target.dataset||{},a=acertosHistorico.find(x=>x.id===d.acertoDetalhes||x.id===d.acertoEditar);if(!a)return;if(d.acertoDetalhes){e.stopImmediatePropagation();modoConsultaAcerto(a);if($('btnAdicionarPagamento'))$('btnAdicionarPagamento').style.display='none';}if(d.acertoEditar){e.stopImmediatePropagation();modoEdicaoAcerto(a);if($('btnAdicionarPagamento'))$('btnAdicionarPagamento').style.display='';$$('#acertoPagamentosLista .pagamento-linha').forEach(l=>{if(!l.querySelector('.remover-pagamento')){const b=document.createElement('button');b.type='button';b.className='btn light remover-pagamento';b.textContent='Remover';l.append(b);}});}},true);
  const acoesAcerto=$('btnSalvarAcerto')?.parentElement;if(acoesAcerto){const salvar=$('btnSalvarAcerto'),imprimir=$('btnImprimirAcerto');if(salvar&&imprimir){acoesAcerto.style.gap='28px';acoesAcerto.insertBefore(imprimir,salvar);}}
  const acertoPanel=$('acerto');if(acertoPanel&&!$('acertosHistoricoBody')){const wrap=acertoPanel.querySelector('.include-wrap'),sec=document.createElement('div');sec.id='acertosHistorico';sec.className='table-wrap';sec.innerHTML='<div class="toolbar-actions toolbar-actions-main"><h2>Acertos realizados</h2><button type="button" class="btn blue" id="btnNovoAcerto">NOVO ACERTO</button></div><div class="toolbar-actions"><label>De: <input type="date" id="relatorioAcertoInicio"></label><label>Até: <input type="date" id="relatorioAcertoFim"></label><button type="button" class="btn light" id="btnGerarRelatorioAcertos">GERAR RELATÓRIO</button></div><table class="data-table"><thead><tr><th>Data</th><th>Código</th><th>Vendedora</th><th>Valor a receber</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody id="acertosHistoricoBody"><tr><td colspan="6">Carregando...</td></tr></tbody></table>';wrap?.append(sec);const formParts=wrap?.children||[];[...formParts].filter(x=>x!==sec).forEach(x=>x.dataset.acertoForm='true');}
  $('btnGerarRelatorioAcertos')?.addEventListener('click',gerarRelatorioAcertosComColunas);const relBtn2=$('btnGerarRelatorioAcertos'),relOldToolbar=relBtn2?.parentElement,relMainToolbar=$('btnNovoAcerto')?.parentElement;if(relBtn2&&relMainToolbar){relMainToolbar.style.gap='28px';relMainToolbar.append(relBtn2);if(relOldToolbar&&relOldToolbar!==relMainToolbar)relOldToolbar.remove();}relBtn2?.addEventListener('click',e=>{e.stopImmediatePropagation();const old=$('relatorioAcertoModal');if(old)old.remove();const m=document.createElement('div');m.id='relatorioAcertoModal';m.innerHTML='<div class="modal-backdrop"><div class="modal"><h3>Gerar relatório de pagamentos</h3><label>Data inicial <input type="date" id="relatorioAcertoInicio"></label><label>Data final <input type="date" id="relatorioAcertoFim"></label><div class="modal-footer"><button type="button" id="cancelarRelatorio" class="btn light">Cancelar</button><button type="button" id="confirmarRelatorio" class="btn blue">Gerar</button></div></div></div>';document.body.append(m);$('cancelarRelatorio').onclick=()=>m.remove();$('confirmarRelatorio').onclick=()=>{gerarRelatorioAcertosComColunas();m.remove();};},true);
  $('btnNovoAcerto')?.addEventListener('click',()=>{[...$$('[data-acerto-form="true"]')].forEach(x=>x.style.display='');$('acertosHistorico').style.display='none';if($('btnSalvarAcerto'))$('btnSalvarAcerto').style.display='';if($('btnAdicionarPagamento'))$('btnAdicionarPagamento').style.display='';limparAcerto();});
  [...$$('[data-acerto-form="true"]')].forEach(x=>x.style.display='none');
  const voltarAcertos=document.createElement('button');voltarAcertos.type='button';voltarAcertos.className='btn light';voltarAcertos.textContent='Voltar para acertos';voltarAcertos.addEventListener('click',()=>{[...$$('[data-acerto-form="true"]')].forEach(x=>x.style.display='none');$('acertosHistorico').style.display='';carregarHistoricoAcertos();});$('acerto')?.querySelector('.include-top')?.prepend(voltarAcertos);
  const pagamentoOriginal = $('acertoPagamento');
  if (pagamentoOriginal) {
    const compatPagamento = document.createElement('select'); compatPagamento.id = 'acertoPagamento'; compatPagamento.style.display = 'none'; compatPagamento.innerHTML = '<option>Pix</option><option>Dinheiro</option>'; document.body.appendChild(compatPagamento);
    pagamentosAcerto = [{ forma: pagamentoOriginal.value || 'Pix', valor: 0 }];
    pagamentoOriginal.outerHTML = '<div id="acertoPagamentosLista"><div class="pagamento-linha"><select class="field-select pagamento-forma"><option>Pix</option><option>Dinheiro</option></select><input class="pagamento-valor" type="number" min="0" step="0.01" placeholder="Valor"><button type="button" class="btn light remover-pagamento">Remover</button></div></div><button type="button" class="btn light" id="btnAdicionarPagamento">Adicionar forma</button>';
  }
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); const target=btn.dataset.target; if(target==='vendedora-cadastro') limparVendedora(); if(target==='produto-cadastro') limparProduto(); if(target) showScreen(target); }));
  $('btnNovoMostruario')?.addEventListener('click', ()=>{ limparMostruario(); showScreen('mostruario-incluir'); });
  $('btnImprimirMostruario')?.addEventListener('click', imprimirMostruario);

  // --- Abas Disponíveis / Alocados ---
  $$('.aba-mostruario').forEach(btn => {
    btn.addEventListener('click', () => {
      abaAtivaMostruario = btn.dataset.aba;
      $$('.aba-mostruario').forEach(b => b.classList.toggle('aba-ativa', b.dataset.aba === abaAtivaMostruario));
      carregarMostruarios();
    });
  });
  $('btnSalvarProduto')?.addEventListener('click', salvarFormProduto);
  $('btnSalvarValoresMetais')?.addEventListener('click', async () => {
    try {
      const valorOuro=n($('valorOuro').value), valorPrata=n($('valorPrata').value);
      valoresMetais = await salvarValoresMetais(valorOuro, valorPrata);
      await recalcularPrecosProdutos(valorOuro, valorPrata);
      atualizarPrecoCalculado();
      await carregarProdutos();
      alert('Valores do ouro e da prata salvos e preços dos produtos atualizados com sucesso!');
    } catch(e) { alert(`Erro ao salvar valores do ouro e da prata: ${e.message}`); }
  });
  $('produtoTipo')?.addEventListener('change', atualizarPrecoCalculado);
  $('produtoQuoficiente')?.addEventListener('input', (event) => {
    limitarQuoficiente(event.currentTarget);
    atualizarPrecoCalculado();
  });
  $('btnSalvarVendedora')?.addEventListener('click', salvarFormVendedora);

  // --- Máscara CPF ---
  $('vendedoraCpf')?.addEventListener('input', () => {
    const el = $('vendedoraCpf');
    const masked = mascaraCpf(el.value);
    el.value = masked;
  });

  // --- Máscara Celular ---
  $('vendedoraCelular')?.addEventListener('input', () => {
    const el = $('vendedoraCelular');
    const masked = mascaraCelular(el.value);
    el.value = masked;
  });

  // --- Máscara e busca CEP ---
  $('vendedoraCep')?.addEventListener('input', () => {
    const el = $('vendedoraCep');
    el.value = mascaraCep(el.value);
  });
  $('vendedoraCep')?.addEventListener('blur', () => {
    buscarCep($('vendedoraCep').value);
  });
  $('vendedoraCep')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      buscarCep($('vendedoraCep').value);
    }
  });
  $('btnSalvarMostruario')?.addEventListener('click', salvarFormMostruario);
  $('btnPesquisarProduto')?.addEventListener('click', () => { paginaProdutos = 1; renderizarProdutos(); });
  $('buscaProduto')?.addEventListener('input', () => { paginaProdutos = 1; renderizarProdutos(); });
  $('filtroProduto')?.addEventListener('change', () => { paginaProdutos = 1; renderizarProdutos(); });
  $('produtoItensPorPagina')?.addEventListener('change', event => { itensPorPaginaProdutos = Number(event.target.value) || 10; paginaProdutos = 1; renderizarProdutos(); });
  $('produtoPaginaAnterior')?.addEventListener('click', () => { if(paginaProdutos > 1){ paginaProdutos--; renderizarProdutos(); } });
  $('produtoProximaPagina')?.addEventListener('click', () => { const total = Math.max(1, Math.ceil(produtosFiltrados().length / itensPorPaginaProdutos)); if(paginaProdutos < total){ paginaProdutos++; renderizarProdutos(); } });
  $('btnPesquisarVendedora')?.addEventListener('click', carregarVendedoras); $('buscaVendedora')?.addEventListener('input', carregarVendedoras);
  $('btnPesquisarMostruario')?.addEventListener('click', carregarMostruarios); $('buscaMostruario')?.addEventListener('input', carregarMostruarios);

  // Modal Alocar Vendedora
  $('modalAlocarCodigoVendedora')?.addEventListener('input', async () => {
    const v = await buscarVendedoraPorCodigo(only($('modalAlocarCodigoVendedora').value));
    if($('modalAlocarNomeVendedora')) $('modalAlocarNomeVendedora').value = v?.nome || '';
  });
  $('btnFecharModalAlocar')?.addEventListener('click', fecharModalAlocar);
  $('btnCancelarModalAlocar')?.addEventListener('click', fecharModalAlocar);
  $('btnConfirmarModalAlocar')?.addEventListener('click', confirmarAlocacaoModal);

  // --- Autocomplete por Prefixo do Produto (Mostruário) ---
  const inputCodigo = $('codigoProduto');
  const dropdown = $('dropdownSugestoesProduto');

  function fecharDropdown() {
    if(dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
  }

  function selecionarProdutoSugestao(p) {
    if(inputCodigo) inputCodigo.value = p.codigo;
    if($('descricaoProduto')) $('descricaoProduto').value = p.descricao || '';
    if($('precoProdutoMostruario')) $('precoProdutoMostruario').value = money(p.preco);
    fecharDropdown();
    setTimeout(() => $('qtdProduto')?.focus(), 50);
  }

  inputCodigo?.addEventListener('input', async () => {
    const val = only(inputCodigo.value).toUpperCase();
    if (!val) {
      if($('descricaoProduto')) $('descricaoProduto').value = '';
      if($('precoProdutoMostruario')) $('precoProdutoMostruario').value = '';
      fecharDropdown();
      return;
    }

    // Busca por prefixo
    try {
      const sugestoes = await buscarProdutosPorPrefixo(val);
      if(!sugestoes.length) {
        fecharDropdown();
        // Tenta exato
        const exato = await buscarProdutoPorCodigo(val);
        if($('descricaoProduto')) $('descricaoProduto').value = exato?.descricao || '';
        if($('precoProdutoMostruario')) $('precoProdutoMostruario').value = exato ? money(exato.preco) : '';
        return;
      }

      // Se houver 1 resultado idêntico, já preenche a descrição e preço sem esconder o dropdown caso o usuário queira clicar
      const idendico = sugestoes.find(s => s.codigo === val);
      if(idendico) {
        if($('descricaoProduto')) $('descricaoProduto').value = idendico.descricao || '';
        if($('precoProdutoMostruario')) $('precoProdutoMostruario').value = money(idendico.preco);
      } else {
        if($('descricaoProduto')) $('descricaoProduto').value = '';
        if($('precoProdutoMostruario')) $('precoProdutoMostruario').value = '';
      }

      dropdown.innerHTML = sugestoes.map(p => `
        <div class="autocomplete-item" data-codigo-sugestao="${p.codigo}">
          <div>
            <span class="codigo-badge">${html(p.codigo)}</span>
            <span class="desc-text">${html(p.descricao)}</span>
          </div>
          <span class="preco-text">${money(p.preco)}</span>
        </div>
      `).join('');
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const cod = item.dataset.codigoSugestao;
          const p = sugestoes.find(x => x.codigo === cod);
          if(p) selecionarProdutoSugestao(p);
        });
      });
    } catch(err) {
      console.error('Erro ao buscar sugestões de produtos:', err);
    }
  });

  // Fecha dropdown se clicar fora
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field-autocomplete')) {
      fecharDropdown();
      if($('dropdownSugestoesAcertoProduto')) $('dropdownSugestoesAcertoProduto').style.display = 'none';
    }
  });

  // Autocomplete na tela de Acerto
  const inputAcertoCodigo = $('acertoCodigoProduto');
  const dropdownAcerto = $('dropdownSugestoesAcertoProduto');
  inputAcertoCodigo?.addEventListener('input', async () => {
    const val = only(inputAcertoCodigo.value).toUpperCase();
    if(!val) {
      if(dropdownAcerto) dropdownAcerto.style.display = 'none';
      return;
    }
    // No acerto, busca primeiro nos itens do mostruário atual
    const itensDisponiveis = (mostruarioAtual?.mostruario_itens || []).filter(i => (i.produtos?.codigo || '').startsWith(val));
    if(!itensDisponiveis.length) {
      if(dropdownAcerto) dropdownAcerto.style.display = 'none';
      const itemExato = mostruarioAtual?.mostruario_itens?.find(i => i.produtos?.codigo === val);
      if($('acertoDescricaoProduto')) $('acertoDescricaoProduto').value = itemExato?.produtos?.descricao || '';
      if($('acertoQtdRetirada')) $('acertoQtdRetirada').value = itemExato?.quantidade || '';
      return;
    }

    if(dropdownAcerto) {
      dropdownAcerto.innerHTML = itensDisponiveis.map(i => `
        <div class="autocomplete-item" data-acerto-codigo="${i.produtos?.codigo}">
          <div>
            <span class="codigo-badge">${html(i.produtos?.codigo)}</span>
            <span class="desc-text">${html(i.produtos?.descricao)}</span>
          </div>
          <span class="preco-text">Qtd: ${i.quantidade}</span>
        </div>
      `).join('');
      dropdownAcerto.style.display = 'block';

      dropdownAcerto.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const cod = item.dataset.acertoCodigo;
          const found = mostruarioAtual?.mostruario_itens?.find(i => i.produtos?.codigo === cod);
          if(found) {
            inputAcertoCodigo.value = found.produtos?.codigo || '';
            if($('acertoDescricaoProduto')) $('acertoDescricaoProduto').value = found.produtos?.descricao || '';
            if($('acertoQtdRetirada')) $('acertoQtdRetirada').value = found.quantidade || '';
            dropdownAcerto.style.display = 'none';
            setTimeout(() => $('acertoQtdDevolvida')?.focus(), 50);
          }
        });
      });
    }
  });

  $('btnAdicionarProduto')?.addEventListener('click', async () => { const codigo=only($('codigoProduto').value).toUpperCase(); const p = await buscarProdutoPorCodigo(codigo); if(!p) return alert('Produto não encontrado.'); draftProdutos.push({ produto_id:p.id, codigo:p.codigo, descricao:p.descricao, preco:Number(p.preco||0), quantidade:Number($('qtdProduto').value||0) }); $('codigoProduto').value=''; $('descricaoProduto').value=''; $('precoProdutoMostruario').value=''; $('qtdProduto').value=''; fecharDropdown(); renderListaProdutos(); });
  $('acertoCodigoVendedora')?.addEventListener('input', e=>{const input=e.currentTarget;input.value=input.value.replace(/\D/g,'').slice(0,3);if(input.value.length===3)preencherMostruariosDaVendedora().then(()=>$('acertoSelectMostruario')?.focus());});
  $('acertoCodigoVendedora')?.addEventListener('change', preencherMostruariosDaVendedora);
  $('acertoCodigoVendedora')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();preencherMostruariosDaVendedora();}});
  $('acertoSelectMostruario')?.addEventListener('change',selecionarMostruarioAcerto);
  $('acertoComissao')?.addEventListener('input',atualizarResumoAcerto);
  $('btnAdicionarPagamento')?.addEventListener('click',()=>{pagamentosAcerto.push({forma:'Dinheiro',valor:0});$('acertoPagamentosLista').insertAdjacentHTML('beforeend','<div class="pagamento-linha"><select class="field-select pagamento-forma"><option>Pix</option><option>Dinheiro</option></select><input class="pagamento-valor" type="number" min="0" step="0.01" placeholder="Valor"><button type="button" class="btn light remover-pagamento">Remover</button></div>');});
  $('acertoPagamentosLista')?.addEventListener('click',e=>{if(!e.target.classList.contains('remover-pagamento'))return;const linhas=$$('#acertoPagamentosLista .pagamento-linha');if(linhas.length===1){linhas[0].querySelector('.pagamento-valor').value='';pagamentosAcerto[0].valor=0;return;}e.target.closest('.pagamento-linha').remove();[...$$('#acertoPagamentosLista .pagamento-linha')].forEach((l,i)=>pagamentosAcerto[i]={forma:l.querySelector('.pagamento-forma').value,valor:Number(l.querySelector('.pagamento-valor').value)||0});});
  $('acertoPagamentosLista')?.addEventListener('input',()=>{[...$$('#acertoPagamentosLista .pagamento-linha')].forEach((l,i)=>pagamentosAcerto[i]={forma:l.querySelector('.pagamento-forma').value,valor:Number(l.querySelector('.pagamento-valor').value)||0});validarPagamentosAcerto();});
  $('acertoComissao')?.addEventListener('input',validarPagamentosAcerto);
  $('btnSalvarAcerto')?.addEventListener('click',salvarAcertoAtual);
  document.addEventListener('click',async e=>{const d=e.target.dataset||{},a=acertosHistorico.find(x=>x.id===d.acertoDetalhes||x.id===d.acertoImprimir||x.id===d.acertoEditar||x.id===d.acertoExcluir);try{if(!a)return;if(d.acertoDetalhes)alert(`Data: ${isoToBr(a.data_acerto)}\nVendedora: ${a.vendedoras?.nome||'--'}\nPeças: ${a.total_pecas}\nValor total: ${money(a.valor_total)}\nComissão: ${money(a.valor_comissao)}\nA receber: ${money(a.valor_receber)}\nPagamentos: ${JSON.stringify(a.pagamentos||[])}`);if(d.acertoImprimir)imprimirAcertoHistorico(a);if(d.acertoExcluir&&confirm('Excluir este acerto?')){await excluirAcerto(a.id);await carregarHistoricoAcertos();}if(d.acertoEditar){const valor=prompt('Novo valor a receber:',a.valor_receber);if(valor===null)return;const novo=Number(String(valor).replace(',','.'));if(!Number.isFinite(novo)||novo<0)return alert('Valor inválido.');await editarAcerto(a.id,{valor_receber:novo});await carregarHistoricoAcertos();}}catch(err){alert(`Erro: ${err.message}`);}});
  $('btnSalvarAcerto')?.addEventListener('click',()=>{const timer=setInterval(()=>{if(!mostruarioAtual){limparListaMostruariosAcerto();[...$$('[data-acerto-form="true"]')].forEach(x=>x.style.display='none');if($('acertosHistorico'))$('acertosHistorico').style.display='';carregarHistoricoAcertos();clearInterval(timer);}},250);setTimeout(()=>clearInterval(timer),10000);});
  $('btnSalvarAcerto')?.addEventListener('click',()=>{const vendedorId=mostruarioAtual?.vendedora_id,today=new Date().toISOString().slice(0,10);const timer=setInterval(async()=>{if(!mostruarioAtual){clearInterval(timer);if(vendedorId)try{const v=vendedoras.find(x=>x.id===vendedorId)||{};await salvarVendedora({id:vendedorId,codigo:v.codigo,nome:v.nome,cpf:v.cpf,cep:v.cep,endereco:v.endereco,numero:v.numero,complemento:v.complemento,bairro:v.bairro,celular:v.celular,ultimo:today,proximo:''});}catch(e){console.error(e);}limparAcerto();await carregarMostruarios();await carregarVendedoras();}},250);setTimeout(()=>clearInterval(timer),10000);});
  $('btnImprimirAcerto')?.addEventListener('click',imprimirAcerto);
  $('listaProdutosContainer')?.addEventListener('change',e=>{const index=e.target.dataset.editarQtdDraft;if(index===undefined)return;draftProdutos[Number(index)].quantidade=Math.max(1,Number(e.target.value)||1);renderListaProdutos();});
  $('acertoListaContainer')?.addEventListener('input',e=>{const index=e.target.dataset.devolucao;if(index===undefined)return;const item=acertoItens[Number(index)];item.devolvida=Math.min(item.retirada,Math.max(0,Number(e.target.value)||0));item.vendida=item.retirada-item.devolvida;item.valor=item.vendida*item.preco;renderAcerto();});
  $('acertoQtdDevolvida')?.addEventListener('keydown', e => { if(e.key !== 'Enter') return; e.preventDefault(); const retirada=Number($('acertoQtdRetirada').value||0), devolvida=Number($('acertoQtdDevolvida').value||0), vendida=retirada-devolvida; const item=mostruarioAtual?.mostruario_itens?.find(i => i.produtos?.codigo === only($('acertoCodigoProduto').value).toUpperCase()); acertoItens.push({ codigo:only($('acertoCodigoProduto').value).toUpperCase(), descricao:$('acertoDescricaoProduto').value, retirada, devolvida, vendida, valor: vendida * Number(item?.produtos?.preco || 0) }); $('acertoCodigoProduto').value=''; $('acertoDescricaoProduto').value=''; $('acertoQtdRetirada').value=''; $('acertoQtdDevolvida').value=''; renderAcerto(); });
  document.addEventListener('click', async e => { const d=e.target.dataset||{}; try{ if(d.editarProduto) editarProduto(d.editarProduto); if(d.editarVendedora) editarVendedora(d.editarVendedora); if(d.removerProdutoDraft){ draftProdutos.splice(Number(d.removerProdutoDraft),1); renderListaProdutos(); } if(d.excluirProduto && confirm('Excluir produto?')){ await excluirProduto(d.excluirProduto); await carregarProdutos(); } if(d.excluirVendedora && confirm('Excluir vendedora?')){ await excluirVendedora(d.excluirVendedora); await carregarVendedoras(); } if(d.excluirMostruario && confirm('Excluir mostruário?')){ await excluirMostruario(d.excluirMostruario); await carregarMostruarios(); } if(d.alocarMostruario){ abrirModalAlocar(d.alocarMostruario); } if(d.desalocarMostruario){ await desalocarVendedora(d.desalocarMostruario); } if(d.imprimirMostruario){ const m = mostruarios.find(x => x.id === d.imprimirMostruario); if(m) { $('mostruarioId').value = m.id; $('numeroMostruario').value = m.numero; draftProdutos = (m.mostruario_itens || []).map(item => ({ produto_id: item.produto_id, codigo: item.produtos?.codigo || '', descricao: item.produtos?.descricao || '', preco: Number(item.produtos?.preco || 0), quantidade: Number(item.quantidade || 0) })); imprimirMostruario(); } } if(d.verMostruario){ editarMostruario(d.verMostruario); } }catch(err){ alert(`Erro: ${err.message}`); } });
  function camposEditaveisDaMesmaTela(input){
    const tela = input.closest('.screen') || document;
    return [...tela.querySelectorAll('input, select, textarea')].filter(el => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      return !el.disabled && !el.readOnly && type !== 'hidden' && !el.classList.contains('search-input');
    });
  }

  function avancarCampoAtual(input){
    const inputs = camposEditaveisDaMesmaTela(input);
    const i = inputs.indexOf(input);
    const proximo = inputs[i + 1];
    if(proximo){
      setTimeout(() => {
        proximo.focus();
        if(typeof proximo.select === 'function') proximo.select();
      }, 30);
    }
  }

  $$('[data-uppercase="true"]').forEach(input => {
    input.addEventListener('input', () => {
      const pos = input.selectionStart;
      input.value = input.value.toUpperCase();
      try { input.setSelectionRange(pos, pos); } catch(e) {}
    });
  });

  $$('[data-auto-next="true"]').forEach(input => {
    let jaAvancou = false;

    input.addEventListener('input', () => {
      if(input.dataset.uppercase === 'true') input.value = input.value.toUpperCase();
      const max = Number(input.dataset.nextLength || 0);
      if(!max){
        jaAvancou = false;
        return;
      }

      if(input.value.length >= max && !jaAvancou){
        jaAvancou = true;
        avancarCampoAtual(input);
      }

      if(input.value.length < max){
        jaAvancou = false;
      }
    });

    input.addEventListener('keydown', e => {
      if(e.key === 'Enter'){
        e.preventDefault();
        avancarCampoAtual(input);
      }
    });
  });
}

setStatus();
bind();
iniciarAutenticacao();
showScreen(location.hash?.replace('#','') || 'home');

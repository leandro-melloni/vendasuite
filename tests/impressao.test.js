import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const reportFunction = source.slice(source.indexOf('function abrirRelatorioProdutos('), source.indexOf('function compararCodigoProduto('));

for (const quantidade of [0, 1, 5, 120]) {
  test(`gera uma via completa com ${quantidade} produtos e aguarda o carregamento para imprimir`, () => {
    let documento = '';
    let aoCarregar;
    const eventos = [];
    const janela = {
      addEventListener: (evento, callback, opcoes) => {
        assert.equal(evento, 'load');
        assert.equal(opcoes.once, true);
        aoCarregar = callback;
      },
      document: {
        // A abertura implícita do documento remove listeners da janela no navegador.
        write: html => { documento = html; aoCarregar = undefined; },
        close: () => {
          assert.equal(typeof aoCarregar, 'function');
          eventos.push('close');
        },
      },
      focus: () => eventos.push('focus'),
      print: () => eventos.push('print'),
    };
    const linhas = Array.from({ length: quantidade }, (_, i) => `<tr><td>PRODUTO-${i}</td><td>Descrição ${i}</td><td>2</td><td>R$ 10,00</td></tr>`);
    runInNewContext(`${reportFunction}\nabrirRelatorioProdutos(dados);`, {
      window: { open: () => janela },
      dados: {
        titulo: 'Relatório de Acerto',
        subtitulo: 'Vendedora: Maria | Mostruário 42',
        cabecalhos: ['Cód.', 'Descrição', 'Qtd.', 'Preço'],
        linhas,
        resumo: '<span>TOTAL: R$ 100,00 | Pix: R$ 100,00</span>',
      },
    });
    assert.equal((documento.match(/<h1>/g) || []).length, 1);
    assert.doesNotMatch(documento, /identificacao-via|break-before:page|page-break-before:always/);
    for (const linha of linhas) assert.equal(documento.split(linha).length - 1, 1);
    assert.match(documento, /Vendedora: Maria/);
    assert.match(documento, /TOTAL: R\$ 100,00 \| Pix: R\$ 100,00/);
    assert.match(documento, /Assinatura do Responsável/);
    assert.match(documento, /Assinatura da Vendedora/);
    assert.deepEqual(eventos, ['close']);
    aoCarregar();
    assert.deepEqual(eventos, ['close', 'focus', 'print']);
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

test('valorMensal converte cada frequência para um valor mensal médio', () => {
  assert.equal(C.valorMensal(1200, 'mensal'), 1200);
  assert.equal(C.valorMensal(1200, 'mensal14'), 1400);
  assert.equal(C.valorMensal(1200, 'anual'), 100);
  assert.equal(C.valorMensal(300, 'trimestral'), 100);
  assert.equal(C.valorMensal(600, 'semestral'), 100);
  assert.equal(C.valorMensal(12, 'semanal'), 52);
  assert.equal(C.valorMensal('10,5', 'mensal'), 10.5);
  assert.equal(C.valorMensal('abc', 'mensal'), 0);
});

test('resumo calcula rendimento, despesas, saldo livre, taxa de poupança e património', () => {
  const estado = {
    rendimentos: [
      { valor: 1200, frequencia: 'mensal14' },
      { valor: 1200, frequencia: 'anual' },
    ],
    despesas: [
      { valor: 500, frequencia: 'mensal', categoria: 'Habitação' },
      { valor: 600, frequencia: 'anual', categoria: 'Seguros' },
    ],
    poupancas: [{ saldo: 5000, contribuicaoMensal: 200 }],
    investimentos: [{ valorInvestido: 1000, valorAtual: 1100, contribuicaoMensal: 100 }],
  };
  const r = C.resumo(estado);
  assert.equal(r.rendimento, 1500);
  assert.equal(r.despesas, 550);
  assert.equal(r.saldoLivre, 650);
  assert.equal(r.taxaPoupanca, 0.2);
  assert.equal(r.patrimonio, 6100);
  assert.equal(r.investimentos.ganho, 100);
  assert.ok(Math.abs(r.investimentos.rentabilidade - 0.1) < 1e-9);
});

test('despesasPorCategoria agrupa e ordena da maior para a menor', () => {
  const res = C.despesasPorCategoria([
    { categoria: 'Lazer', valor: 50, frequencia: 'mensal' },
    { categoria: 'Habitação', valor: 700, frequencia: 'mensal' },
    { categoria: 'Lazer', valor: 120, frequencia: 'anual' },
  ]);
  assert.deepEqual(res, [
    { categoria: 'Habitação', valor: 700 },
    { categoria: 'Lazer', valor: 60 },
  ]);
});

test('paraOndeVai inclui poupança, investimentos e o valor por alocar', () => {
  const fatias = C.paraOndeVai({
    rendimentos: [{ valor: 1000, frequencia: 'mensal' }],
    despesas: [{ categoria: 'Alimentação', valor: 300, frequencia: 'mensal' }],
    poupancas: [{ contribuicaoMensal: 100 }],
    investimentos: [{ contribuicaoMensal: 100 }],
  });
  assert.deepEqual(
    fatias.map((f) => [f.nome, f.valor]),
    [
      ['Alimentação', 300],
      ['Poupança', 100],
      ['Investimentos', 100],
      ['Por alocar', 500],
    ],
  );
});

test('progressoObjetivo calcula percentagem e meses restantes', () => {
  assert.deepEqual(C.progressoObjetivo({ saldo: 500, objetivo: 1000, contribuicaoMensal: 150 }), {
    percentagem: 0.5,
    falta: 500,
    mesesRestantes: 4,
  });
  assert.equal(C.progressoObjetivo({ saldo: 500, objetivo: 0 }), null);
  assert.equal(C.progressoObjetivo({ saldo: 0, objetivo: 100, contribuicaoMensal: 0 }).mesesRestantes, null);
  assert.equal(C.progressoObjetivo({ saldo: 2000, objetivo: 1000 }).percentagem, 1);
});

test('normalizarEstado limpa dados importados e rejeita ficheiros inválidos', () => {
  assert.throws(() => C.normalizarEstado(null));
  const e = C.normalizarEstado({
    rendimentos: [{ nome: 'Ordenado', valor: '1500', frequencia: 'xpto', tipo: 'invalido' }, null],
    despesas: 'não é uma lista',
    categorias: ['Casa', 'Casa', ' '],
  });
  assert.equal(e.rendimentos.length, 1);
  assert.equal(e.rendimentos[0].valor, 1500);
  assert.equal(e.rendimentos[0].frequencia, 'mensal');
  assert.equal(e.rendimentos[0].tipo, 'outro');
  assert.ok(e.rendimentos[0].id);
  assert.deepEqual(e.despesas, []);
  assert.deepEqual(e.categorias, ['Casa']);
});

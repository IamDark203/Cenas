const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

let n = 0;
const uid = () => `id${++n}`;
const rec = (o) => {
  const inicio = o.inicio || '2026-01-01';
  return {
    id: uid(), campaignId: 'c1', inicio, fim: inicio, grupo: '', palavra: '',
    impressoes: 0, cliques: 0, custo: 0, conversoes: 0, valor: 0, ...o,
  };
};
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('datas: semanas começam à segunda e meses têm o número certo de dias', () => {
  assert.equal(Core.startOfWeek('2026-11-05'), '2026-11-02'); // quinta → segunda
  assert.equal(Core.startOfWeek('2026-11-08'), '2026-11-02'); // domingo → segunda anterior
  assert.equal(Core.endOfWeek('2026-11-02'), '2026-11-08');
  assert.equal(Core.daysInMonth('2028-02-10'), 29);
  assert.equal(Core.daysInMonth('2026-02-10'), 28);
  assert.equal(Core.endOfMonth('2026-12-03'), '2026-12-31');
  assert.equal(Core.addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(Core.addMonths('2026-01-31', -1), '2025-12-01');
  assert.equal(Core.addDays('2026-03-28', 3), '2026-03-31'); // mudança de hora não afeta
  assert.equal(Core.dayCount('2026-01-01', '2026-12-31'), 365);
  assert.equal(Core.isIsoDate('2026-02-30'), false);
});

test('rateio: um registo semanal divide-se proporcionalmente pelos dias', () => {
  const r = rec({ inicio: '2026-11-02', fim: '2026-11-08', custo: 70, impressoes: 700 });
  const part = Core.clip(r, '2026-11-01', '2026-11-04');
  assert.equal(part.inicio, '2026-11-02');
  assert.equal(part.fim, '2026-11-04');
  close(part.custo, 30);
  close(part.impressoes, 300);
  assert.equal(Core.clip(r, '2026-11-09', '2026-11-30'), null);
  assert.equal(Core.clip(r, '2026-11-01', '2026-11-30'), r);
});

test('séries: a soma dos intervalos é igual ao total, em qualquer granularidade', () => {
  const recs = [
    rec({ inicio: '2026-01-01', fim: '2026-01-31', custo: 310 }),
    rec({ inicio: '2026-02-01', fim: '2026-02-01', custo: 5 }),
    rec({ campaignId: 'c2', inicio: '2026-01-20', fim: '2026-02-10', custo: 22 }),
  ];
  for (const g of ['dia', 'semana', 'mes']) {
    const s = Core.series(recs, '2026-01-01', '2026-02-28', g);
    const sum = s.reduce((a, b) => a + (b.totals ? b.totals.custo : 0), 0);
    close(sum, 337, 1e-6);
  }
  const months = Core.series(recs, '2026-01-01', '2026-02-28', 'mes');
  assert.equal(months.length, 2);
  close(months[0].totals.custo, 310 + 12);
  const weeks = Core.buckets('2026-01-01', '2026-01-31', 'semana');
  assert.equal(weeks[0].from, '2026-01-01');
  assert.equal(weeks[0].start, '2025-12-29');
  assert.equal(weeks.at(-1).to, '2026-01-31');
});

test('séries: intervalos sem registos ficam a null (não a zero)', () => {
  const s = Core.series([rec({ inicio: '2026-01-02', fim: '2026-01-02', custo: 1 })], '2026-01-01', '2026-01-03', 'dia');
  assert.equal(s[0].totals, null);
  assert.equal(s[1].totals.custo, 1);
  assert.equal(s[2].totals, null);
});

test('agregação: métricas derivadas', () => {
  const t = Core.aggregate([rec({ impressoes: 1000, cliques: 50, custo: 25, conversoes: 5, valor: 100 })]);
  close(t.ctr, 0.05);
  close(t.cpc, 0.5);
  close(t.taxaConv, 0.1);
  close(t.cpa, 5);
  close(t.roas, 4);
  const z = Core.aggregate([]);
  assert.equal(z.ctr, null);
  assert.equal(z.cpa, null);
  assert.equal(z.roas, null);
});

test('conflitos: períodos sobrepostos no mesmo nível são detetados', () => {
  const a = rec({ inicio: '2026-01-01', fim: '2026-01-07' });
  const recs = [a];
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-01-07', fim: '2026-01-07' })), a);
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-01-08', fim: '2026-01-14' })), null);
  assert.equal(Core.findConflict(recs, rec({ campaignId: 'c2', inicio: '2026-01-03' })), null);
  // O próprio registo (edição) não conta
  assert.equal(Core.findConflict(recs, { ...a, fim: '2026-01-10' }), null);
});

test('conflitos: total da campanha não pode coexistir com detalhe no mesmo período', () => {
  const total = rec({ inicio: '2026-01-01', fim: '2026-01-31' });
  const g1 = rec({ inicio: '2026-02-01', fim: '2026-02-01', grupo: 'Marca' });
  const recs = [total, g1];
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-01-10', grupo: 'Marca' })), total);
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-02-01' })), g1);
  // Grupos diferentes no mesmo dia: permitido
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-02-01', grupo: 'Genéricas' })), null);
  // Mesmo grupo (sem distinguir maiúsculas): conflito
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-02-01', grupo: ' marca ' })), g1);
  // Palavra-chave dentro de um grupo que já tem total: conflito
  assert.equal(Core.findConflict(recs, rec({ inicio: '2026-02-01', grupo: 'Marca', palavra: 'sapatos' })), g1);
  // Palavras-chave diferentes no mesmo grupo: permitido
  const kw = rec({ inicio: '2026-03-01', grupo: 'G', palavra: 'a' });
  assert.equal(Core.findConflict([kw], rec({ inicio: '2026-03-01', grupo: 'G', palavra: 'b' })), null);
});

test('validação de registos', () => {
  assert.equal(Core.validateRecord(rec({ impressoes: 10, cliques: 2 })), null);
  assert.match(Core.validateRecord(rec({ cliques: 20, impressoes: 10 })), /cliques/);
  assert.match(Core.validateRecord(rec({ custo: -1 })), /negativos/);
  assert.match(Core.validateRecord(rec({ fim: '2025-12-31' })), /anterior/);
  assert.match(Core.validateRecord(rec({ palavra: 'x' })), /grupo/);
  assert.match(Core.validateRecord(rec({ impressoes: 1.5 })), /inteiros/);
  assert.match(Core.validateRecord(rec({ custo: Number.NaN })), /inválidos/);
  assert.match(Core.validateRecord(rec({ campaignId: '' })), /campanha/);
});

test('ritmo: projeção com base nos dias com dados', () => {
  const recs = [rec({ inicio: '2026-11-01', fim: '2026-11-10', custo: 100, conversoes: 4 })];
  const p = Core.pacing(recs, '2026-11-05', '2026-11-12', 450, 20);
  assert.equal(p.dias, 30);
  assert.equal(p.diasComDados, 10);
  close(p.projCusto, 300);
  close(p.projConv, 12);
  close(p.pctGasto, 100 / 450);
  close(p.pctProj, 300 / 450);
  close(p.ritmoDiarioRestante, 350 / 20);
  assert.equal(Core.pacingStatus(p), 'abaixo');
  assert.equal(Core.pacingStatus({ ...p, pctProj: 1.2 }), 'acima');
  assert.equal(Core.pacingStatus({ ...p, pctProj: 0.95 }), 'ok');
});

test('ritmo: mês passado não é projetado e mês sem dados não tem projeção', () => {
  const recs = [rec({ inicio: '2026-10-01', fim: '2026-10-15', custo: 150 })];
  const past = Core.pacing(recs, '2026-10-01', '2026-11-05', 300);
  assert.equal(past.completo, true);
  close(past.projCusto, 150);
  const empty = Core.pacing(recs, '2026-11-01', '2026-11-05', 300);
  assert.equal(empty.projCusto, null);
  assert.equal(Core.pacingStatus(empty), null);
});

test('orçamento mensal: explícito ou diário × dias do mês', () => {
  assert.equal(Core.monthlyBudget({ orcamentoMensal: 500, orcamento: 10 }, '2026-02-01'), 500);
  assert.equal(Core.monthlyBudget({ orcamento: 10 }, '2026-02-01'), 280);
  assert.equal(Core.monthlyBudget({}, '2026-02-01'), null);
});

test('números e datas em formato português', () => {
  assert.equal(Core.toNum('1.234,56'), 1234.56);
  assert.equal(Core.toNum('1,234.56'), 1234.56);
  assert.equal(Core.toNum('12,5 €'), 12.5);
  assert.equal(Core.toNum(''), 0);
  assert.ok(Number.isNaN(Core.toNum('abc')));
  assert.equal(Core.toIsoDate('5/11/2026'), '2026-11-05');
  assert.equal(Core.toIsoDate('2026-11-05'), '2026-11-05');
  assert.equal(Core.toIsoDate('31/02/2026'), null);
  assert.equal(Core.csvNum(12.345), '12,35');
});

test('CSV: separador, aspas e quebras de linha', () => {
  const rows = Core.parseCsv('﻿a;b;c\r\n1;"x;y";"diz ""olá"""\n\n2;;3\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x;y', 'diz "olá"'], ['2', '', '3']]);
  assert.deepEqual(Core.parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.equal(Core.csvCell('a;b'), '"a;b"');
});

test('migração: dados da versão 1 passam para a versão 2', () => {
  const v1 = {
    campaigns: [{ id: 'c1', nome: 'X' }],
    records: [{ id: 'r1', campaignId: 'c1', data: '2026-01-02', custo: '3' }, { id: 'r2', campaignId: 'zz', data: '2026-01-02' }],
  };
  const d = Core.migrate(v1, uid);
  assert.equal(d.versao, 2);
  assert.equal(d.accounts.length, 1);
  assert.equal(d.campaigns[0].accountId, d.accounts[0].id);
  assert.equal(d.currentAccountId, d.accounts[0].id);
  assert.equal(d.records.length, 1, 'registos órfãos são descartados');
  assert.equal(d.records[0].inicio, '2026-01-02');
  assert.equal(d.records[0].fim, '2026-01-02');
  assert.equal(d.records[0].custo, 3);
  assert.equal('data' in d.records[0], false);
  assert.deepEqual(d.notes, []);
  assert.equal(v1.records[0].data, '2026-01-02', 'não altera o original');
});

test('juntar ficheiros: atualiza por id e acrescenta o resto', () => {
  const base = Core.migrate({ accounts: [{ id: 'a', nome: 'A' }], campaigns: [{ id: 'c', nome: 'velho', accountId: 'a' }] }, uid);
  const inc = Core.migrate({ accounts: [{ id: 'b', nome: 'B' }], campaigns: [{ id: 'c', nome: 'novo', accountId: 'a' }, { id: 'd', nome: 'D', accountId: 'b' }] }, uid);
  const m = Core.merge(base, inc);
  assert.equal(m.accounts.length, 2);
  assert.equal(m.campaigns.find((c) => c.id === 'c').nome, 'novo');
  assert.equal(m.campaigns.length, 2);
  assert.equal(m.currentAccountId, 'a');
});

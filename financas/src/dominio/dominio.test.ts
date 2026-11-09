import { describe, expect, it } from 'vitest';
import { estadoInicial, proximaData } from './dadosIniciais';
import { fluxoMes, estimativaRecorrente, orcamentoMes } from './fluxos';
import { lerNumero } from './formato';
import { posicao, resumoCarteira } from './investimentos';
import { normalizarEstado } from './normalizar';
import { projetar, resumoFundo, resumoObjetivo, simularDca, simularDesemprego, validarAlocacao } from './planeamento';
import { lancarVencidas, ocorrencias } from './recorrencias';
import { composicao, jurosEstimados, saldoConta } from './saldos';
import type { Estado, Movimento, Recorrente } from './tipos';
import { calcularAlertas } from './alertas';

const HOJE = '2026-11-09';

function mov(p: Partial<Movimento>): Movimento {
  return {
    id: Math.random().toString(36),
    tipo: 'despesa',
    data: HOJE,
    valor: 0,
    descricao: '',
    contaId: 'conta-ordem',
    contaDestinoId: null,
    categoriaId: null,
    meio: null,
    fixa: false,
    recorrenteId: null,
    valorBruto: null,
    notas: '',
    ...p,
  };
}

describe('formato', () => {
  it('lê números escritos à portuguesa', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('1234,5')).toBe(1234.5);
    expect(lerNumero('10.46')).toBe(10.46);
    expect(lerNumero('1 000 €')).toBe(1000);
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
  });
});

describe('recorrências', () => {
  const base = estadoInicial(HOJE);
  const r = base.recorrentes.find((x) => x.id === 'r-icloud') as Recorrente;

  it('mantém o dia âncora e respeita fins de mês', () => {
    const x = { ...r, inicio: '2026-01-31' };
    expect(ocorrencias(x, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('dados iniciais começam a partir de hoje', () => {
    expect(proximaData(HOJE, 5)).toBe('2026-12-05');
    expect(proximaData(HOJE, 25)).toBe('2026-11-25');
    expect(proximaData(HOJE, 25, 6)).toBe('2027-06-25');
    expect(base.recorrentes.every((x) => x.inicio >= HOJE)).toBe(true);
  });

  it('lança as ocorrências automáticas vencidas uma única vez', () => {
    const e1 = lancarVencidas(base, '2026-12-31') as Estado;
    const icloud = e1.movimentos.filter((m) => m.recorrenteId === 'r-icloud');
    expect(icloud.map((m) => m.data)).toEqual(['2026-12-05']);
    // não automáticas (combustível, refeições) não são lançadas
    expect(e1.movimentos.some((m) => m.recorrenteId === 'r-refeicoes')).toBe(false);
    expect(lancarVencidas(e1, '2026-12-31')).toBeNull();
  });

  it('o subsídio de alimentação é calculado por dia', () => {
    const e1 = lancarVencidas(base, '2026-11-30') as Estado;
    const sub = e1.movimentos.find((m) => m.recorrenteId === 'r-alimentacao');
    expect(sub?.valor).toBeCloseTo(230.12);
    expect(sub?.contaId).toBe('conta-refeicao');
  });
});

describe('saldos e património', () => {
  it('transferências entre contas próprias não são receitas nem despesas e não duplicam património', () => {
    const e = estadoInicial(HOJE);
    e.contas[0].saldoInicial = 1000;
    e.movimentos = [mov({ tipo: 'transferencia', valor: 300, contaId: 'conta-ordem', contaDestinoId: 'conta-ctt' })];
    const antes = composicao({ ...e, movimentos: [] }, HOJE).patrimonio;
    const depois = composicao(e, HOJE);
    expect(depois.patrimonio).toBeCloseTo(antes);
    expect(saldoConta(e, e.contas[0], HOJE)).toBe(700);
    expect(saldoConta(e, e.contas[1], HOJE)).toBe(5300);
    const f = fluxoMes(e, '2026-11');
    expect(f.receitas).toBe(0);
    expect(f.despesas).toBe(0);
  });

  it('o cartão-refeição não conta como dinheiro disponível nem para a taxa de poupança', () => {
    const e = estadoInicial(HOJE);
    e.movimentos = [
      mov({ tipo: 'receita', valor: 900, contaId: 'conta-ordem' }),
      mov({ tipo: 'despesa', valor: 300, contaId: 'conta-ordem' }),
      mov({ tipo: 'receita', valor: 230, contaId: 'conta-refeicao' }),
      mov({ tipo: 'despesa', valor: 40, contaId: 'conta-refeicao' }),
    ];
    const c = composicao(e, HOJE);
    expect(c.disponivel).toBe(600);
    expect(c.refeicao).toBe(190);
    expect(c.fundoEmergencia).toBe(5000);
    const f = fluxoMes(e, '2026-11');
    expect(f.receitas).toBe(900);
    expect(f.beneficios).toBe(230);
    expect(f.taxaPoupanca).toBeCloseTo(600 / 900);
  });

  it('o saldo inicial vale a partir da sua data', () => {
    const e = estadoInicial(HOJE);
    e.movimentos = [mov({ tipo: 'despesa', valor: 50, contaId: 'conta-ctt', data: '2026-11-01' })];
    expect(saldoConta(e, e.contas[1], HOJE)).toBe(5000);
    expect(saldoConta(e, e.contas[1], '2026-10-31')).toBe(0);
  });

  it('juros consideram o limite remunerado e a retenção', () => {
    const e = estadoInicial(HOJE);
    const j = jurosEstimados(e.contas[1], 8000, 28);
    expect(j?.bruto).toBeCloseTo(150);
    expect(j?.liquido).toBeCloseTo(108);
    expect(j?.tanl).toBeCloseTo(2.16);
  });
});

describe('orçamento e estimativas', () => {
  it('compara orçamento com despesa real', () => {
    const e = estadoInicial(HOJE);
    e.movimentos = [mov({ valor: 30, categoriaId: 'cat-saude' })];
    const saude = orcamentoMes(e, '2026-11').find((l) => l.categoriaId === 'cat-saude');
    expect(saude?.excedido).toBe(true);
    expect(saude?.utilizacao).toBeCloseTo(1.2);
  });

  it('estimativa recorrente separa benefícios e ignora valores por definir', () => {
    const est = estimativaRecorrente(estadoInicial(HOJE));
    // 1000 + 1000/12 + 1000/12
    expect(est.receitas).toBeCloseTo(1166.67, 1);
    expect(est.beneficios).toBeCloseTo(230.12);
    expect(est.despesas).toBeCloseTo(9.99 + 5 + 38 + 25);
    expect(est.despesasRefeicao).toBeCloseTo(37.5);
    expect(est.porDefinir).toBe(1);
    expect(est.liquidoPorConfirmar).toBe(3);
  });
});

describe('investimentos', () => {
  it('custo médio ponderado, vendas e comissões', () => {
    const ops = [
      { id: '1', ativoId: 'a', tipo: 'compra' as const, data: '2026-01-01', quantidade: 10, preco: 100, comissao: 2, contaId: null, notas: '' },
      { id: '2', ativoId: 'a', tipo: 'compra' as const, data: '2026-02-01', quantidade: 10, preco: 120, comissao: 2, contaId: null, notas: '' },
      { id: '3', ativoId: 'a', tipo: 'venda' as const, data: '2026-03-01', quantidade: 5, preco: 130, comissao: 1, contaId: null, notas: '' },
    ];
    const p = posicao('a', ops);
    expect(p.quantidade).toBe(15);
    expect(p.precoMedio).toBeCloseTo(110.2);
    expect(p.custo).toBeCloseTo(1653);
    expect(p.realizado).toBeCloseTo(5 * 130 - 1 - 5 * 110.2);
  });

  it('compras pagas por uma conta saem dessa conta sem alterar o património', () => {
    const e = estadoInicial(HOJE);
    e.contas[0].saldoInicial = 2000;
    const antes = composicao(e, HOJE).patrimonio;
    e.ativos = [{ id: 'a', nome: 'ETF', identificador: 'X', categoria: 'etf-acoes', precos: [], notas: '' }];
    e.operacoes = [{ id: 'o', ativoId: 'a', tipo: 'compra', data: HOJE, quantidade: 10, preco: 100, comissao: 0, contaId: 'conta-ordem', notas: '' }];
    const c = composicao(e, HOJE);
    expect(c.disponivel).toBe(1000);
    expect(c.carteira).toBe(1000);
    expect(c.patrimonio).toBeCloseTo(antes);
    e.ativos[0].precos = [{ data: HOJE, preco: 110 }];
    const r = resumoCarteira(e);
    expect(r.ganhoLatente).toBeCloseTo(100);
    expect(r.rentabilidade).toBeCloseTo(0.1);
  });
});

describe('planeamento', () => {
  it('fundo de emergência: objetivo, cobertura e tempo até ao objetivo', () => {
    const e = estadoInicial(HOJE);
    e.fundo.reforcoMensal = 100;
    const f = resumoFundo(e, 300);
    // gás 38 + saúde 25 + combustível 0 + refeições 37,5 = 100,5 por mês
    expect(f.essencial).toBeCloseTo(100.5);
    expect(f.objetivo).toBeCloseTo(603);
    expect(f.mesesCobertos).toBeCloseTo(300 / 100.5);
    expect(f.mesesParaObjetivo).toBe(4);
    expect(simularDesemprego(1000, 300, 100).meses).toBe(5);
    expect(simularDesemprego(1000, 300, 400).meses).toBe(Number.POSITIVE_INFINITY);
  });

  it('objetivos: progresso e reforço necessário até à data limite', () => {
    const o = { id: 'o', nome: 'Férias', valorAlvo: 1200, dataLimite: '2027-11-09', contaId: null, reforcoMensal: 50, valorInicial: 0, contribuicoes: [{ id: 'c', data: HOJE, valor: 200, notas: '' }], notas: '' };
    const r = resumoObjetivo(o, HOJE);
    expect(r.atual).toBe(200);
    expect(r.reforcoNecessario).toBeCloseTo(1000 / 11, 0);
    expect(r.noRitmo).toBe(false);
    expect(r.contribuiuEsteMes).toBe(true);
  });

  it('DCA com taxa 0 iguala o capital investido', () => {
    const p = simularDca({ capitalInicial: 1000, reforco: 100, anos: 2, frequencia: 'mensal', taxaAnual: 0 });
    expect(p.at(-1)?.valor).toBeCloseTo(3400);
    const q = simularDca({ capitalInicial: 1000, reforco: 0, anos: 1, frequencia: 'mensal', taxaAnual: 5 });
    expect(q.at(-1)?.valor).toBeCloseTo(1050);
  });

  it('projeção sem crescimento acumula a poupança mensal', () => {
    const e = estadoInicial(HOJE);
    const p = projetar({ receitaMensal: 1000, despesaMensal: 600, liquidez: 5000, investimentos: 0 }, e.pressupostos.projecao, 3);
    expect(p.at(-1)?.patrimonio).toBeCloseTo(5000 + 400 * 36);
  });

  it('alocação valida a soma de 100 %', () => {
    expect(validarAlocacao({ a: 50, b: 30, c: 20 }, 1000).valido).toBe(true);
    const v = validarAlocacao({ a: 50, b: 30 }, 1000);
    expect(v.valido).toBe(false);
    expect(v.porAlocar).toBe(200);
  });
});

describe('alertas e importação', () => {
  it('avisa valores por confirmar e pagamentos próximos', () => {
    const ids = calcularAlertas(estadoInicial(HOJE), HOJE).map((a) => a.id.split('|')[0]);
    expect(ids).toContain('liq');
    expect(ids).toContain('def');
    expect(ids).toContain('rec');
  });

  it('importação rejeita ficheiros estranhos e mantém os dados', () => {
    expect(() => normalizarEstado({ ola: 1 })).toThrow();
    const e = estadoInicial(HOJE);
    const n = normalizarEstado(JSON.parse(JSON.stringify(e)));
    expect(n.contas).toHaveLength(3);
    expect(n.recorrentes).toHaveLength(e.recorrentes.length);
    expect(composicao(n, HOJE).patrimonio).toBe(composicao(e, HOJE).patrimonio);
  });
});

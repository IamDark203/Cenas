// Testes de aceitação I e J (Módulo 18) e regras do simulador, com os produtos reais da base.
import { describe, expect, it } from 'vitest';
import dados from '../../public/dados/produtos.json';
import { adequadoFundo, assinatura, detetarAlteracoes, liquidezImediata, rankingPersonalizado, simular, type BaseProdutos, type ParametrosSimulacao, type Produto } from './bancos';

const base = dados as unknown as BaseProdutos;
const prod = (id: string) => base.produtos.find((p) => p.id === id) as Produto;
const HOJE = '2026-11-10';
const prm = (p: Partial<ParametrosSimulacao>): ParametrosSimulacao => ({
  capitalInicial: 5000,
  reforcoMensal: 0,
  diaReforco: 1,
  reforcosExtra: [],
  meses: 12,
  dataAbertura: HOJE,
  requisitosCumpridos: [],
  taxaImposto: 28,
  incluirCustoContaOrdem: true,
  capitalizarOpcional: true,
  ...p,
});

describe('base de dados de produtos', () => {
  it('cada produto tem fonte oficial, data de verificação e estado da informação', () => {
    expect(base.produtos.length).toBeGreaterThanOrEqual(10);
    for (const p of base.produtos) {
      expect(p.fontes.length).toBeGreaterThan(0);
      for (const f of p.fontes) expect(f.url).toMatch(/^https:\/\/(www\.)?[a-z]+\.pt\//);
      expect(p.verificacao.ultima).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['verificada', 'parcial', 'desatualizada']).toContain(p.verificacao.estado);
      expect(base.instituicoes.some((i) => i.id === p.instituicaoId)).toBe(true);
    }
    // Instituições sem dados estão identificadas com o motivo
    for (const i of base.instituicoes.filter((x) => x.cobertura === 'sem-dados')) expect(i.motivo).toBeTruthy();
  });
});

describe('Teste J — simulação de conta com reforços (Banco CTT, Conta Poupança Livre)', () => {
  const r = simular(prod('ctt-conta-poupanca-livre'), prm({ reforcoMensal: 100, requisitosCumpridos: ['domiciliacao-ordenado'] }));
  it('evolução mensal, capital depositado e juros conforme as condições do produto', () => {
    expect(r.serie).toHaveLength(13);
    expect(r.totalReforcos).toBe(1200);
    // Só os primeiros 5.000 € são remunerados: 5000 × 3 % × 365/360
    expect(r.jurosBrutos).toBeCloseTo((5000 * 0.03 * 365) / 360, 1);
    expect(r.imposto).toBeCloseTo(r.jurosBrutos * 0.28, 1);
    expect(r.jurosLiquidos).toBeCloseTo(r.jurosBrutos - r.imposto, 2);
    expect(r.custos).toBe(0);
    // Juros pagos na conta à ordem (não capitalizam): saldo da poupança = depósitos
    expect(r.serie.at(-1)?.saldo).toBe(6200);
    expect(r.capitalFinal).toBeCloseTo(6200 + r.jurosLiquidos, 2);
  });
  it('sem cumprir as condições usa a taxa base de 0,50 %', () => {
    const b = simular(prod('ctt-conta-poupanca-livre'), prm({ reforcoMensal: 100 }));
    expect(b.jurosBrutos).toBeCloseTo((5000 * 0.005 * 365) / 360, 1);
  });
});

describe('regras do simulador', () => {
  it('capitalização no vencimento (Santander Conta Poupança Objetivo, máx. 2.500 €)', () => {
    const r = simular(prod('santander-conta-poupanca-objetivo'), prm({ capitalInicial: 2500, meses: 3 }));
    const dias = 92; // 10/11/2026 a 10/02/2027
    expect(r.jurosBrutos).toBeCloseTo((2500 * 0.0025 * dias) / 360, 2);
    expect(r.serie.at(-1)?.saldo).toBeCloseTo(2500 + r.jurosLiquidos, 2);
  });

  it('levantar antes do vencimento perde os juros (Novo Banco DP 3 meses)', () => {
    const r = simular(prod('novobanco-dp-3m-300'), prm({ capitalInicial: 150000, meses: 2 }));
    expect(r.jurosPerdidos).toBeGreaterThan(700);
    expect(r.jurosBrutos).toBe(0);
    const completo = simular(prod('novobanco-dp-3m-300'), prm({ capitalInicial: 150000, meses: 3 }));
    expect(completo.jurosBrutos).toBeCloseTo((150000 * 0.03 * 92) / 360, 0);
    expect(completo.jurosPerdidos).toBe(0);
  });

  it('taxa promocional não é tratada como permanente (Openbank)', () => {
    const r = simular(prod('openbank-poupanca-boas-vindas'), prm({ capitalInicial: 10000 }));
    const seisMeses = simular(prod('openbank-poupanca-boas-vindas'), prm({ capitalInicial: 10000, meses: 6 }));
    expect(r.jurosBrutos).toBeCloseTo(seisMeses.jurosBrutos, 0);
    expect(r.pressupostos.join(' ')).toMatch(/promocional/);
  });

  it('comissões da conta à ordem obrigatória reduzem o ganho (Crédito Agrícola)', () => {
    const r = simular(prod('ca-poupanca-gestao'), prm({ capitalInicial: 1000, requisitosCumpridos: ['conta-gestao-ca'] }));
    expect(r.custos).toBeCloseTo(3.5 * 12, 2);
    expect(r.ganhoLiquido).toBeLessThan(r.jurosLiquidos);
  });

  it('reforços em produto que não os aceita são ignorados com aviso', () => {
    const r = simular(prod('santander-deposito-poupanca-3m'), prm({ capitalInicial: 20000, reforcoMensal: 100, meses: 3 }));
    expect(r.totalReforcos).toBe(0);
    expect(r.avisos.join(' ')).toMatch(/não aceita reforços/);
  });
});

describe('Teste I — comparação de contas poupança', () => {
  it('compara rentabilidade líquida, comissões, requisitos, liquidez, fontes e datas', () => {
    const perfil = { capital: 5000, reforcoMensal: 0, meses: 12, requisitosCumpridos: ['domiciliacao-ordenado'], instituicoesCliente: [], liquidez: 'imediata' as const, semComissoes: false, taxaImposto: 28, incluirCustoContaOrdem: true };
    const ranking = rankingPersonalizado(base.produtos, perfil, HOJE);
    const ctt = ranking.find((l) => l.resultado.produto.id === 'ctt-conta-poupanca-livre');
    const cgd = ranking.find((l) => l.resultado.produto.id === 'cgd-poupanca-dinamica');
    expect(ctt?.excluido).toBeNull();
    // A CGD exige o serviço Caixa Azul/Private: sem o indicar, fica excluída e o motivo é explicado
    expect(cgd?.excluido).toMatch(/Condições de acesso/);
    // Depósitos com perda de juros ficam de fora quando a liquidez tem de ser imediata
    expect(ranking.find((l) => l.resultado.produto.id === 'santander-deposito-poupanca-3m')?.excluido).toBeTruthy();
    expect(ctt?.resultado.ganhoLiquido).toBeGreaterThan(cgd?.resultado.ganhoLiquido ?? 0);
    expect(ctt?.fatores.join(' ')).toMatch(/5.?000 €/);
    expect(liquidezImediata(prod('ctt-conta-poupanca-livre'))).toBe(true);
    expect(liquidezImediata(prod('cgd-caixapoupanca'))).toBe(false);
    for (const l of [ctt, cgd]) {
      expect(l?.resultado.produto.fontes[0].url).toBeTruthy();
      expect(l?.resultado.produto.verificacao.ultima).toBe('2026-11-10');
    }
  });

  it('não recomenda depósitos não mobilizáveis para o fundo de emergência', () => {
    expect(adequadoFundo(prod('novobanco-dp-3m-300')).adequado).toBe(false);
    expect(adequadoFundo(prod('ctt-conta-poupanca-livre')).adequado).toBe(true);
  });
});

describe('Módulo 16 — alterações bancárias com impacto', () => {
  it('deteta a descida da TANB e calcula o impacto anual líquido', () => {
    const p = prod('ctt-conta-poupanca-livre');
    const anterior = { [p.id]: assinatura(p) };
    const nova: Produto = { ...p, niveis: [{ ...p.niveis[0], escaloes: [{ de: 0, ate: null, tanb: 2 }] }, p.niveis[1]] };
    const alt = detetarAlteracoes([nova], anterior, [{ produtoId: p.id, saldo: 5000, nome: 'Poupança' }], ['domiciliacao-ordenado'], 28, HOJE);
    expect(alt[0].texto).toMatch(/desceu de 3 % para 2 %/);
    // 5000 × 1 % × (1 − 28 %) = 36 €
    expect(alt[0].impacto).toBeCloseTo(-36, 2);
  });
});

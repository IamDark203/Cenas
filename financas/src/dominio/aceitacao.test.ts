// Testes de aceitação do Módulo 18 (A–H). I e J estão em bancos.test.ts.
import { describe, expect, it } from 'vitest';
import { alocacoesConta, definirAlocacao, registarJuros, validarAlteracao } from './alocacoes';
import { estadoVazio } from './dadosIniciais';
import { analisarObjetivos, disponivelParaGastar, sugerirDistribuicao } from './orcamento';
import { resumoFundo } from './planeamento';
import { composicao, saldoConta } from './saldos';
import type { Conta, Estado, Recorrente } from './tipos';

const HOJE = '2026-11-10';

function conta(p: Partial<Conta> & Pick<Conta, 'id' | 'tipo'>): Conta {
  return { nome: p.id, instituicao: '', saldoInicial: 0, dataSaldoInicial: HOJE, tanb: null, tanl: null, limiteRemunerado: null, periodicidadeJuros: null, condicoes: '', fundoEmergencia: false, arquivada: false, notas: '', paraGastos: p.tipo === 'ordem', politicaJuros: 'nao-atribuido', jurosDestino: null, produtoId: null, ...p };
}

function despesaEssencial(valor: number): Recorrente {
  return { id: 'r-ess', tipo: 'despesa', descricao: 'Essenciais', valor, porDia: null, valorBruto: null, liquidoConfirmado: true, porDefinir: false, categoriaId: 'cat-habitacao', contaId: 'ordem', contaDestinoId: null, meio: 'debito', fixa: true, periodicidade: 'mensal', inicio: '2026-12-01', fim: null, automatico: true, ativo: true, geradoAte: null, notas: '' };
}

/** Conta poupança com 5000 € e um fundo de emergência alocado de 3500 €. */
function base(fundo = 3500, objetivoFundo?: { essencial: number; meses: number; minimo: number | null }): Estado {
  let e = estadoVazio(HOJE);
  e.contas = [conta({ id: 'poup', tipo: 'poupanca', saldoInicial: 5000 }), conta({ id: 'ordem', tipo: 'ordem', saldoInicial: 0 })];
  e = definirAlocacao(e, { id: 'fe', contaId: 'poup', nome: 'Fundo', tipo: 'fundo', valor: fundo }, HOJE, 'teste');
  if (objetivoFundo) {
    e.recorrentes = [despesaEssencial(objetivoFundo.essencial)];
    e.fundo = { ...e.fundo, usarSugestao: false, meses: objetivoFundo.meses, minimoProtegido: objetivoFundo.minimo };
  }
  return e;
}

describe('Módulo 18 — testes de aceitação', () => {
  it('A — fundo separado do saldo bancário', () => {
    const e = base();
    const s = saldoConta(e, e.contas[0], HOJE);
    const a = alocacoesConta(e, 'poup', s);
    expect(s).toBe(5000);
    expect(composicao(e, HOJE).fundoEmergencia).toBe(3500);
    expect(a.naoAtribuido).toBe(1500);
    // As alocações não criam património
    expect(composicao(e, HOJE).patrimonio).toBe(5000);
  });

  it('B — juros vão para o capital não atribuído', () => {
    const e0 = base();
    const e = registarJuros(e0, e0.contas[0], 12.5, HOJE, 5000);
    const s = saldoConta(e, e.contas[0], HOJE);
    expect(s).toBe(5012.5);
    expect(composicao(e, HOJE).fundoEmergencia).toBe(3500);
    expect(alocacoesConta(e, 'poup', s).naoAtribuido).toBe(1512.5);
    // Política proporcional: 3500/5000 = 70 % dos juros para o fundo
    const p = registarJuros({ ...e0, contas: [{ ...e0.contas[0], politicaJuros: 'proporcional' }, e0.contas[1]] }, { ...e0.contas[0], politicaJuros: 'proporcional' }, 12.5, HOJE, 5000);
    expect(composicao(p, HOJE).fundoEmergencia).toBeCloseTo(3508.75);
  });

  it('C — reforço insuficiente vai todo para o fundo', () => {
    const e = base(3000, { essencial: 0, meses: 6, minimo: 3500 });
    const d = sugerirDistribuicao(e, 500, HOJE);
    expect(d.find((l) => l.destino === 'fundo')?.valor).toBe(500);
    expect(d.find((l) => l.destino === 'disponivel')?.valor).toBe(0);
  });

  it('D — reforço superior ao necessário', () => {
    const e = base(3200, { essencial: 0, meses: 6, minimo: 3500 });
    const d = sugerirDistribuicao(e, 500, HOJE);
    expect(d.find((l) => l.destino === 'fundo')?.valor).toBe(300);
    expect(d.find((l) => l.destino === 'disponivel')?.valor).toBe(200);
  });

  it('E — alteração das despesas recalcula o objetivo sem baixar o mínimo', () => {
    const e = base(3500, { essencial: 450, meses: 9, minimo: 3500 });
    const r = resumoFundo(e, composicao(e, HOJE).fundoEmergencia, HOJE);
    expect(r.calculado).toBe(4050);
    expect(r.objetivo).toBe(4050);
    expect(r.falta).toBe(550);
    // Com despesas mais baixas, o mínimo protegido mantém-se
    const e2 = base(3500, { essencial: 300, meses: 9, minimo: 3500 });
    expect(resumoFundo(e2, 3500, HOJE).objetivo).toBe(3500);
    // Exemplo do enunciado: 390 × 9 = 3510 > 3500
    expect(resumoFundo(base(3500, { essencial: 390, meses: 9, minimo: 3500 }), 0, HOJE).objetivo).toBe(3510);
  });

  it('F — objetivo de poupança: 1200 € em 6 meses = 200 €/mês e viabilidade', () => {
    const e = base();
    e.recorrentes = [
      { ...despesaEssencial(400), id: 'r1' },
      { ...despesaEssencial(1000), id: 'sal', tipo: 'receita', categoriaId: 'rec-salario', descricao: 'Salário' },
    ];
    e.objetivos = [{ id: 'o', nome: 'Férias', valorAlvo: 1200, dataLimite: '2027-05-10', contaId: 'poup', reforcoMensal: 0, valorInicial: 0, contribuicoes: [], notas: '', prioridade: 1 }];
    const [a] = analisarObjetivos(e, HOJE);
    expect(a.mesesRestantes).toBe(6);
    expect(a.necessario).toBe(200);
    expect(a.capacidadeDisponivel).toBe(600);
    expect(a.viabilidade).toBe('confortavel');
    // Com rendimento de 600 € sobram 200 €: demasiado exigente (usa 100 %)
    e.recorrentes[1] = { ...e.recorrentes[1], valor: 600 };
    expect(analisarObjetivos(e, HOJE)[0].viabilidade).toBe('exigente');
  });

  it('G — o cartão-refeição não entra no dinheiro bancário disponível', () => {
    let e = estadoVazio(HOJE);
    e.contas = [conta({ id: 'ordem', tipo: 'ordem', saldoInicial: 1000 }), conta({ id: 'ref', tipo: 'refeicao', saldoInicial: 220 })];
    e = { ...e };
    const c = composicao(e, HOJE);
    expect(c.disponivel).toBe(1000);
    expect(c.bancario).toBe(1000);
    expect(c.refeicao).toBe(220);
    expect(disponivelParaGastar(e, HOJE).agora).toBe(1000);
  });

  it('H — alocações não podem ultrapassar o saldo', () => {
    let e = base();
    e = definirAlocacao(e, { contaId: 'poup', nome: 'Outros', tipo: 'outro', valor: 1500 }, HOJE, 'teste');
    const a = alocacoesConta(e, 'poup', 5000);
    expect(a.alocado).toBe(5000);
    expect(a.naoAtribuido).toBe(0);
    expect(validarAlteracao(a.naoAtribuido, 0, 1)).not.toBeNull();
    expect(validarAlteracao(a.naoAtribuido, 1500, 1400)).toBeNull();
    expect(validarAlteracao(a.naoAtribuido, 0, -5)).not.toBeNull();
  });
});

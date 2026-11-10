import { fimMes } from './datas';
import { alocacoesConta, fundoNaConta } from './alocacoes';
import { fluxoOperacao, resumoCarteira } from './investimentos';
import type { Conta, Estado, Movimento, TipoConta } from './tipos';

export const NOMES_TIPO_CONTA: Record<TipoConta, string> = {
  ordem: 'Conta à ordem',
  poupanca: 'Conta poupança',
  prazo: 'Depósito a prazo',
  refeicao: 'Cartão-refeição',
  investimento: 'Carteira de investimento',
  outra: 'Outra reserva',
};

/** Efeito de um movimento no saldo de uma conta (positivo = entra dinheiro). */
export function efeitoNaConta(m: Movimento, contaId: string): number {
  switch (m.tipo) {
    case 'receita':
      return m.contaId === contaId ? m.valor : 0;
    case 'despesa':
      return m.contaId === contaId ? -m.valor : 0;
    case 'ajuste':
      return m.contaId === contaId ? m.valor : 0;
    case 'transferencia':
      if (m.contaId === contaId) return -m.valor;
      if (m.contaDestinoId === contaId) return m.valor;
      return 0;
  }
}

/** Saldo da conta no fim do dia `ate`. O saldo inicial vale desde o início do dia `dataSaldoInicial`. */
export function saldoConta(estado: Estado, conta: Conta, ate = '9999-12-31'): number {
  if (ate < conta.dataSaldoInicial) return 0;
  let s = conta.saldoInicial;
  for (const m of estado.movimentos) {
    if (m.data >= conta.dataSaldoInicial && m.data <= ate) s += efeitoNaConta(m, conta.id);
  }
  for (const o of estado.operacoes) {
    if (o.contaId === conta.id && o.data >= conta.dataSaldoInicial && o.data <= ate) s += fluxoOperacao(o);
  }
  return Math.round(s * 100) / 100;
}

export interface Composicao {
  /** Saldo das contas à ordem que não está alocado ao fundo de emergência. */
  disponivel: number;
  /** Contas poupança, depósitos e outras reservas, sem a parte alocada ao fundo de emergência. */
  poupancas: number;
  /** Soma das alocações ao fundo de emergência (limitada ao saldo de cada conta). */
  fundoEmergencia: number;
  /** Alocações (fundo, objetivos, despesas futuras, etc.) que excedem o saldo das contas. */
  excessoAlocacoes: number;
  /** Benefício em cartão-refeição (não é dinheiro convertível). */
  refeicao: number;
  /** Liquidez parada nas carteiras de investimento. */
  liquidezCarteiras: number;
  /** Valor de mercado dos ativos. */
  carteira: number;
  /** Custo de aquisição dos ativos detidos. */
  investido: number;
  /** Contas à ordem, poupança e depósitos (inclui as do fundo de emergência). */
  bancario: number;
  patrimonio: number;
  porConta: { conta: Conta; saldo: number }[];
}

export function composicao(estado: Estado, ate = '9999-12-31'): Composicao {
  const c: Composicao = {
    disponivel: 0,
    poupancas: 0,
    fundoEmergencia: 0,
    excessoAlocacoes: 0,
    refeicao: 0,
    liquidezCarteiras: 0,
    carteira: 0,
    investido: 0,
    bancario: 0,
    patrimonio: 0,
    porConta: [],
  };
  for (const conta of estado.contas) {
    const s = saldoConta(estado, conta, ate);
    c.porConta.push({ conta, saldo: s });
    if (['ordem', 'poupanca', 'prazo'].includes(conta.tipo)) c.bancario += s;
    if (conta.tipo === 'refeicao') {
      c.refeicao += s;
      continue;
    }
    // A parte alocada ao fundo de emergência é contada à parte; o resto conta pelo tipo da conta.
    const fe = fundoNaConta(estado, conta.id, s);
    c.fundoEmergencia += fe;
    c.excessoAlocacoes += alocacoesConta(estado, conta.id, s).excesso;
    const resto = s - fe;
    if (conta.tipo === 'ordem') c.disponivel += resto;
    else if (conta.tipo === 'investimento') c.liquidezCarteiras += resto;
    else c.poupancas += resto;
  }
  const carteira = resumoCarteira(estado, ate);
  c.carteira = carteira.valor;
  c.investido = carteira.investido;
  c.patrimonio =
    c.disponivel +
    c.poupancas +
    c.fundoEmergencia +
    c.liquidezCarteiras +
    c.carteira +
    (estado.perfil.incluirRefeicaoPatrimonio ? c.refeicao : 0);
  return c;
}

export interface PontoPatrimonio extends Omit<Composicao, 'porConta'> {
  mes: string;
}

/** Composição no fim de cada mês (o mês atual é calculado até hoje). */
export function seriePatrimonio(estado: Estado, meses: string[], hojeIso: string): PontoPatrimonio[] {
  return meses.map((mes) => {
    const fim = fimMes(mes);
    const { porConta: _ignorado, ...resto } = composicao(estado, fim < hojeIso ? fim : hojeIso);
    return { mes, ...resto };
  });
}

/** Juros anuais estimados de uma conta remunerada (bruto e líquido). */
export function jurosEstimados(conta: Conta, saldo: number, retencao: number) {
  if (!conta.tanb) return null;
  const base = conta.limiteRemunerado != null ? Math.min(saldo, conta.limiteRemunerado) : saldo;
  const tanl = conta.tanl ?? conta.tanb * (1 - retencao / 100);
  return { base: Math.max(0, base), tanl, bruto: Math.max(0, base) * (conta.tanb / 100), liquido: Math.max(0, base) * (tanl / 100) };
}

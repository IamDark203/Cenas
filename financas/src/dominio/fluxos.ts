import { mesDe } from './datas';
import { equivalenteMensal } from './recorrencias';
import type { Estado, Movimento } from './tipos';

/** Contas de cartão-refeição: os valores aí são benefícios, não dinheiro convertível. */
export function idsRefeicao(estado: Estado): Set<string> {
  return new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
}

export interface FluxoMes {
  mes: string;
  /** Receitas em dinheiro (exclui benefícios em cartão-refeição). */
  receitas: number;
  /** Despesas pagas com dinheiro (exclui as pagas com cartão-refeição). */
  despesas: number;
  beneficios: number;
  despesasRefeicao: number;
  /** Receitas − despesas, só em dinheiro. Transferências entre contas próprias não contam. */
  poupanca: number;
  taxaPoupanca: number;
  investido: number;
}

export function fluxoMes(estado: Estado, mes: string, refeicao = idsRefeicao(estado)): FluxoMes {
  let receitas = 0;
  let despesas = 0;
  let beneficios = 0;
  let despesasRefeicao = 0;
  for (const m of estado.movimentos) {
    if (mesDe(m.data) !== mes) continue;
    const ehRefeicao = refeicao.has(m.contaId);
    if (m.tipo === 'receita') {
      if (ehRefeicao) beneficios += m.valor;
      else receitas += m.valor;
    } else if (m.tipo === 'despesa') {
      if (ehRefeicao) despesasRefeicao += m.valor;
      else despesas += m.valor;
    }
  }
  let investido = 0;
  for (const o of estado.operacoes) {
    if (o.tipo === 'compra' && mesDe(o.data) === mes) investido += o.quantidade * o.preco + o.comissao;
  }
  const poupanca = receitas - despesas;
  return {
    mes,
    receitas,
    despesas,
    beneficios,
    despesasRefeicao,
    poupanca,
    taxaPoupanca: receitas > 0 ? poupanca / receitas : 0,
    investido,
  };
}

export function serieFluxos(estado: Estado, meses: string[]): FluxoMes[] {
  const refeicao = idsRefeicao(estado);
  return meses.map((m) => fluxoMes(estado, m, refeicao));
}

export function somarFluxos(serie: FluxoMes[]) {
  const t = serie.reduce(
    (a, f) => ({
      receitas: a.receitas + f.receitas,
      despesas: a.despesas + f.despesas,
      beneficios: a.beneficios + f.beneficios,
      despesasRefeicao: a.despesasRefeicao + f.despesasRefeicao,
      investido: a.investido + f.investido,
    }),
    { receitas: 0, despesas: 0, beneficios: 0, despesasRefeicao: 0, investido: 0 },
  );
  const poupanca = t.receitas - t.despesas;
  const n = Math.max(1, serie.length);
  return {
    ...t,
    poupanca,
    taxaPoupanca: t.receitas > 0 ? poupanca / t.receitas : 0,
    mediaReceitas: t.receitas / n,
    mediaDespesas: t.despesas / n,
  };
}

export function nomeCategoria(estado: Estado, id: string | null): string {
  return estado.categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';
}

/** Despesas (todas, incluindo cartão-refeição) por categoria nos meses indicados, da maior para a menor. */
export function despesasPorCategoria(estado: Estado, meses: string[]) {
  const set = new Set(meses);
  const mapa = new Map<string, number>();
  for (const m of estado.movimentos) {
    if (m.tipo !== 'despesa' || !set.has(mesDe(m.data))) continue;
    const k = m.categoriaId ?? '';
    mapa.set(k, (mapa.get(k) ?? 0) + m.valor);
  }
  return [...mapa.entries()]
    .map(([id, valor]) => ({ id, nome: nomeCategoria(estado, id || null), valor }))
    .filter((c) => c.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

export interface LinhaOrcamento {
  categoriaId: string;
  nome: string;
  orcamento: number | null;
  real: number;
  utilizacao: number;
  excedido: boolean;
}

export function orcamentoMes(estado: Estado, mes: string): LinhaOrcamento[] {
  const reais = new Map(despesasPorCategoria(estado, [mes]).map((c) => [c.id, c.valor]));
  return estado.categorias
    .filter((c) => c.tipo === 'despesa')
    .map((c) => {
      const real = reais.get(c.id) ?? 0;
      const orc = c.orcamento;
      return {
        categoriaId: c.id,
        nome: c.nome,
        orcamento: orc,
        real,
        utilizacao: orc && orc > 0 ? real / orc : real > 0 ? 1 : 0,
        excedido: orc != null && real > orc + 0.005,
      };
    })
    .filter((l) => l.orcamento != null || l.real > 0);
}

/** Estimativa mensal a partir das receitas e despesas recorrentes ativas. */
export function estimativaRecorrente(estado: Estado) {
  const refeicao = idsRefeicao(estado);
  const e = { receitas: 0, beneficios: 0, despesas: 0, despesasRefeicao: 0, porDefinir: 0, liquidoPorConfirmar: 0 };
  for (const r of estado.recorrentes) {
    if (!r.ativo || r.tipo === 'transferencia') continue;
    const v = equivalenteMensal(r);
    const ref = refeicao.has(r.contaId);
    if (r.porDefinir) e.porDefinir++;
    if (r.tipo === 'receita') {
      if (ref) e.beneficios += v;
      else e.receitas += v;
      if (!r.liquidoConfirmado && r.valorBruto != null) e.liquidoPorConfirmar++;
    } else if (ref) e.despesasRefeicao += v;
    else e.despesas += v;
  }
  return { ...e, poupanca: e.receitas - e.despesas, taxaPoupanca: e.receitas > 0 ? (e.receitas - e.despesas) / e.receitas : 0 };
}

/** Primeira data com dados (saldo inicial de uma conta, movimento ou operação). */
export function inicioDados(estado: Estado, hojeIso: string): string {
  let min = hojeIso;
  for (const c of estado.contas) if (c.dataSaldoInicial < min) min = c.dataSaldoInicial;
  for (const m of estado.movimentos) if (m.data < min) min = m.data;
  for (const o of estado.operacoes) if (o.data < min) min = o.data;
  return min;
}

export function primeiroMes(estado: Estado, mesAtual: string): string {
  let min = mesAtual;
  for (const c of estado.contas) if (mesDe(c.dataSaldoInicial) < min) min = mesDe(c.dataSaldoInicial);
  for (const m of estado.movimentos) if (mesDe(m.data) < min) min = mesDe(m.data);
  for (const o of estado.operacoes) if (mesDe(o.data) < min) min = mesDe(o.data);
  return min;
}

export function ordenarMovimentos(lista: Movimento[]): Movimento[] {
  return [...lista].sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao));
}

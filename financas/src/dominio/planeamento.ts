import { diferencaDias, mesDe } from './datas';
import { equivalenteMensal } from './recorrencias';
import type { Estado, Objetivo } from './tipos';

// ---------- Fundo de emergência ----------

export function despesaEssencialMensal(estado: Estado): number {
  const ids = new Set(estado.fundo.essenciaisIds);
  const recorrentes = estado.recorrentes
    .filter((r) => r.ativo && r.tipo === 'despesa' && ids.has(r.id))
    .reduce((s, r) => s + equivalenteMensal(r), 0);
  return recorrentes + estado.fundo.necessidadesBasicas;
}

export function objetivoCalculadoFundo(estado: Estado, meses = estado.fundo.meses): number {
  const extra = estado.fundo.extraordinarias.reduce((s, e) => s + e.valor, 0);
  return meses * despesaEssencialMensal(estado) + extra;
}

export function resumoFundo(estado: Estado, capital: number) {
  const essencial = despesaEssencialMensal(estado);
  const objetivo = estado.fundo.objetivoManual ?? objetivoCalculadoFundo(estado);
  const falta = Math.max(0, objetivo - capital);
  const reforco = estado.fundo.reforcoMensal;
  return {
    capital,
    essencial,
    objetivo,
    falta,
    progresso: objetivo > 0 ? Math.min(1, capital / objetivo) : 0,
    mesesCobertos: essencial > 0 ? capital / essencial : null,
    mesesParaObjetivo: falta === 0 ? 0 : reforco > 0 ? Math.ceil(falta / reforco) : null,
  };
}

/** Durante quantos meses o capital cobre as despesas, com um rendimento restante (ex.: subsídio de desemprego). */
export function simularDesemprego(capital: number, despesaMensal: number, rendimentoRestante: number) {
  const defice = despesaMensal - rendimentoRestante;
  if (defice <= 0) return { meses: Number.POSITIVE_INFINITY, defice: 0, serie: [] as { mes: number; saldo: number }[] };
  const meses = capital / defice;
  const serie: { mes: number; saldo: number }[] = [];
  const n = Math.min(120, Math.ceil(meses) + 1);
  for (let i = 0; i <= n; i++) serie.push({ mes: i, saldo: Math.max(0, capital - defice * i) });
  return { meses, defice, serie };
}

// ---------- Objetivos de poupança ----------

export function valorAtualObjetivo(o: Objetivo): number {
  return o.valorInicial + o.contribuicoes.reduce((s, c) => s + c.valor, 0);
}

export function resumoObjetivo(o: Objetivo, hojeIso: string) {
  const atual = valorAtualObjetivo(o);
  const falta = Math.max(0, o.valorAlvo - atual);
  const mesesAteLimite = o.dataLimite ? Math.max(0, diferencaDias(hojeIso, o.dataLimite) / 30.44) : null;
  const reforcoNecessario =
    falta === 0 ? 0 : mesesAteLimite != null ? (mesesAteLimite >= 1 ? falta / Math.floor(mesesAteLimite) : falta) : null;
  const mesesComReforco = falta === 0 ? 0 : o.reforcoMensal > 0 ? Math.ceil(falta / o.reforcoMensal) : null;
  const contribuiuEsteMes = o.contribuicoes.some((c) => mesDe(c.data) === mesDe(hojeIso));
  return {
    atual,
    falta,
    progresso: o.valorAlvo > 0 ? Math.min(1, atual / o.valorAlvo) : 0,
    atingido: o.valorAlvo > 0 && atual >= o.valorAlvo,
    reforcoNecessario,
    mesesComReforco,
    noRitmo: reforcoNecessario == null || o.reforcoMensal >= reforcoNecessario - 0.005,
    contribuiuEsteMes,
  };
}

// ---------- Simulador de investimentos periódicos (DCA) ----------

export interface ParametrosDca {
  capitalInicial: number;
  reforco: number;
  anos: number;
  frequencia: 'mensal' | 'trimestral' | 'anual';
  taxaAnual: number;
}

const POR_ANO = { mensal: 12, trimestral: 4, anual: 1 };

/** Evolução ano a ano com rentabilidade anual hipotética constante. É uma simulação, não uma previsão. */
export function simularDca(p: ParametrosDca) {
  const n = POR_ANO[p.frequencia];
  const taxaPeriodo = (1 + p.taxaAnual / 100) ** (1 / n) - 1;
  let valor = p.capitalInicial;
  let investido = p.capitalInicial;
  const pontos = [{ ano: 0, investido, valor }];
  for (let ano = 1; ano <= p.anos; ano++) {
    for (let k = 0; k < n; k++) {
      valor = valor * (1 + taxaPeriodo) + p.reforco;
      investido += p.reforco;
    }
    pontos.push({ ano, investido, valor });
  }
  return pontos;
}

// ---------- Projeção financeira ----------

export interface BaseProjecao {
  receitaMensal: number;
  despesaMensal: number;
  liquidez: number;
  investimentos: number;
}

export function projetar(base: BaseProjecao, p: Estado['pressupostos']['projecao'], anos: number) {
  let liquidez = base.liquidez;
  let investimentos = base.investimentos;
  const txInv = (1 + p.rentabilidadeInvestimentos / 100) ** (1 / 12) - 1;
  const txPoup = (1 + p.remuneracaoPoupanca / 100) ** (1 / 12) - 1;
  const pontos = [{ ano: 0, receitas: 0, despesas: 0, poupanca: 0, liquidez, investimentos, patrimonio: liquidez + investimentos }];
  for (let ano = 1; ano <= anos; ano++) {
    const receita = base.receitaMensal * (1 + p.variacaoSalarial / 100) ** (ano - 1) * (1 - p.reducaoRendimentos / 100);
    const despesa = base.despesaMensal * (1 + p.aumentoDespesas / 100) ** (ano - 1);
    const poupancaMes = p.poupancaMensal ?? receita - despesa;
    const paraInvestir = poupancaMes > 0 ? poupancaMes * (p.percentagemInvestida / 100) : 0;
    for (let m = 0; m < 12; m++) {
      liquidez = liquidez * (1 + (liquidez > 0 ? txPoup : 0)) + poupancaMes - paraInvestir;
      investimentos = investimentos * (1 + txInv) + paraInvestir;
    }
    pontos.push({
      ano,
      receitas: receita * 12,
      despesas: despesa * 12,
      poupanca: poupancaMes * 12,
      liquidez,
      investimentos,
      patrimonio: liquidez + investimentos,
    });
  }
  return pontos;
}

// ---------- Simulador de alocação ----------

export const NOMES_ALOCACAO = {
  ordem: 'Conta à ordem',
  fundo: 'Fundo de emergência',
  poupanca: 'Poupança',
  investimentos: 'Investimentos',
  objetivos: 'Objetivos pessoais',
} as const;

export function validarAlocacao(percentagens: Record<string, number>, base: number) {
  const soma = Object.values(percentagens).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const alocado = (base * soma) / 100;
  return {
    soma,
    valido: Math.abs(soma - 100) < 0.01,
    alocado,
    porAlocar: base - alocado,
    valores: Object.fromEntries(Object.entries(percentagens).map(([k, v]) => [k, (base * v) / 100])),
  };
}

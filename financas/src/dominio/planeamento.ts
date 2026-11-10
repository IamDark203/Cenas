import { diferencaDias, hoje, mesDe, somarMesesMes } from './datas';
import { inicioDados } from './fluxos';
import { equivalenteMensal } from './recorrencias';
import type { Estado, Objetivo } from './tipos';

// ---------- Fundo de emergência ----------

export interface LinhaEssencial {
  id: string;
  nome: string;
  /** Média mensal das despesas recorrentes (anuais convertidas em média mensal). */
  plano: number;
  /** Média mensal real dos últimos meses completos (0 se ainda não há histórico). */
  historico: number;
  /** Valor usado: o maior dos dois, para não subestimar a necessidade. */
  valor: number;
  /** Parte paga com cartão-refeição (em desemprego o benefício pode acabar, a necessidade mantém-se). */
  viaRefeicao: number;
}

/** Despesas essenciais por categoria (modo automático). */
export function detalheEssenciais(estado: Estado, hojeIso = hoje()): LinhaEssencial[] {
  const refeicao = new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
  const mesAtual = mesDe(hojeIso);
  const comeco = mesDe(inicioDados(estado, hojeIso));
  // Últimos 3 meses completos com dados.
  const meses = [1, 2, 3].map((n) => somarMesesMes(mesAtual, -n)).filter((m) => m >= comeco);
  return estado.categorias
    .filter((c) => c.tipo === 'despesa' && c.essencial)
    .map((c) => {
      let plano = 0;
      let viaRefeicao = 0;
      for (const r of estado.recorrentes) {
        if (!r.ativo || r.tipo !== 'despesa' || r.porDefinir || r.categoriaId !== c.id) continue;
        const v = equivalenteMensal(r);
        plano += v;
        if (refeicao.has(r.contaId)) viaRefeicao += v;
      }
      let historico = 0;
      if (meses.length) {
        const set = new Set(meses);
        const total = estado.movimentos.filter((m) => m.tipo === 'despesa' && m.categoriaId === c.id && set.has(mesDe(m.data))).reduce((s, m) => s + m.valor, 0);
        historico = total / meses.length;
      }
      return { id: c.id, nome: c.nome, plano, historico, valor: Math.max(plano, historico), viaRefeicao };
    })
    .filter((l) => l.valor > 0);
}

export function despesaEssencialMensal(estado: Estado, hojeIso = hoje()): number {
  if ((estado.fundo.modo ?? 'automatico') === 'manual') {
    const ids = new Set(estado.fundo.essenciaisIds);
    return (
      estado.recorrentes.filter((r) => r.ativo && r.tipo === 'despesa' && ids.has(r.id)).reduce((s, r) => s + equivalenteMensal(r), 0) +
      estado.fundo.necessidadesBasicas
    );
  }
  return detalheEssenciais(estado, hojeIso).reduce((s, l) => s + l.valor, 0) + estado.fundo.necessidadesBasicas;
}

/** Número de fontes de rendimento em dinheiro, regulares (exclui subsídios anuais e benefícios). */
export function fontesRendimento(estado: Estado): number {
  const refeicao = new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
  return estado.recorrentes.filter((r) => r.ativo && r.tipo === 'receita' && !r.porDefinir && !refeicao.has(r.contaId) && r.periodicidade !== 'anual' && r.periodicidade !== 'unica').length;
}

/**
 * Sugere 3, 6, 9 ou 12 meses de cobertura a partir da situação profissional e familiar.
 * Cada fator de risco acrescenta pontos; mais pontos, mais meses.
 */
export function sugestaoCobertura(estado: Estado): { meses: number; fatores: string[] } {
  const p = estado.perfil;
  const fatores: string[] = [];
  let pontos = 0;
  const est = p.estabilidade ?? 'estavel';
  if (est === 'moderada') {
    pontos += 1;
    fatores.push('Estabilidade profissional moderada (+1)');
  } else if (est === 'instavel') {
    pontos += 3;
    fatores.push('Situação profissional instável (+3)');
  } else fatores.push('Situação profissional estável (0)');
  if ((p.regularidade ?? 'regular') === 'variavel') {
    pontos += 2;
    fatores.push('Rendimentos irregulares (+2)');
  }
  const fontes = fontesRendimento(estado);
  if (fontes <= 1) {
    pontos += 1;
    fatores.push(`${fontes === 0 ? 'Sem' : 'Uma única'} fonte de rendimento regular (+1)`);
  } else fatores.push(`${fontes} fontes de rendimento (0)`);
  const dep = p.dependentes ?? 0;
  if (dep > 0) {
    const d = dep >= 3 ? 2 : 1;
    pontos += d;
    fatores.push(`${dep} dependente(s) (+${d})`);
  }
  const meses = pontos <= 0 ? 3 : pontos <= 2 ? 6 : pontos <= 4 ? 9 : 12;
  return { meses, fatores };
}

export function mesesFundo(estado: Estado): number {
  return estado.fundo.usarSugestao ? sugestaoCobertura(estado).meses : estado.fundo.meses;
}

/** Fundo calculado = despesas essenciais mensais × meses de cobertura (+ despesas extraordinárias indicadas). */
export function objetivoCalculadoFundo(estado: Estado, meses = mesesFundo(estado), hojeIso = hoje()): number {
  const extra = estado.fundo.extraordinarias.reduce((s, e) => s + e.valor, 0);
  return meses * despesaEssencialMensal(estado, hojeIso) + extra;
}

export function resumoFundo(estado: Estado, capital: number, hojeIso = hoje()) {
  const essencial = despesaEssencialMensal(estado, hojeIso);
  const meses = mesesFundo(estado);
  const calculado = objetivoCalculadoFundo(estado, meses, hojeIso);
  const recomendado = objetivoCalculadoFundo(estado, sugestaoCobertura(estado).meses, hojeIso);
  const minimo = estado.fundo.minimoProtegido ?? 0;
  // Objetivo efetivo: o maior entre o valor calculado e o mínimo protegido.
  const objetivo = Math.max(calculado, minimo);
  const falta = Math.max(0, objetivo - capital);
  const reforco = estado.fundo.reforcoMensal;
  return {
    capital,
    essencial,
    meses,
    calculado,
    recomendado,
    minimo,
    objetivo,
    origemObjetivo: minimo > calculado ? ('minimo' as const) : ('calculado' as const),
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

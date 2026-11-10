// Plano mensal único: alimenta o disponível para gastar, o orçamento do mês, o lazer,
// a viabilidade dos objetivos e a distribuição de reforços. Tudo sai daqui para não haver números diferentes.
import { alocacoesConta, valorObjetivo } from './alocacoes';
import { fimMes, mesDe, somarMesesMes } from './datas';
import { estimativaRecorrente, idsRefeicao, inicioDados } from './fluxos';
import { resumoFundo, resumoObjetivo } from './planeamento';
import { equivalenteMensal, ocorrenciasEntre } from './recorrencias';
import { composicao, saldoConta } from './saldos';
import type { Conta, DestinoReforco, Estado, Objetivo } from './tipos';

const ehCompromisso = (nome: string) => /empr[eé]st|presta[cç]/i.test(nome);

/** Médias mensais de despesas não recorrentes (pagas com dinheiro) nos últimos 3 meses completos. */
function mediasVariaveis(estado: Estado, hojeIso: string) {
  const refeicao = idsRefeicao(estado);
  const comeco = mesDe(inicioDados(estado, hojeIso));
  const meses = [1, 2, 3].map((n) => somarMesesMes(mesDe(hojeIso), -n)).filter((m) => m >= comeco);
  const cat = new Map(estado.categorias.map((c) => [c.id, c]));
  let essencial = 0;
  let naoEssencial = 0;
  if (meses.length) {
    const set = new Set(meses);
    for (const m of estado.movimentos) {
      if (m.tipo !== 'despesa' || m.recorrenteId || refeicao.has(m.contaId) || !set.has(mesDe(m.data))) continue;
      if (cat.get(m.categoriaId ?? '')?.essencial) essencial += m.valor;
      else naoEssencial += m.valor;
    }
  }
  const n = Math.max(1, meses.length);
  return { essencial: essencial / n, naoEssencial: naoEssencial / n, meses: meses.length };
}

export interface PlanoMensal {
  /** Rendimento líquido mensal em dinheiro (média das fontes ativas). */
  rendimento: number;
  beneficios: number;
  despesasEssenciais: number;
  compromissos: number;
  despesasFixas: number;
  /** Lazer já comprometido em despesas recorrentes (ex.: assinaturas de lazer). */
  lazerRecorrente: number;
  /** Média de gastos variáveis não essenciais (histórico). */
  naoEssencialMedio: number;
  reforcoFundo: number;
  reforcoObjetivos: number;
  investimento: number;
  outrasPoupancas: number;
  /** Rendimento − despesas essenciais, fixas e compromissos. */
  capacidadeBruta: number;
  /** Capacidade bruta − gasto médio não essencial: o que realmente sobra para poupar. */
  capacidadeReal: number;
  /** Orçamento discricionário (lazer) depois de despesas, compromissos, reforços e investimentos. */
  discricionario: number;
  mesesHistorico: number;
}

export function planoMensal(estado: Estado, hojeIso: string): PlanoMensal {
  const refeicao = idsRefeicao(estado);
  const cat = new Map(estado.categorias.map((c) => [c.id, c]));
  const est = estimativaRecorrente(estado);
  const medias = mediasVariaveis(estado, hojeIso);
  let essenciais = 0;
  let compromissos = 0;
  let fixas = 0;
  let lazerRecorrente = 0;
  for (const r of estado.recorrentes) {
    if (!r.ativo || r.tipo !== 'despesa' || r.porDefinir || refeicao.has(r.contaId)) continue;
    const v = equivalenteMensal(r);
    const c = cat.get(r.categoriaId ?? '');
    if (c && ehCompromisso(c.nome)) compromissos += v;
    else if (c?.essencial) essenciais += v;
    else if (c?.lazer) lazerRecorrente += v;
    else fixas += v;
  }
  // Despesas essenciais variáveis registadas à mão (ex.: supermercado) também contam.
  essenciais += medias.essencial;
  const fe = resumoFundo(estado, composicao(estado, hojeIso).fundoEmergencia, hojeIso);
  const reforcoFundo = fe.falta > 0 ? estado.fundo.reforcoMensal : 0;
  const reforcoObjetivos = estado.objetivos.filter((o) => !resumoObjetivo(o, hojeIso).atingido).reduce((s, o) => s + o.reforcoMensal, 0);
  const investimento = estado.planoMensal.investimento;
  const outrasPoupancas = estado.planoMensal.outrasPoupancas;
  const obrigatorio = essenciais + compromissos + fixas;
  const capacidadeBruta = est.receitas - obrigatorio;
  return {
    rendimento: est.receitas,
    beneficios: est.beneficios,
    despesasEssenciais: essenciais,
    compromissos,
    despesasFixas: fixas,
    lazerRecorrente,
    naoEssencialMedio: medias.naoEssencial,
    reforcoFundo,
    reforcoObjetivos,
    investimento,
    outrasPoupancas,
    capacidadeBruta,
    capacidadeReal: capacidadeBruta - lazerRecorrente - medias.naoEssencial,
    discricionario: capacidadeBruta - reforcoFundo - reforcoObjetivos - investimento - outrasPoupancas,
    mesesHistorico: medias.meses,
  };
}

// ---------- Módulo 4: dinheiro realmente disponível ----------

/** Contas cujo dinheiro está imediatamente disponível para gastar (escolhidas pelo utilizador). */
export function contasParaGastos(estado: Estado): Conta[] {
  return estado.contas.filter((c) => !c.arquivada && (c.paraGastos ?? c.tipo === 'ordem') && ['ordem', 'poupanca', 'outra'].includes(c.tipo));
}

export interface LinhaCompromisso {
  descricao: string;
  data: string | null;
  valor: number;
  tipo: 'despesa' | 'transferencia' | 'reforco-fundo' | 'reforco-objetivo';
}

export function disponivelParaGastar(estado: Estado, hojeIso: string) {
  const contas = contasParaGastos(estado);
  const ids = new Set(contas.map((c) => c.id));
  let saldo = 0;
  let alocado = 0;
  for (const c of contas) {
    const s = saldoConta(estado, c, hojeIso);
    saldo += s;
    alocado += Math.min(Math.max(0, s), alocacoesConta(estado, c.id, s).alocado);
  }
  const compromissos: LinhaCompromisso[] = [];
  for (const o of ocorrenciasEntre(estado, hojeIso, fimMes(mesDe(hojeIso)))) {
    const r = o.recorrente;
    if (o.lancada || r.porDefinir || !ids.has(r.contaId)) continue;
    if (r.tipo === 'despesa') compromissos.push({ descricao: r.descricao, data: o.data, valor: o.valor, tipo: 'despesa' });
    // Transferências para contas que não são de gastos (ex.: poupança) também comprometem o dinheiro.
    if (r.tipo === 'transferencia' && !ids.has(r.contaDestinoId ?? '')) compromissos.push({ descricao: r.descricao, data: o.data, valor: o.valor, tipo: 'transferencia' });
  }
  const mes = mesDe(hojeIso);
  const fe = resumoFundo(estado, composicao(estado, hojeIso).fundoEmergencia, hojeIso);
  if (fe.falta > 0 && estado.fundo.reforcoMensal > 0) {
    const feito = estado.alocacoes
      .filter((a) => a.tipo === 'fundo')
      .flatMap((a) => a.historico)
      .filter((h) => mesDe(h.data) === mes && h.delta > 0)
      .reduce((s, h) => s + h.delta, 0);
    const pendente = Math.min(fe.falta, Math.max(0, estado.fundo.reforcoMensal - feito));
    if (pendente > 0) compromissos.push({ descricao: 'Reforço do fundo de emergência', data: null, valor: pendente, tipo: 'reforco-fundo' });
  }
  for (const o of estado.objetivos) {
    const r = resumoObjetivo(o, hojeIso);
    if (r.atingido || o.reforcoMensal <= 0) continue;
    const feito = o.contribuicoes.filter((c) => mesDe(c.data) === mes && c.valor > 0).reduce((s, c) => s + c.valor, 0);
    const pendente = Math.min(r.falta, Math.max(0, o.reforcoMensal - feito));
    if (pendente > 0) compromissos.push({ descricao: `Reforço: ${o.nome}`, data: null, valor: pendente, tipo: 'reforco-objetivo' });
  }
  const totalCompromissos = compromissos.reduce((s, c) => s + c.valor, 0);
  return { contas, saldo, alocado, livre: saldo - alocado, compromissos, totalCompromissos, agora: saldo - alocado - totalCompromissos };
}

/** Orçamento para o mês: rendimentos do mês − despesas programadas − reforços e investimentos planeados. */
export function orcamentoDoMes(estado: Estado, hojeIso: string) {
  const refeicao = idsRefeicao(estado);
  const mes = mesDe(hojeIso);
  const ocorr = ocorrenciasEntre(estado, `${mes}-01`, fimMes(mes));
  let recebido = 0;
  let gastoProgramado = 0;
  let gastoForaPlano = 0;
  for (const m of estado.movimentos) {
    if (mesDe(m.data) !== mes || refeicao.has(m.contaId)) continue;
    if (m.tipo === 'receita') recebido += m.valor;
    if (m.tipo === 'despesa') {
      if (m.recorrenteId) gastoProgramado += m.valor;
      else gastoForaPlano += m.valor;
    }
  }
  let porReceber = 0;
  let porPagar = 0;
  for (const o of ocorr) {
    if (o.lancada || o.recorrente.porDefinir || refeicao.has(o.recorrente.contaId) || o.data < hojeIso) continue;
    if (o.recorrente.tipo === 'receita') porReceber += o.valor;
    if (o.recorrente.tipo === 'despesa') porPagar += o.valor;
  }
  const p = planoMensal(estado, hojeIso);
  const reforcos = p.reforcoFundo + p.reforcoObjetivos + p.investimento + p.outrasPoupancas;
  const rendimentos = recebido + porReceber;
  const despesasProgramadas = gastoProgramado + porPagar;
  const orcamento = rendimentos - despesasProgramadas - reforcos;
  return { rendimentos, recebido, porReceber, despesasProgramadas, porPagar, reforcos, orcamento, gastoForaPlano, restante: orcamento - gastoForaPlano };
}

// ---------- Módulo 5: cartão-refeição ----------

export function resumoRefeicao(estado: Estado, hojeIso: string) {
  const contas = estado.contas.filter((c) => c.tipo === 'refeicao' && !c.arquivada);
  const ids = new Set(contas.map((c) => c.id));
  const mes = mesDe(hojeIso);
  const saldo = contas.reduce((s, c) => s + saldoConta(estado, c, hojeIso), 0);
  const carregamento = estimativaRecorrente(estado).beneficios;
  const movimentos = estado.movimentos.filter((m) => ids.has(m.contaId) || ids.has(m.contaDestinoId ?? ''));
  const despesasMes = movimentos.filter((m) => m.tipo === 'despesa' && mesDe(m.data) === mes);
  const gastoMes = despesasMes.reduce((s, m) => s + m.valor, 0);
  const porCategoria = new Map<string, number>();
  for (const m of despesasMes) porCategoria.set(m.categoriaId ?? '', (porCategoria.get(m.categoriaId ?? '') ?? 0) + m.valor);
  return {
    contas,
    saldo,
    carregamento,
    gastoMes,
    restanteMes: carregamento - gastoMes,
    porCategoria,
    movimentos,
    finalidade: estado.refeicao.finalidadeIds,
  };
}

// ---------- Módulo 7: orçamento de lazer ----------

export function orcamentoLazer(estado: Estado, hojeIso: string) {
  const p = planoMensal(estado, hojeIso);
  const refeicao = idsRefeicao(estado);
  const mes = mesDe(hojeIso);
  const anterior = somarMesesMes(mes, -1);
  const categorias = estado.categorias.filter((c) => c.tipo === 'despesa' && c.lazer);
  const total = Math.max(0, p.discricionario);
  const linhas = categorias.map((c) => {
    const doMes = estado.movimentos.filter((m) => m.tipo === 'despesa' && m.categoriaId === c.id && mesDe(m.data) === mes);
    return {
      categoria: c,
      orcamento: c.orcamento,
      gastoDinheiro: doMes.filter((m) => !refeicao.has(m.contaId)).reduce((s, m) => s + m.valor, 0),
      gastoRefeicao: doMes.filter((m) => refeicao.has(m.contaId)).reduce((s, m) => s + m.valor, 0),
      gastoAnterior: estado.movimentos
        .filter((m) => m.tipo === 'despesa' && m.categoriaId === c.id && mesDe(m.data) === anterior && !refeicao.has(m.contaId))
        .reduce((s, m) => s + m.valor, 0),
    };
  });
  const gasto = linhas.reduce((s, l) => s + l.gastoDinheiro, 0);
  const gastoAnterior = linhas.reduce((s, l) => s + l.gastoAnterior, 0);
  const distribuido = linhas.reduce((s, l) => s + (l.orcamento ?? 0), 0);
  return { plano: p, total, gasto, restante: total - gasto, utilizacao: total > 0 ? gasto / total : gasto > 0 ? 1 : 0, gastoAnterior, linhas, distribuido };
}

// ---------- Módulo 6: viabilidade dos objetivos ----------

export type Viabilidade = 'confortavel' | 'disciplina' | 'exigente' | 'inviavel';

export const NOMES_VIABILIDADE: Record<Viabilidade, string> = {
  confortavel: 'Financeiramente confortável',
  disciplina: 'Viável, mas exige disciplina',
  exigente: 'Demasiado exigente',
  inviavel: 'Atualmente inviável',
};

export interface AnaliseObjetivo {
  objetivo: Objetivo;
  falta: number;
  mesesRestantes: number | null;
  /** (Valor pretendido − acumulado) / meses restantes. */
  necessario: number | null;
  /** Capacidade de poupança que sobra para este objetivo depois dos que têm maior prioridade. */
  capacidadeDisponivel: number;
  viabilidade: Viabilidade | null;
  sugestoes: string[];
}

function mesesAte(hojeIso: string, data: string | null): number | null {
  if (!data) return null;
  const [a1, m1, d1] = hojeIso.split('-').map(Number);
  const [a2, m2, d2] = data.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1);
  return Math.max(0, meses);
}

const fmt = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')} €`;

/** Analisa os objetivos por ordem de prioridade, sem contar a mesma capacidade de poupança duas vezes. */
export function analisarObjetivos(estado: Estado, hojeIso: string): AnaliseObjetivo[] {
  const p = planoMensal(estado, hojeIso);
  const inicial = p.capacidadeReal - p.reforcoFundo - p.investimento - p.outrasPoupancas;
  let restante = inicial;
  const ordenados = [...estado.objetivos].sort(
    (a, b) => (a.prioridade ?? 2) - (b.prioridade ?? 2) || (a.dataLimite ?? '9999').localeCompare(b.dataLimite ?? '9999'),
  );
  return ordenados.map((o) => {
    const falta = Math.max(0, o.valorAlvo - valorObjetivo(o));
    const meses = mesesAte(hojeIso, o.dataLimite);
    const necessario = falta === 0 ? 0 : meses == null ? (o.reforcoMensal > 0 ? o.reforcoMensal : null) : meses > 0 ? falta / meses : falta;
    const disp = Math.max(0, restante);
    let viabilidade: Viabilidade | null = null;
    const sugestoes: string[] = [];
    if (falta === 0) {
      viabilidade = 'confortavel';
    } else if (necessario != null) {
      const r = disp > 0 ? necessario / disp : Number.POSITIVE_INFINITY;
      viabilidade = r <= 0.6 ? 'confortavel' : r <= 0.9 ? 'disciplina' : r <= 1 ? 'exigente' : 'inviavel';
      if (meses != null)
        sugestoes.push(`Queres juntar ${fmt(falta)} em ${meses} ${meses === 1 ? 'mês' : 'meses'}. Precisas de reservar ${fmt(necessario)} por mês.`);
      sugestoes.push(
        disp > 0
          ? `Com os rendimentos e despesas atuais, depois dos compromissos com maior prioridade, podes reservar cerca de ${fmt(disp)} por mês.`
          : 'Neste momento não sobra capacidade de poupança depois das despesas e dos compromissos com maior prioridade.',
      );
      if (viabilidade !== 'inviavel') {
        // Tudo o que sobra depois das despesas obrigatórias, dos reforços e dos objetivos com maior prioridade.
        const consumidoAntes = inicial - restante;
        const lazer = p.capacidadeBruta - p.reforcoFundo - p.investimento - p.outrasPoupancas - consumidoAntes - necessario;
        if (lazer >= 0) sugestoes.push(`Para cumprir este objetivo, os gastos não essenciais não devem ultrapassar cerca de ${fmt(lazer)} por mês.`);
      } else if (falta > 0) {
        if (disp > 0) {
          const prazo = Math.ceil(falta / disp);
          sugestoes.push(`Alargar o prazo para cerca de ${prazo} meses torna-o possível com a capacidade atual.`);
          if (meses != null && meses > 0) {
            sugestoes.push(`No prazo atual consegues juntar cerca de ${fmt(disp * meses)}: reduzir o valor pretendido para esse montante.`);
            sugestoes.push(`Ou reforçar pontualmente cerca de ${fmt(Math.max(0, falta - disp * meses))} (ex.: subsídios).`);
          }
        }
        if (p.naoEssencialMedio > 0) sugestoes.push(`Rever os gastos variáveis não essenciais (média de ${fmt(p.naoEssencialMedio)}/mês). As despesas essenciais não devem ser cortadas.`);
        if (ordenados.some((x) => x.id !== o.id && (x.prioridade ?? 2) >= (o.prioridade ?? 2) && x.reforcoMensal > 0))
          sugestoes.push('Ajustar o reforço ou a prioridade de outros objetivos.');
      }
    }
    restante -= Math.min(Math.max(0, restante), necessario ?? 0);
    return { objetivo: o, falta, mesesRestantes: meses, necessario, capacidadeDisponivel: disp, viabilidade, sugestoes };
  });
}

// ---------- Módulo 3: distribuição de novos reforços ----------

export interface LinhaDistribuicao {
  destino: DestinoReforco;
  objetivoId?: string;
  nome: string;
  valor: number;
  motivo: string;
}

export const NOMES_DESTINO: Record<DestinoReforco, string> = {
  fundo: 'Fundo de emergência',
  objetivos: 'Objetivos de poupança',
  investimentos: 'Investimentos',
  disponivel: 'Capital disponível',
};

/** Proposta de distribuição de um novo valor, pela ordem de prioridade configurada. Não altera nada. */
export function sugerirDistribuicao(estado: Estado, valor: number, hojeIso: string): LinhaDistribuicao[] {
  let resto = Math.max(0, Math.round(valor * 100) / 100);
  const linhas: LinhaDistribuicao[] = [];
  const mes = mesDe(hojeIso);
  for (const d of estado.prioridades) {
    if (d === 'fundo') {
      const fe = resumoFundo(estado, composicao(estado, hojeIso).fundoEmergencia, hojeIso);
      const v = Math.min(resto, fe.falta);
      linhas.push({ destino: 'fundo', nome: NOMES_DESTINO.fundo, valor: v, motivo: fe.falta > 0 ? `Faltam ${fmt(fe.falta)} para o objetivo de ${fmt(fe.objetivo)}.` : 'O fundo já atingiu o objetivo.' });
      resto -= v;
    } else if (d === 'objetivos') {
      for (const a of analisarObjetivos(estado, hojeIso)) {
        if (a.falta <= 0) continue;
        const feito = a.objetivo.contribuicoes.filter((c) => mesDe(c.data) === mes && c.valor > 0).reduce((s, c) => s + c.valor, 0);
        const alvoMes = a.necessario ?? a.objetivo.reforcoMensal;
        const precisa = Math.min(a.falta, Math.max(0, alvoMes - feito));
        const v = Math.min(resto, precisa);
        if (v <= 0 && precisa <= 0) continue;
        linhas.push({ destino: 'objetivos', objetivoId: a.objetivo.id, nome: a.objetivo.nome, valor: v, motivo: `Reforço deste mês em falta: ${fmt(precisa)}.` });
        resto -= v;
      }
    } else if (d === 'investimentos') {
      const comprado = estado.operacoes.filter((o) => o.tipo === 'compra' && mesDe(o.data) === mes).reduce((s, o) => s + o.quantidade * o.preco + o.comissao, 0);
      const precisa = Math.max(0, estado.planoMensal.investimento - comprado);
      if (precisa > 0) {
        const v = Math.min(resto, precisa);
        linhas.push({ destino: 'investimentos', nome: NOMES_DESTINO.investimentos, valor: v, motivo: `Investimento mensal planeado ainda por fazer: ${fmt(precisa)}.` });
        resto -= v;
      }
    } else {
      linhas.push({ destino: 'disponivel', nome: 'Disponível para outros objetivos', valor: resto, motivo: 'O que sobra depois das prioridades anteriores.' });
      resto = 0;
    }
  }
  if (resto > 0.004) {
    const d = linhas.find((l) => l.destino === 'disponivel');
    if (d) d.valor += resto;
    else linhas.push({ destino: 'disponivel', nome: 'Disponível para outros objetivos', valor: resto, motivo: 'O que sobra depois das prioridades.' });
  }
  return linhas.map((l) => ({ ...l, valor: Math.round(l.valor * 100) / 100 }));
}


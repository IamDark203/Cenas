// Assistente: sugestões calculadas a partir dos dados. Cada sugestão explica a origem dos valores.
import { alocacoesConta } from './alocacoes';
import { euro } from './formato';
import { analisarObjetivos, disponivelParaGastar, NOMES_VIABILIDADE, orcamentoLazer } from './orcamento';
import { resumoFundo, resumoObjetivo } from './planeamento';
import { composicao, saldoConta } from './saldos';
import type { Estado } from './tipos';

export interface Sugestao {
  id: string;
  tom: 'aviso' | 'info' | 'positivo';
  titulo: string;
  /** Como o valor foi calculado. */
  origem: string;
  seccao: 'fundo' | 'contas' | 'objetivos' | 'despesas' | 'painel' | 'comparador';
}

export function sugestoesAssistente(estado: Estado, hojeIso: string): Sugestao[] {
  const out: Sugestao[] = [];
  const atual = composicao(estado, hojeIso);

  // Fundo de emergência
  const fe = resumoFundo(estado, atual.fundoEmergencia, hojeIso);
  if (fe.objetivo > 0 && fe.falta > 0.5) {
    out.push({
      id: 'fe-falta',
      tom: 'aviso',
      titulo: `O teu fundo de emergência está ${euro(fe.falta)} abaixo do objetivo.`,
      origem:
        fe.origemObjetivo === 'minimo'
          ? `Objetivo = mínimo protegido de ${euro(fe.minimo)}. Capital alocado ao fundo: ${euro(fe.capital)}.`
          : `Objetivo = ${euro(fe.essencial)} de despesas essenciais por mês × ${fe.meses} meses = ${euro(fe.calculado)}. Capital alocado ao fundo: ${euro(fe.capital)}.`,
      seccao: 'fundo',
    });
  } else if (fe.objetivo > 0 && fe.capital > 0) {
    out.push({
      id: 'fe-ok',
      tom: 'positivo',
      titulo: `O fundo de emergência cobre ${fe.mesesCobertos != null ? Math.floor(fe.mesesCobertos) : '—'} meses de despesas essenciais.`,
      origem: `${euro(fe.capital)} alocados ÷ ${euro(fe.essencial)} de despesas essenciais por mês. Objetivo: ${euro(fe.objetivo)}.`,
      seccao: 'fundo',
    });
  }

  // Alocações acima do saldo e capital por atribuir
  let naoAtribuido = 0;
  const detalhe: string[] = [];
  for (const c of estado.contas) {
    if (c.arquivada || c.tipo === 'refeicao' || c.tipo === 'investimento' || (c.paraGastos ?? c.tipo === 'ordem')) continue;
    const s = saldoConta(estado, c, hojeIso);
    const a = alocacoesConta(estado, c.id, s);
    if (a.excesso > 0.005)
      out.push({
        id: `excesso-${c.id}`,
        tom: 'aviso',
        titulo: `As alocações de ${c.nome} excedem o saldo em ${euro(a.excesso)}.`,
        origem: `Saldo ${euro(s)}; alocado ${euro(a.alocado)}. Reduz uma alocação ou atualiza o saldo.`,
        seccao: 'contas',
      });
    if (a.naoAtribuido > 0.5) {
      naoAtribuido += a.naoAtribuido;
      detalhe.push(`${c.nome}: ${euro(a.naoAtribuido)}`);
    }
  }
  if (naoAtribuido > 0.5)
    out.push({
      id: 'nao-atribuido',
      tom: 'info',
      titulo: `Tens ${euro(naoAtribuido)} não atribuídos a nenhum objetivo.`,
      origem: `Saldo das contas de poupança menos as alocações (${detalhe.join('; ')}).`,
      seccao: 'contas',
    });

  // Dinheiro livre vs compromissos do mês
  const disp = disponivelParaGastar(estado, hojeIso);
  if (disp.contas.length && disp.agora < 0)
    out.push({
      id: 'compromissos',
      tom: 'aviso',
      titulo: `Os compromissos deste mês excedem o dinheiro livre em ${euro(-disp.agora)}.`,
      origem: `Saldo das contas para gastos ${euro(disp.saldo)} − alocado ${euro(disp.alocado)} − compromissos pendentes ${euro(disp.totalCompromissos)}.`,
      seccao: 'painel',
    });

  // Objetivos
  for (const a of analisarObjetivos(estado, hojeIso)) {
    const o = a.objetivo;
    const r = resumoObjetivo(o, hojeIso);
    if (r.atingido || a.viabilidade == null) continue;
    if (a.viabilidade === 'inviavel')
      out.push({
        id: `obj-inviavel-${o.id}`,
        tom: 'aviso',
        titulo: `${o.nome}: ${NOMES_VIABILIDADE.inviavel.toLowerCase()} com a capacidade atual.`,
        origem: `Precisa de ${euro(a.necessario ?? 0)}/mês; a capacidade disponível para ele é ${euro(a.capacidadeDisponivel)}/mês.`,
        seccao: 'objetivos',
      });
    else if (o.dataLimite && (a.viabilidade === 'confortavel' || a.viabilidade === 'disciplina'))
      out.push({
        id: `obj-ok-${o.id}`,
        tom: 'positivo',
        titulo: `Com a tua capacidade atual de poupança, consegues atingir "${o.nome}" no prazo definido.`,
        origem: `Precisa de ${euro(a.necessario ?? 0)}/mês; capacidade disponível ${euro(a.capacidadeDisponivel)}/mês.`,
        seccao: 'objetivos',
      });
    if (o.reforcoMensal > 0 && r.mesesComReforco != null && r.mesesComReforco > 3) {
      const novo = r.falta / (r.mesesComReforco - 2);
      const extra = Math.ceil((novo - o.reforcoMensal) * 100) / 100;
      out.push({
        id: `obj-antecipar-${o.id}`,
        tom: 'info',
        titulo: `Podes atingir "${o.nome}" dois meses mais cedo se aumentares o reforço mensal em ${euro(extra)}.`,
        origem: `Faltam ${euro(r.falta)}: com ${euro(o.reforcoMensal)}/mês demora ${r.mesesComReforco} meses; com ${euro(o.reforcoMensal + extra)}/mês demora ${r.mesesComReforco - 2}.`,
        seccao: 'objetivos',
      });
    }
  }

  // Lazer
  const lz = orcamentoLazer(estado, hojeIso);
  if (lz.plano.rendimento > 0 && lz.total > 0)
    out.push({
      id: 'lazer-uso',
      tom: lz.gasto > lz.total ? 'aviso' : 'info',
      titulo: `O teu orçamento de lazer é de ${euro(lz.total)}. Já utilizaste ${euro(lz.gasto)}.`,
      origem: `Rendimento ${euro(lz.plano.rendimento)} − despesas essenciais, fixas e compromissos − reforços e investimentos planeados.`,
      seccao: 'despesas',
    });
  if (lz.gastoAnterior > 0 && lz.gasto - lz.gastoAnterior > 0.5)
    out.push({
      id: 'lazer-subida',
      tom: 'info',
      titulo: `Este mês gastaste mais ${euro(lz.gasto - lz.gastoAnterior)} em lazer do que no mês anterior.`,
      origem: `Lazer pago com dinheiro: ${euro(lz.gasto)} este mês vs ${euro(lz.gastoAnterior)} no mês anterior.`,
      seccao: 'despesas',
    });

  return out;
}

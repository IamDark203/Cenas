import { fimMes, mesDe, somarDias, somarMesesMes } from './datas';
import { euro, data as fmtData, pct } from './formato';
import { orcamentoMes } from './fluxos';
import { resumoFundo, resumoObjetivo } from './planeamento';
import { ocorrenciasEntre } from './recorrencias';
import { composicao } from './saldos';
import type { Estado } from './tipos';

export type Seccao = 'despesas' | 'receitas' | 'contas' | 'fundo' | 'objetivos' | 'painel';

export interface Alerta {
  id: string;
  nivel: 'info' | 'aviso' | 'sucesso';
  titulo: string;
  detalhe: string;
  seccao: Seccao;
}

/** Alertas informativos. Não sugerem decisões: apenas descrevem a situação. */
export function calcularAlertas(estado: Estado, hojeIso: string): Alerta[] {
  const cfg = estado.alertas;
  const out: Alerta[] = [];
  const mes = mesDe(hojeIso);

  if (cfg.porDefinir) {
    for (const r of estado.recorrentes) {
      if (!r.ativo) continue;
      if (r.valorBruto != null && !r.liquidoConfirmado)
        out.push({
          id: `liq|${r.id}`,
          nivel: 'aviso',
          titulo: `Valor líquido por confirmar: ${r.descricao}`,
          detalhe: `Os cálculos usam ${euro(r.valor)} até indicares o valor líquido que recebes.`,
          seccao: 'receitas',
        });
      if (r.porDefinir)
        out.push({
          id: `def|${r.id}`,
          nivel: 'info',
          titulo: `Valor por definir: ${r.descricao}`,
          detalhe: 'Esta entrada ainda não tem valor e não entra nos totais.',
          seccao: r.tipo === 'receita' ? 'receitas' : 'despesas',
        });
    }
  }

  if (cfg.recorrentes) {
    const ate = somarDias(hojeIso, cfg.recorrentesDias);
    for (const o of ocorrenciasEntre(estado, hojeIso, ate)) {
      if (o.recorrente.tipo !== 'despesa' || o.lancada || o.recorrente.porDefinir) continue;
      out.push({
        id: `rec|${o.recorrente.id}|${o.data}`,
        nivel: 'info',
        titulo: `${o.recorrente.descricao} a ${fmtData(o.data)}`,
        detalhe: `Pagamento previsto de ${euro(o.valor)}.`,
        seccao: 'despesas',
      });
    }
  }

  if (cfg.orcamento) {
    for (const l of orcamentoMes(estado, mes)) {
      if (l.excedido)
        out.push({
          id: `orc|${l.categoriaId}|${mes}`,
          nivel: 'aviso',
          titulo: `Orçamento ultrapassado: ${l.nome}`,
          detalhe: `${euro(l.real)} gastos este mês para um orçamento de ${euro(l.orcamento ?? 0)}.`,
          seccao: 'despesas',
        });
    }
  }

  for (const o of estado.objetivos) {
    const r = resumoObjetivo(o, hojeIso);
    if (cfg.objetivos && r.atingido)
      out.push({
        id: `obj|${o.id}`,
        nivel: 'sucesso',
        titulo: `Objetivo atingido: ${o.nome}`,
        detalhe: `${euro(r.atual)} reunidos para um objetivo de ${euro(o.valorAlvo)}.`,
        seccao: 'objetivos',
      });
    if (cfg.reforcos && !r.atingido && o.reforcoMensal > 0 && !r.contribuiuEsteMes && Number(hojeIso.slice(8)) >= cfg.reforcoDiaLimite)
      out.push({
        id: `ref|${o.id}|${mes}`,
        nivel: 'info',
        titulo: `Reforço de ${o.nome} ainda não registado este mês`,
        detalhe: `Reforço mensal definido: ${euro(o.reforcoMensal)}.`,
        seccao: 'objetivos',
      });
  }

  // Alterações detetadas nos produtos bancários (Módulo 16), dos últimos 60 dias.
  for (const x of estado.bancos?.alteracoes ?? []) {
    if (x.data < somarDias(hojeIso, -60)) continue;
    out.push({
      id: `banco|${x.id}`,
      nivel: x.impacto != null && x.impacto < 0 ? 'aviso' : 'info',
      titulo: x.texto,
      detalhe:
        x.impacto != null
          ? `Diferença estimada na remuneração anual líquida com o saldo atual: ${x.impacto >= 0 ? '+' : ''}${euro(x.impacto)}.`
          : `Detetado a ${fmtData(x.data)}. Consulta o comparador bancário.`,
      seccao: 'contas',
    });
  }

  const atual = composicao(estado, hojeIso);
  if (cfg.fundo) {
    const f = resumoFundo(estado, atual.fundoEmergencia);
    if (f.objetivo > 0 && f.capital < f.objetivo)
      out.push({
        id: `fe|${mes}`,
        nivel: 'aviso',
        titulo: 'Fundo de emergência abaixo do objetivo',
        detalhe: `${euro(f.capital)} reservados de ${euro(f.objetivo)} (${pct(f.progresso)}).`,
        seccao: 'fundo',
      });
  }

  if (cfg.distribuicao) {
    const anterior = composicao(estado, fimMes(somarMesesMes(mes, -1)));
    if (anterior.patrimonio > 0 && atual.patrimonio > 0) {
      const partes = [
        ['Disponível', 'disponivel'],
        ['Poupanças', 'poupancas'],
        ['Fundo de emergência', 'fundoEmergencia'],
        ['Investimentos', 'carteira'],
      ] as const;
      for (const [nome, k] of partes) {
        const dif = (atual[k] / atual.patrimonio - anterior[k] / anterior.patrimonio) * 100;
        if (Math.abs(dif) >= cfg.distribuicaoLimitePp)
          out.push({
            id: `dist|${k}|${mes}`,
            nivel: 'info',
            titulo: `Peso de ${nome} no património mudou ${dif > 0 ? '+' : ''}${dif.toFixed(1).replace('.', ',')} p.p.`,
            detalhe: 'Comparação com o fim do mês anterior.',
            seccao: 'painel',
          });
      }
    }
  }

  return out;
}

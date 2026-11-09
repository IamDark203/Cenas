import { fimMes, mesesEntre, somarMesesMes } from './datas';
import { despesasPorCategoria, serieFluxos, somarFluxos } from './fluxos';
import { composicao } from './saldos';
import type { Estado } from './tipos';

export type TipoRelatorio = 'mes' | 'ano';

function mesesDe(tipo: TipoRelatorio, chave: string): string[] {
  return tipo === 'mes' ? [chave] : mesesEntre(`${chave}-01`, `${chave}-12`);
}

export function anterior(tipo: TipoRelatorio, chave: string): string {
  return tipo === 'mes' ? somarMesesMes(chave, -1) : String(Number(chave) - 1);
}

function metricas(estado: Estado, meses: string[], hojeIso: string) {
  const fluxos = serieFluxos(estado, meses);
  const t = somarFluxos(fluxos);
  const ultimo = meses[meses.length - 1];
  const fim = fimMes(ultimo) < hojeIso ? fimMes(ultimo) : hojeIso;
  const inicio = fimMes(somarMesesMes(meses[0], -1));
  const pFim = composicao(estado, fim).patrimonio;
  const pInicio = composicao(estado, inicio).patrimonio;
  return {
    receitas: t.receitas,
    despesas: t.despesas,
    beneficios: t.beneficios,
    despesasRefeicao: t.despesasRefeicao,
    poupanca: t.poupanca,
    taxaPoupanca: t.taxaPoupanca,
    investido: t.investido,
    patrimonioInicio: pInicio,
    patrimonioFim: pFim,
    variacaoPatrimonio: pFim - pInicio,
    fluxos,
  };
}

export function relatorio(estado: Estado, tipo: TipoRelatorio, chave: string, hojeIso: string) {
  const meses = mesesDe(tipo, chave).filter((m) => `${m}-01` <= hojeIso);
  const mesesAnt = mesesDe(tipo, anterior(tipo, chave));
  const atual = metricas(estado, meses.length ? meses : mesesDe(tipo, chave).slice(0, 1), hojeIso);
  const ant = metricas(estado, mesesAnt, hojeIso);
  return {
    tipo,
    chave,
    meses,
    atual,
    anterior: ant,
    categorias: despesasPorCategoria(estado, meses),
    categoriasAnteriores: despesasPorCategoria(estado, mesesAnt),
  };
}

export type Relatorio = ReturnType<typeof relatorio>;

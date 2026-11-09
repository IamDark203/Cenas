import { diferencaDias, somarDias, somarMeses } from './datas';
import type { Estado, Movimento, Periodicidade, Recorrente } from './tipos';
import { novoId } from './ids';

const PASSO_MESES: Partial<Record<Periodicidade, number>> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export const NOMES_PERIODICIDADE: Record<Periodicidade, string> = {
  unica: 'Única',
  semanal: 'Semanal',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

/** Quantas ocorrências por mês, em média. */
export const OCORRENCIAS_POR_MES: Record<Periodicidade, number> = {
  unica: 0,
  semanal: 52 / 12,
  mensal: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

export function valorRecorrente(r: Pick<Recorrente, 'valor' | 'porDia'>): number {
  return r.porDia ? Math.round(r.porDia.valorDia * r.porDia.dias * 100) / 100 : r.valor;
}

export function equivalenteMensal(r: Recorrente): number {
  return valorRecorrente(r) * OCORRENCIAS_POR_MES[r.periodicidade];
}

/** Datas das ocorrências entre `de` e `ate` (inclusive). */
export function ocorrencias(r: Recorrente, de: string, ate: string): string[] {
  const out: string[] = [];
  const limite = r.fim && r.fim < ate ? r.fim : ate;
  if (r.inicio > limite) return out;
  if (r.periodicidade === 'unica') {
    if (r.inicio >= de) out.push(r.inicio);
    return out;
  }
  const diaAncora = Number(r.inicio.slice(8, 10));
  const passo = PASSO_MESES[r.periodicidade];
  let k = 0;
  // Salta diretamente para perto de `de` para não iterar anos de histórico.
  if (de > r.inicio) {
    if (passo) k = Math.max(0, Math.floor(diferencaDias(r.inicio, de) / 31 / passo) - 1);
    else k = Math.max(0, Math.floor(diferencaDias(r.inicio, de) / 7) - 1);
  }
  for (let i = 0; i < 2000; i++, k++) {
    const d = passo ? somarMeses(r.inicio, k * passo, diaAncora) : somarDias(r.inicio, k * 7);
    if (d > limite) break;
    if (d >= de) out.push(d);
  }
  return out;
}

export function proximaOcorrencia(r: Recorrente, aPartirDe: string): string | null {
  return ocorrencias(r, aPartirDe, somarDias(aPartirDe, 800))[0] ?? null;
}

export function movimentoDeRecorrente(r: Recorrente, data: string): Movimento {
  return {
    id: novoId(),
    tipo: r.tipo,
    data,
    valor: valorRecorrente(r),
    descricao: r.descricao,
    contaId: r.contaId,
    contaDestinoId: r.tipo === 'transferencia' ? r.contaDestinoId : null,
    categoriaId: r.tipo === 'transferencia' ? null : r.categoriaId,
    meio: r.meio,
    fixa: r.fixa,
    recorrenteId: r.id,
    valorBruto: r.valorBruto,
    notas: r.porDefinir ? 'Valor por definir' : '',
  };
}

/**
 * Lança como movimentos as ocorrências automáticas já vencidas (até `ate`).
 * Devolve null se não houver nada a lançar.
 */
export function lancarVencidas(estado: Estado, ate: string): Estado | null {
  const novos: Movimento[] = [];
  const recorrentes = estado.recorrentes.map((r) => {
    if (!r.ativo || !r.automatico) return r;
    const de = r.geradoAte ? somarDias(r.geradoAte, 1) : r.inicio;
    const datas = ocorrencias(r, de, ate);
    if (!datas.length) return r;
    for (const d of datas) novos.push(movimentoDeRecorrente(r, d));
    return { ...r, geradoAte: datas[datas.length - 1] };
  });
  if (!novos.length) return null;
  return { ...estado, recorrentes, movimentos: [...estado.movimentos, ...novos] };
}

export interface Ocorrencia {
  recorrente: Recorrente;
  data: string;
  valor: number;
  /** Já existe um movimento lançado para esta ocorrência. */
  lancada: boolean;
}

/** Ocorrências (lançadas ou previstas) entre duas datas, para calendário e alertas. */
export function ocorrenciasEntre(estado: Estado, de: string, ate: string): Ocorrencia[] {
  const lancadas = new Set(
    estado.movimentos.filter((m) => m.recorrenteId).map((m) => `${m.recorrenteId}|${m.data}`),
  );
  const out: Ocorrencia[] = [];
  for (const r of estado.recorrentes) {
    if (!r.ativo) continue;
    for (const d of ocorrencias(r, de, ate)) {
      out.push({ recorrente: r, data: d, valor: valorRecorrente(r), lancada: lancadas.has(`${r.id}|${d}`) });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

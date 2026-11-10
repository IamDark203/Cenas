// Alocações virtuais: divisões contabilísticas do saldo de uma conta. Não criam património.
import { arred } from './formato';
import { novoId } from './ids';
import type { Alocacao, Conta, Estado, Movimento, Objetivo, TipoAlocacao } from './tipos';

export const NOMES_TIPO_ALOCACAO: Record<TipoAlocacao, string> = {
  fundo: 'Fundo de emergência',
  despesa: 'Despesa futura',
  investimento: 'Investimento por executar',
  outro: 'Outro objetivo',
};

export function valorObjetivo(o: Objetivo): number {
  return o.valorInicial + o.contribuicoes.reduce((s, c) => s + c.valor, 0);
}

export interface ItemAlocacao {
  id: string;
  nome: string;
  tipo: TipoAlocacao | 'objetivo';
  valor: number;
  /** Alocação manual (editável aqui) ou reserva de um objetivo de poupança. */
  origem: 'alocacao' | 'objetivo';
  refId: string;
}

export interface AlocacoesConta {
  itens: ItemAlocacao[];
  alocado: number;
  /** Capital não atribuído (pode ser negativo se o saldo desceu abaixo das alocações). */
  naoAtribuido: number;
  /** Quanto as alocações excedem o saldo (0 quando está tudo coerente). */
  excesso: number;
}

/** Alocações de uma conta: manuais + reservas de objetivos associados a esta conta. */
export function alocacoesConta(estado: Estado, contaId: string, saldo: number): AlocacoesConta {
  const itens: ItemAlocacao[] = [
    ...estado.alocacoes
      .filter((a) => a.contaId === contaId && a.valor > 0)
      .map((a): ItemAlocacao => ({ id: a.id, nome: a.nome, tipo: a.tipo, valor: a.valor, origem: 'alocacao', refId: a.id })),
    ...estado.objetivos
      .filter((o) => o.contaId === contaId && valorObjetivo(o) > 0)
      .map((o): ItemAlocacao => ({ id: `obj:${o.id}`, nome: o.nome, tipo: 'objetivo', valor: valorObjetivo(o), origem: 'objetivo', refId: o.id })),
  ];
  const alocado = arred(itens.reduce((s, i) => s + i.valor, 0));
  const naoAtribuido = arred(saldo - alocado);
  return { itens, alocado, naoAtribuido, excesso: Math.max(0, -naoAtribuido) };
}

/** Valor reservado ao fundo de emergência numa conta, limitado ao saldo positivo da conta. */
export function fundoNaConta(estado: Estado, contaId: string, saldo: number): number {
  const v = estado.alocacoes.filter((a) => a.contaId === contaId && a.tipo === 'fundo').reduce((s, a) => s + a.valor, 0);
  return Math.min(Math.max(0, saldo), v);
}

/**
 * Verifica se é possível alterar uma alocação (ou criar uma nova) em `delta` euros.
 * Uma alocação nunca pode ficar negativa nem fazer a soma das alocações ultrapassar o saldo.
 */
export function validarAlteracao(livre: number, valorAtual: number, novoValor: number): string | null {
  if (!Number.isFinite(novoValor)) return 'Valor inválido.';
  if (novoValor < 0) return 'O valor não pode ser negativo.';
  const delta = novoValor - valorAtual;
  if (delta > livre + 0.005) return `Só há ${livre.toFixed(2).replace('.', ',')} € não atribuídos nesta conta.`;
  return null;
}

/** Define o valor de uma alocação (cria se não existir), registando a alteração no histórico. */
export function definirAlocacao(
  estado: Estado,
  dados: { id?: string; contaId: string; nome: string; tipo: TipoAlocacao; valor: number },
  data: string,
  motivo: string,
): Estado {
  const existente = dados.id ? estado.alocacoes.find((a) => a.id === dados.id) : undefined;
  const delta = arred(dados.valor - (existente?.valor ?? 0));
  if (existente) {
    return {
      ...estado,
      alocacoes: estado.alocacoes.map((a) =>
        a.id === existente.id
          ? { ...a, nome: dados.nome, tipo: dados.tipo, valor: arred(dados.valor), historico: delta ? [...a.historico, { data, delta, motivo }] : a.historico }
          : a,
      ),
    };
  }
  const nova: Alocacao = { id: dados.id ?? novoId(), contaId: dados.contaId, nome: dados.nome, tipo: dados.tipo, valor: arred(dados.valor), historico: [{ data, delta, motivo }] };
  return { ...estado, alocacoes: [...estado.alocacoes, nova] };
}

/** Soma `delta` à alocação do fundo de emergência nessa conta (cria-a se não existir). */
export function reforcarFundo(estado: Estado, contaId: string, delta: number, data: string, motivo: string): Estado {
  const a = estado.alocacoes.find((x) => x.contaId === contaId && x.tipo === 'fundo');
  return definirAlocacao(estado, { id: a?.id, contaId, nome: a?.nome ?? 'Fundo de emergência', tipo: 'fundo', valor: (a?.valor ?? 0) + delta }, data, motivo);
}

/**
 * Regista juros recebidos numa conta e aplica a política de juros da conta:
 * - nao-atribuido (predefinida): o saldo sobe e o excedente fica como capital não atribuído;
 * - proporcional: os juros são repartidos pelas alocações na proporção do seu peso no saldo;
 * - destino: os juros vão para a alocação ou objetivo escolhido.
 */
export function registarJuros(estado: Estado, conta: Conta, valor: number, data: string, saldoAntes: number): Estado {
  const mov: Movimento = {
    id: novoId(),
    tipo: 'receita',
    data,
    valor: arred(valor),
    descricao: `Juros · ${conta.nome}`,
    contaId: conta.id,
    contaDestinoId: null,
    categoriaId: estado.categorias.some((c) => c.id === 'rec-juros') ? 'rec-juros' : null,
    meio: null,
    fixa: false,
    recorrenteId: null,
    juros: true,
    valorBruto: null,
    notas: '',
  };
  let e: Estado = { ...estado, movimentos: [...estado.movimentos, mov] };
  const politica = conta.politicaJuros ?? 'nao-atribuido';
  if (politica === 'destino' && conta.jurosDestino) {
    if (conta.jurosDestino.startsWith('obj:')) {
      const id = conta.jurosDestino.slice(4);
      e = { ...e, objetivos: e.objetivos.map((o) => (o.id === id ? { ...o, contribuicoes: [...o.contribuicoes, { id: novoId(), data, valor: mov.valor, notas: 'Juros' }] } : o)) };
    } else {
      const a = e.alocacoes.find((x) => x.id === conta.jurosDestino);
      if (a) e = definirAlocacao(e, { ...a, valor: a.valor + mov.valor }, data, 'Juros');
    }
  } else if (politica === 'proporcional' && saldoAntes > 0) {
    const { itens } = alocacoesConta(estado, conta.id, saldoAntes);
    for (const i of itens) {
      const parte = Math.floor((mov.valor * i.valor * 100) / saldoAntes) / 100;
      if (parte <= 0) continue;
      if (i.origem === 'alocacao') {
        const a = e.alocacoes.find((x) => x.id === i.refId) as Alocacao;
        e = definirAlocacao(e, { ...a, valor: a.valor + parte }, data, 'Juros (proporcional)');
      } else {
        e = { ...e, objetivos: e.objetivos.map((o) => (o.id === i.refId ? { ...o, contribuicoes: [...o.contribuicoes, { id: novoId(), data, valor: parte, notas: 'Juros (proporcional)' }] } : o)) };
      }
    }
  }
  return e;
}

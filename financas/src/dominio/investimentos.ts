import type { Ativo, CategoriaAtivo, Estado, Operacao } from './tipos';

export const NOMES_CATEGORIA_ATIVO: Record<CategoriaAtivo, string> = {
  'etf-acoes': 'ETF de ações',
  'etf-obrigacoes': 'ETF de obrigações',
  acoes: 'Ações individuais',
  outros: 'Outros ativos',
};

export const CATEGORIAS_ATIVO = Object.keys(NOMES_CATEGORIA_ATIVO) as CategoriaAtivo[];

export interface Posicao {
  quantidade: number;
  /** Custo de aquisição das unidades ainda detidas (inclui comissões de compra). */
  custo: number;
  precoMedio: number;
  /** Ganho/perda já realizado em vendas (líquido de comissões). */
  realizado: number;
  comissoes: number;
  totalComprado: number;
}

/** Posição pelo método do custo médio ponderado, com operações até `ate`. */
export function posicao(ativoId: string, operacoes: Operacao[], ate = '9999-12-31'): Posicao {
  const ops = operacoes
    .filter((o) => o.ativoId === ativoId && o.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data));
  let quantidade = 0;
  let custo = 0;
  let realizado = 0;
  let comissoes = 0;
  let totalComprado = 0;
  for (const o of ops) {
    comissoes += o.comissao;
    if (o.tipo === 'compra') {
      quantidade += o.quantidade;
      custo += o.quantidade * o.preco + o.comissao;
      totalComprado += o.quantidade * o.preco + o.comissao;
    } else {
      const q = Math.min(o.quantidade, quantidade);
      const medio = quantidade > 0 ? custo / quantidade : 0;
      realizado += q * o.preco - o.comissao - medio * q;
      custo -= medio * q;
      quantidade -= q;
    }
  }
  if (quantidade < 1e-9) {
    quantidade = 0;
    custo = 0;
  }
  return { quantidade, custo, precoMedio: quantidade > 0 ? custo / quantidade : 0, realizado, comissoes, totalComprado };
}

/** Última cotação conhecida até à data. */
export function precoEm(ativo: Ativo, data = '9999-12-31'): { data: string; preco: number } | null {
  let melhor: { data: string; preco: number } | null = null;
  for (const p of ativo.precos) if (p.data <= data && (!melhor || p.data >= melhor.data)) melhor = p;
  return melhor;
}

/** Valor de mercado; sem cotação usa o preço médio de aquisição. */
export function valorMercado(ativo: Ativo, operacoes: Operacao[], data = '9999-12-31'): number {
  const p = posicao(ativo.id, operacoes, data);
  const cot = precoEm(ativo, data);
  return p.quantidade * (cot ? cot.preco : p.precoMedio);
}

/** Efeito de uma operação no saldo da conta associada. */
export function fluxoOperacao(o: Operacao): number {
  return o.tipo === 'compra' ? -(o.quantidade * o.preco + o.comissao) : o.quantidade * o.preco - o.comissao;
}

export interface LinhaCarteira {
  ativo: Ativo;
  posicao: Posicao;
  cotacao: { data: string; preco: number } | null;
  valor: number;
  ganho: number;
  rentabilidade: number;
}

export interface ResumoCarteira {
  linhas: LinhaCarteira[];
  investido: number;
  valor: number;
  ganhoLatente: number;
  realizado: number;
  comissoes: number;
  rentabilidade: number;
  porCategoria: Record<CategoriaAtivo, number>;
}

export function resumoCarteira(estado: Estado, data = '9999-12-31'): ResumoCarteira {
  const porCategoria: Record<CategoriaAtivo, number> = { 'etf-acoes': 0, 'etf-obrigacoes': 0, acoes: 0, outros: 0 };
  let investido = 0;
  let valor = 0;
  let realizado = 0;
  let comissoes = 0;
  const linhas = estado.ativos.map((ativo) => {
    const p = posicao(ativo.id, estado.operacoes, data);
    const cot = precoEm(ativo, data);
    const v = p.quantidade * (cot ? cot.preco : p.precoMedio);
    investido += p.custo;
    valor += v;
    realizado += p.realizado;
    comissoes += p.comissoes;
    porCategoria[ativo.categoria] += v;
    const ganho = v - p.custo;
    return { ativo, posicao: p, cotacao: cot, valor: v, ganho, rentabilidade: p.custo > 0 ? ganho / p.custo : 0 };
  });
  const ganhoLatente = valor - investido;
  return {
    linhas,
    investido,
    valor,
    ganhoLatente,
    realizado,
    comissoes,
    rentabilidade: investido > 0 ? ganhoLatente / investido : 0,
    porCategoria,
  };
}

/** Compara a alocação atual (por valor de mercado) com a pretendida. */
export function compararAlocacao(estado: Estado, resumo: ResumoCarteira) {
  return (Object.keys(NOMES_CATEGORIA_ATIVO) as CategoriaAtivo[]).map((c) => {
    const atual = resumo.valor > 0 ? resumo.porCategoria[c] / resumo.valor : 0;
    const alvo = (estado.alocacaoAlvo[c] ?? 0) / 100;
    const valorAlvo = resumo.valor * alvo;
    return { categoria: c, atual, alvo, diferencaPp: (atual - alvo) * 100, diferencaValor: resumo.porCategoria[c] - valorAlvo };
  });
}

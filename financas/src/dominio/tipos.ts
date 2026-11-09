// Modelo de dados. Todos os valores monetários em euros; datas em ISO (AAAA-MM-DD).

export type TipoConta = 'ordem' | 'poupanca' | 'prazo' | 'refeicao' | 'investimento' | 'outra';
export type Periodicidade = 'unica' | 'semanal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type PeriodicidadeJuros = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'maturidade';
export type MeioPagamento = 'debito' | 'cartao' | 'refeicao' | 'numerario';
export type TipoMovimento = 'receita' | 'despesa' | 'transferencia' | 'ajuste';
export type CategoriaAtivo = 'etf-acoes' | 'etf-obrigacoes' | 'acoes' | 'outros';

export interface Conta {
  id: string;
  nome: string;
  instituicao: string;
  tipo: TipoConta;
  saldoInicial: number;
  /** Data a que o saldo inicial se refere. Movimentos anteriores não alteram o saldo. */
  dataSaldoInicial: string;
  /** Taxa anual nominal bruta (%), se aplicável. */
  tanb: number | null;
  /** TANL (%) indicada pelo utilizador; se vazia é calculada com a taxa de retenção das Definições. */
  tanl: number | null;
  limiteRemunerado: number | null;
  periodicidadeJuros: PeriodicidadeJuros | null;
  condicoes: string;
  fundoEmergencia: boolean;
  arquivada: boolean;
  notas: string;
}

export interface Categoria {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  /** Orçamento mensal (só despesas). */
  orcamento: number | null;
}

export interface Movimento {
  id: string;
  tipo: TipoMovimento;
  data: string;
  valor: number;
  descricao: string;
  contaId: string;
  /** Só transferências. */
  contaDestinoId: string | null;
  categoriaId: string | null;
  meio: MeioPagamento | null;
  fixa: boolean;
  recorrenteId: string | null;
  /** Só receitas de salário/subsídios: valor bruto informativo. */
  valorBruto: number | null;
  notas: string;
}

export interface Recorrente {
  id: string;
  tipo: 'receita' | 'despesa' | 'transferencia';
  descricao: string;
  /** Valor líquido que entra/sai da conta. */
  valor: number;
  /** Para rendimentos calculados por dia (ex.: subsídio de alimentação). */
  porDia: { valorDia: number; dias: number } | null;
  valorBruto: number | null;
  /** Falso enquanto o utilizador não confirmar o valor líquido de um salário. */
  liquidoConfirmado: boolean;
  /** Valor ainda por definir pelo utilizador (não usar em decisões). */
  porDefinir: boolean;
  categoriaId: string | null;
  contaId: string;
  contaDestinoId: string | null;
  meio: MeioPagamento | null;
  fixa: boolean;
  periodicidade: Periodicidade;
  /** Data da primeira ocorrência; define o dia (e mês) das seguintes. */
  inicio: string;
  fim: string | null;
  /** Criar automaticamente o movimento na data. */
  automatico: boolean;
  ativo: boolean;
  /** Última data já lançada como movimento. */
  geradoAte: string | null;
  notas: string;
}

export interface Contribuicao {
  id: string;
  data: string;
  valor: number;
  notas: string;
}

export interface Objetivo {
  id: string;
  nome: string;
  valorAlvo: number;
  dataLimite: string | null;
  contaId: string | null;
  reforcoMensal: number;
  valorInicial: number;
  contribuicoes: Contribuicao[];
  notas: string;
}

export interface Operacao {
  id: string;
  ativoId: string;
  tipo: 'compra' | 'venda';
  data: string;
  quantidade: number;
  preco: number;
  comissao: number;
  /** Conta de onde sai (compra) ou para onde vai (venda) o dinheiro; null = não mexe em contas. */
  contaId: string | null;
  notas: string;
}

export interface Ativo {
  id: string;
  nome: string;
  identificador: string;
  categoria: CategoriaAtivo;
  /** Histórico de cotações introduzidas ou obtidas (data, preço por unidade). */
  precos: { data: string; preco: number }[];
  notas: string;
}

export interface FundoEmergenciaConfig {
  meses: number;
  /** Recorrentes de despesa consideradas essenciais. */
  essenciaisIds: string[];
  necessidadesBasicas: number;
  extraordinarias: { id: string; nome: string; valor: number }[];
  /** Objetivo definido manualmente; null = calculado. */
  objetivoManual: number | null;
  reforcoMensal: number;
}

export interface CenarioAlocacao {
  id: string;
  nome: string;
  base: number;
  percentagens: Record<CategoriaAlocacao, number>;
}

export type CategoriaAlocacao = 'ordem' | 'fundo' | 'poupanca' | 'investimentos' | 'objetivos';

export interface ConfigAlertas {
  recorrentesDias: number;
  recorrentes: boolean;
  orcamento: boolean;
  objetivos: boolean;
  reforcos: boolean;
  reforcoDiaLimite: number;
  distribuicao: boolean;
  distribuicaoLimitePp: number;
  fundo: boolean;
  porDefinir: boolean;
}

export interface Pressupostos {
  /** Retenção na fonte sobre juros (%), para calcular TANL quando não indicada. */
  retencaoJuros: number;
  dca: {
    capitalInicial: number;
    reforco: number;
    anos: number;
    frequencia: 'mensal' | 'trimestral' | 'anual';
    taxas: { pessimista: number; intermedio: number; otimista: number };
  };
  projecao: {
    variacaoSalarial: number;
    aumentoDespesas: number;
    reducaoRendimentos: number;
    poupancaMensal: number | null;
    percentagemInvestida: number;
    rentabilidadeInvestimentos: number;
    remuneracaoPoupanca: number;
  };
  cotacoes: { url: string; caminho: string };
}

export interface Perfil {
  nome: string;
  residencia: string;
  salarioBruto: number | null;
  salarioLiquido: number | null;
  /** Mês de referência do orçamento (AAAA-MM); null = mês atual. */
  mesReferencia: string | null;
  moeda: 'EUR';
  tema: 'sistema' | 'claro' | 'escuro';
  incluirRefeicaoPatrimonio: boolean;
}

export interface Estado {
  versao: 1;
  criadoEm: string;
  perfil: Perfil;
  contas: Conta[];
  categorias: Categoria[];
  movimentos: Movimento[];
  recorrentes: Recorrente[];
  objetivos: Objetivo[];
  ativos: Ativo[];
  operacoes: Operacao[];
  alocacaoAlvo: Record<CategoriaAtivo, number>;
  fundo: FundoEmergenciaConfig;
  cenarios: CenarioAlocacao[];
  alertas: ConfigAlertas;
  alertasDispensados: string[];
  pressupostos: Pressupostos;
}

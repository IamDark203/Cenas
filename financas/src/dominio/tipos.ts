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
  /** Obsoleto: substituído pelas alocações do tipo "fundo". Mantido só para migrar dados antigos. */
  fundoEmergencia: boolean;
  arquivada: boolean;
  notas: string;
  /** Conta usada para despesas do dia a dia (entra no "Disponível para gastar"). */
  paraGastos?: boolean;
  /** O que fazer aos juros recebidos nesta conta. */
  politicaJuros?: PoliticaJuros;
  /** Destino dos juros quando a política é "destino": id de uma alocação ou "obj:<id do objetivo>". */
  jurosDestino?: string | null;
  /** Produto bancário (do comparador) que corresponde a esta conta. */
  produtoId?: string | null;
}

export type PoliticaJuros = 'nao-atribuido' | 'proporcional' | 'destino';

export type TipoAlocacao = 'fundo' | 'despesa' | 'investimento' | 'outro';

/**
 * Alocação virtual: parte do saldo de uma conta reservada para um fim.
 * Não cria património: a soma das alocações de uma conta nunca pode exceder o seu saldo.
 * As reservas dos objetivos de poupança são calculadas a partir dos próprios objetivos (conta + contribuições).
 */
export interface Alocacao {
  id: string;
  contaId: string;
  nome: string;
  tipo: TipoAlocacao;
  valor: number;
  historico: { data: string; delta: number; motivo: string }[];
}

export interface Categoria {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  /** Orçamento mensal (só despesas). */
  orcamento: number | null;
  /** Despesa essencial (entra no fundo de emergência). */
  essencial?: boolean;
  /** Despesa de lazer / não essencial (entra no orçamento de lazer). */
  lazer?: boolean;
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
  /** Receita de juros de uma conta (a política de juros da conta já foi aplicada). */
  juros?: boolean;
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
  /** 1 = alta, 2 = média, 3 = baixa. */
  prioridade?: 1 | 2 | 3;
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
  /** automatico: despesas essenciais calculadas pelas categorias; manual: escolhidas uma a uma. */
  modo?: 'automatico' | 'manual';
  /** Usar o número de meses sugerido pela aplicação. */
  usarSugestao?: boolean;
  /** Valor mínimo protegido definido pelo utilizador; nunca é reduzido automaticamente. */
  minimoProtegido?: number | null;
  meses: number;
  /** Recorrentes de despesa consideradas essenciais. */
  essenciaisIds: string[];
  necessidadesBasicas: number;
  extraordinarias: { id: string; nome: string; valor: number }[];
  /** Obsoleto: substituído por minimoProtegido. */
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
  dependentes?: number;
  estabilidade?: 'estavel' | 'moderada' | 'instavel';
  regularidade?: 'regular' | 'variavel';
}

export type DestinoReforco = 'fundo' | 'objetivos' | 'investimentos' | 'disponivel';

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
  alocacoes: Alocacao[];
  /** Ordem de prioridade na distribuição de novos reforços. */
  prioridades: DestinoReforco[];
  /** Valores mensais planeados que não são despesas nem objetivos. */
  planoMensal: { investimento: number; outrasPoupancas: number };
  /** Cartão-refeição: categorias que o utilizador quer pagar com ele. */
  refeicao: { finalidadeIds: string[] };
  /** Comparador bancário: preferências e produtos acrescentados pelo utilizador. */
  bancos: ConfigBancos;
}

export interface ConfigBancos {
  /** Requisitos que o utilizador consegue cumprir (ids de requisito). */
  requisitosCumpridos: string[];
  /** Instituições onde já tem conta. */
  instituicoesCliente: string[];
  liquidez: 'imediata' | 'curta' | 'indiferente';
  semComissoes: boolean;
  incluirContaOrdem: boolean;
  /** Assinaturas dos produtos na última consulta, para detetar alterações. */
  instantaneo: Record<string, string>;
  ultimaConsulta: string | null;
  alteracoes: { id: string; data: string; produtoId: string; texto: string; impacto: number | null }[];
}

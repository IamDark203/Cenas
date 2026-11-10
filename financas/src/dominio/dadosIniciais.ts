import { hoje, somarMeses } from './datas';
import type { Categoria, Conta, Estado, Recorrente } from './tipos';

/** Próxima data (a partir de hoje, inclusive) com o dia do mês indicado; `mes` fixa o mês (ocorrências anuais). */
export function proximaData(hojeIso: string, dia: number, mes?: number): string {
  const [a, m] = hojeIso.split('-').map(Number);
  if (mes == null) {
    const candidata = somarMeses(`${a}-${String(m).padStart(2, '0')}-01`, 0, dia);
    return candidata >= hojeIso ? candidata : somarMeses(candidata, 1, dia);
  }
  const candidata = somarMeses(`${a}-${String(mes).padStart(2, '0')}-01`, 0, dia);
  return candidata >= hojeIso ? candidata : somarMeses(candidata, 12, dia);
}

function conta(p: Partial<Conta> & Pick<Conta, 'id' | 'nome' | 'tipo'>, data: string): Conta {
  return {
    instituicao: '',
    saldoInicial: 0,
    dataSaldoInicial: data,
    tanb: null,
    tanl: null,
    limiteRemunerado: null,
    periodicidadeJuros: null,
    condicoes: '',
    fundoEmergencia: false,
    arquivada: false,
    notas: '',
    paraGastos: p.tipo === 'ordem',
    politicaJuros: 'nao-atribuido',
    jurosDestino: null,
    produtoId: null,
    ...p,
  };
}

function rec(p: Partial<Recorrente> & Pick<Recorrente, 'id' | 'tipo' | 'descricao' | 'contaId' | 'inicio'>): Recorrente {
  return {
    valor: 0,
    porDia: null,
    valorBruto: null,
    liquidoConfirmado: true,
    porDefinir: false,
    categoriaId: null,
    contaDestinoId: null,
    meio: null,
    fixa: true,
    periodicidade: 'mensal',
    fim: null,
    automatico: true,
    ativo: true,
    geradoAte: null,
    notas: '',
    ...p,
  };
}

// [id, nome, orçamento, tipo] — e: essencial, l: lazer, '': fixa/outra
export const CATEGORIAS_DESPESA: [string, string, number | null, 'e' | 'l' | ''][] = [
  ['cat-habitacao', 'Habitação', 38, 'e'],
  ['cat-alimentacao', 'Alimentação', 50, 'e'],
  ['cat-transportes', 'Transportes e combustível', null, 'e'],
  ['cat-saude', 'Saúde', 25, 'e'],
  ['cat-subscricoes', 'Subscrições', 14.99, ''],
  ['cat-lazer', 'Lazer', null, 'l'],
  ['cat-automoveis', 'Automóveis', null, 'e'],
  ['cat-compras', 'Compras pessoais', null, 'l'],
  ['cat-seguros', 'Seguros', null, 'e'],
  ['cat-emprestimos', 'Empréstimos e prestações', null, 'e'],
  ['cat-restaurantes', 'Restaurantes', null, 'l'],
  ['cat-entretenimento', 'Entretenimento', null, 'l'],
  ['cat-viagens', 'Viagens', null, 'l'],
  ['cat-hobbies', 'Hobbies', null, 'l'],
  ['cat-outros', 'Outros', null, ''],
];

export const CATEGORIAS_RECEITA: [string, string][] = [
  ['rec-salario', 'Salário'],
  ['rec-alimentacao', 'Subsídio de alimentação'],
  ['rec-ferias', 'Subsídio de férias'],
  ['rec-natal', 'Subsídio de Natal'],
  ['rec-freelance', 'Trabalhos freelance'],
  ['rec-investimentos', 'Rendimentos de investimentos'],
  ['rec-juros', 'Juros de poupança'],
  ['rec-outros', 'Outros rendimentos'],
];

export function estadoVazio(dataIso = hoje()): Estado {
  return {
    versao: 1,
    criadoEm: dataIso,
    perfil: {
      nome: '',
      residencia: '',
      salarioBruto: null,
      salarioLiquido: null,
      mesReferencia: null,
      moeda: 'EUR',
      tema: 'sistema',
      incluirRefeicaoPatrimonio: true,
      dependentes: 0,
      estabilidade: 'estavel',
      regularidade: 'regular',
    },
    contas: [],
    categorias: [
      ...CATEGORIAS_DESPESA.map(([id, nome, orcamento, t]): Categoria => ({ id, nome, tipo: 'despesa', orcamento, essencial: t === 'e', lazer: t === 'l' })),
      ...CATEGORIAS_RECEITA.map(([id, nome]): Categoria => ({ id, nome, tipo: 'receita', orcamento: null })),
    ],
    movimentos: [],
    recorrentes: [],
    objetivos: [],
    ativos: [],
    operacoes: [],
    alocacaoAlvo: { 'etf-acoes': 0, 'etf-obrigacoes': 0, acoes: 0, outros: 0 },
    fundo: {
      modo: 'automatico',
      usarSugestao: true,
      minimoProtegido: null,
      meses: 6,
      essenciaisIds: [],
      necessidadesBasicas: 0,
      extraordinarias: [],
      objetivoManual: null,
      reforcoMensal: 0,
    },
    cenarios: [],
    alertas: {
      recorrentes: true,
      recorrentesDias: 5,
      orcamento: true,
      objetivos: true,
      reforcos: true,
      reforcoDiaLimite: 15,
      distribuicao: true,
      distribuicaoLimitePp: 10,
      fundo: true,
      porDefinir: true,
    },
    alertasDispensados: [],
    pressupostos: {
      retencaoJuros: 28,
      dca: { capitalInicial: 1000, reforco: 100, anos: 10, frequencia: 'mensal', taxas: { pessimista: 2, intermedio: 5, otimista: 8 } },
      projecao: {
        variacaoSalarial: 0,
        aumentoDespesas: 0,
        reducaoRendimentos: 0,
        poupancaMensal: null,
        percentagemInvestida: 0,
        rentabilidadeInvestimentos: 0,
        remuneracaoPoupanca: 0,
      },
      cotacoes: { url: '', caminho: '' },
    },
    alocacoes: [],
    prioridades: ['fundo', 'objetivos', 'investimentos', 'disponivel'],
    planoMensal: { investimento: 0, outrasPoupancas: 0 },
    refeicao: { finalidadeIds: [] },
    bancos: {
      requisitosCumpridos: [],
      instituicoesCliente: [],
      liquidez: 'imediata',
      semComissoes: false,
      incluirContaOrdem: true,
      instantaneo: {},
      ultimaConsulta: null,
      alteracoes: [],
    },
  };
}

/** Dados iniciais indicados pelo utilizador. Tudo é editável depois. */
export function estadoInicial(dataIso = hoje()): Estado {
  const e = estadoVazio(dataIso);
  e.perfil = { ...e.perfil, residencia: 'Casa dos pais (sem renda)', salarioBruto: 1000 };
  e.contas = [
    conta(
      { id: 'conta-ordem', nome: 'Conta à ordem', tipo: 'ordem', notas: 'Indica o banco e o saldo atual.' },
      dataIso,
    ),
    conta(
      {
        id: 'conta-ctt',
        nome: 'Conta Poupança',
        instituicao: 'Banco CTT',
        tipo: 'poupanca',
        saldoInicial: 5000,
        tanb: 3,
        limiteRemunerado: 5000,
        produtoId: 'ctt-conta-poupanca-livre',
        condicoes: 'Taxa e condições indicadas pelo utilizador. Podem mudar; confirma junto do banco.',
      },
      dataIso,
    ),
    conta({ id: 'conta-refeicao', nome: 'Cartão-refeição', tipo: 'refeicao', notas: 'Indica o emissor e o saldo atual.' }, dataIso),
  ];
  const ordem = 'conta-ordem';
  e.recorrentes = [
    rec({
      id: 'r-salario',
      tipo: 'receita',
      descricao: 'Salário',
      valor: 1000,
      valorBruto: 1000,
      liquidoConfirmado: false,
      categoriaId: 'rec-salario',
      contaId: ordem,
      inicio: proximaData(dataIso, 25),
      notas: 'Dia de pagamento assumido (25); ajusta se for outro.',
    }),
    rec({
      id: 'r-alimentacao',
      tipo: 'receita',
      descricao: 'Subsídio de alimentação',
      porDia: { valorDia: 10.46, dias: 22 },
      valor: 230.12,
      categoriaId: 'rec-alimentacao',
      contaId: 'conta-refeicao',
      inicio: proximaData(dataIso, 25),
      notas: 'Pago em cartão-refeição. 22 dias de trabalho por mês (ajustável).',
    }),
    rec({
      id: 'r-ferias',
      tipo: 'receita',
      descricao: 'Subsídio de férias',
      valor: 1000,
      valorBruto: 1000,
      liquidoConfirmado: false,
      categoriaId: 'rec-ferias',
      contaId: ordem,
      periodicidade: 'anual',
      inicio: proximaData(dataIso, 25, 6),
      notas: 'Mês de pagamento assumido (junho). Se for pago em duodécimos, ajusta.',
    }),
    rec({
      id: 'r-natal',
      tipo: 'receita',
      descricao: 'Subsídio de Natal',
      valor: 1000,
      valorBruto: 1000,
      liquidoConfirmado: false,
      categoriaId: 'rec-natal',
      contaId: ordem,
      periodicidade: 'anual',
      inicio: proximaData(dataIso, 15, 12),
      notas: 'Mês de pagamento assumido (dezembro). Se for pago em duodécimos, ajusta.',
    }),
    rec({ id: 'r-icloud', tipo: 'despesa', descricao: 'iCloud', valor: 9.99, categoriaId: 'cat-subscricoes', contaId: ordem, meio: 'cartao', inicio: proximaData(dataIso, 5) }),
    rec({ id: 'r-applemusic', tipo: 'despesa', descricao: 'Apple Music', valor: 5, categoriaId: 'cat-subscricoes', contaId: ordem, meio: 'cartao', inicio: proximaData(dataIso, 12) }),
    rec({ id: 'r-gas', tipo: 'despesa', descricao: 'Gás', valor: 38, categoriaId: 'cat-habitacao', contaId: ordem, meio: 'debito', fixa: false, inicio: proximaData(dataIso, 20), notas: 'Valor estimado.' }),
    rec({ id: 'r-saude', tipo: 'despesa', descricao: 'Plano de saúde', valor: 25, categoriaId: 'cat-saude', contaId: ordem, meio: 'debito', inicio: proximaData(dataIso, 8) }),
    rec({
      id: 'r-combustivel',
      tipo: 'despesa',
      descricao: 'Combustível (2 automóveis)',
      porDefinir: true,
      categoriaId: 'cat-transportes',
      contaId: ordem,
      meio: 'cartao',
      fixa: false,
      automatico: false,
      inicio: proximaData(dataIso, 1),
      notas: 'Valor por definir: indica quanto gastas por mês.',
    }),
    rec({
      id: 'r-refeicoes',
      tipo: 'despesa',
      descricao: 'Alimentação e refeições fora',
      valor: 37.5,
      categoriaId: 'cat-alimentacao',
      contaId: 'conta-refeicao',
      meio: 'refeicao',
      fixa: false,
      automatico: false,
      inicio: proximaData(dataIso, 1),
      notas: 'Estimativa entre 25 € e 50 € por mês (valor médio). Regista os gastos reais à medida que acontecem.',
    }),
  ];
  e.fundo = { ...e.fundo, essenciaisIds: ['r-gas', 'r-saude', 'r-combustivel', 'r-refeicoes'] };
  e.alocacoes = [
    {
      id: 'aloc-fundo-ctt',
      contaId: 'conta-ctt',
      nome: 'Fundo de emergência',
      tipo: 'fundo',
      valor: 5000,
      historico: [{ data: dataIso, delta: 5000, motivo: 'Valor inicial (ajusta se só parte do saldo for o fundo)' }],
    },
  ];
  e.refeicao = { finalidadeIds: ['cat-alimentacao', 'cat-restaurantes'] };
  e.bancos = { ...e.bancos, instituicoesCliente: ['banco-ctt'] };
  return e;
}

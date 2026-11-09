/*
 * Lógica de cálculo das finanças pessoais.
 * Sem dependências do DOM para poder ser testada em Node (node --test).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FinCalc = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSAO = 1;

  // Quantas vezes por mês (em média) cada frequência acontece.
  const FREQUENCIAS = {
    semanal: { nome: 'Semanal', fator: 52 / 12 },
    mensal: { nome: 'Mensal (12x)', fator: 1 },
    mensal14: { nome: 'Mensal (14x, com subsídios)', fator: 14 / 12 },
    trimestral: { nome: 'Trimestral', fator: 1 / 3 },
    semestral: { nome: 'Semestral', fator: 1 / 6 },
    anual: { nome: 'Anual', fator: 1 / 12 },
  };

  const TIPOS_RENDIMENTO = {
    ordenado: 'Ordenado',
    subsidio: 'Subsídio',
    bonus: 'Prémio / Bónus',
    freelance: 'Trabalho extra / Freelance',
    rendas: 'Rendas',
    juros: 'Juros / Dividendos',
    outro: 'Outro',
  };

  const TIPOS_INVESTIMENTO = {
    acoes: 'Ações',
    etf: 'ETF',
    fundos: 'Fundos',
    ppr: 'PPR',
    obrigacoes: 'Obrigações / Certificados',
    cripto: 'Criptomoedas',
    imobiliario: 'Imobiliário',
    outro: 'Outro',
  };

  const CATEGORIAS_PREDEFINIDAS = [
    'Habitação',
    'Alimentação',
    'Transportes',
    'Saúde',
    'Educação',
    'Lazer',
    'Serviços e subscrições',
    'Seguros',
    'Outros',
  ];

  function numero(v) {
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function arred(v) {
    // Precisão alta para não acumular erros ao converter de mensal para anual.
    return Math.round(v * 1e6) / 1e6;
  }

  function valorMensal(valor, frequencia) {
    const f = FREQUENCIAS[frequencia] ? FREQUENCIAS[frequencia].fator : 1;
    return numero(valor) * f;
  }

  function totalMensal(itens) {
    return arred((itens || []).reduce((s, i) => s + valorMensal(i.valor, i.frequencia), 0));
  }

  function despesasPorCategoria(despesas) {
    const mapa = new Map();
    for (const d of despesas || []) {
      const cat = d.categoria || 'Outros';
      mapa.set(cat, (mapa.get(cat) || 0) + valorMensal(d.valor, d.frequencia));
    }
    return [...mapa.entries()]
      .map(([categoria, valor]) => ({ categoria, valor: arred(valor) }))
      .filter((c) => c.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }

  function resumoInvestimentos(investimentos) {
    let investido = 0;
    let atual = 0;
    for (const i of investimentos || []) {
      investido += numero(i.valorInvestido);
      atual += numero(i.valorAtual);
    }
    const ganho = atual - investido;
    return {
      investido: arred(investido),
      atual: arred(atual),
      ganho: arred(ganho),
      rentabilidade: investido > 0 ? ganho / investido : 0,
    };
  }

  function ganhoInvestimento(inv) {
    const investido = numero(inv.valorInvestido);
    const ganho = numero(inv.valorAtual) - investido;
    return { ganho: arred(ganho), rentabilidade: investido > 0 ? ganho / investido : 0 };
  }

  function progressoObjetivo(poupanca) {
    const objetivo = numero(poupanca.objetivo);
    const saldo = numero(poupanca.saldo);
    if (objetivo <= 0) return null;
    const falta = Math.max(0, objetivo - saldo);
    const contrib = numero(poupanca.contribuicaoMensal);
    return {
      percentagem: Math.min(1, saldo / objetivo),
      falta: arred(falta),
      mesesRestantes: falta === 0 ? 0 : contrib > 0 ? Math.ceil(falta / contrib) : null,
    };
  }

  function resumo(estado) {
    const rendimento = totalMensal(estado.rendimentos);
    const despesas = totalMensal(estado.despesas);
    const poupancaMensal = arred((estado.poupancas || []).reduce((s, p) => s + numero(p.contribuicaoMensal), 0));
    const investimentoMensal = arred(
      (estado.investimentos || []).reduce((s, i) => s + numero(i.contribuicaoMensal), 0),
    );
    const saldoLivre = arred(rendimento - despesas - poupancaMensal - investimentoMensal);
    const totalPoupado = arred((estado.poupancas || []).reduce((s, p) => s + numero(p.saldo), 0));
    const inv = resumoInvestimentos(estado.investimentos);
    return {
      rendimento,
      despesas,
      poupancaMensal,
      investimentoMensal,
      saldoLivre,
      taxaPoupanca: rendimento > 0 ? (poupancaMensal + investimentoMensal) / rendimento : 0,
      totalPoupado,
      investimentos: inv,
      patrimonio: arred(totalPoupado + inv.atual),
    };
  }

  // Distribuição do rendimento mensal: despesas por categoria, poupança, investimento e o que sobra.
  function paraOndeVai(estado) {
    const r = resumo(estado);
    const fatias = despesasPorCategoria(estado.despesas).map((c) => ({
      nome: c.categoria,
      valor: c.valor,
      tipo: 'despesa',
    }));
    if (r.poupancaMensal > 0) fatias.push({ nome: 'Poupança', valor: r.poupancaMensal, tipo: 'poupanca' });
    if (r.investimentoMensal > 0) fatias.push({ nome: 'Investimentos', valor: r.investimentoMensal, tipo: 'investimento' });
    if (r.saldoLivre > 0) fatias.push({ nome: 'Por alocar', valor: r.saldoLivre, tipo: 'livre' });
    return fatias;
  }

  function estadoInicial() {
    return {
      versao: VERSAO,
      rendimentos: [],
      despesas: [],
      poupancas: [],
      investimentos: [],
      categorias: CATEGORIAS_PREDEFINIDAS.slice(),
    };
  }

  function texto(v, max) {
    return String(v == null ? '' : v).slice(0, max || 200);
  }

  function lista(v) {
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
  }

  // Valida e normaliza dados vindos do armazenamento local ou de um ficheiro importado.
  function normalizarEstado(dados) {
    if (!dados || typeof dados !== 'object') throw new Error('Ficheiro inválido: não contém dados de finanças.');
    const base = estadoInicial();
    const id = (x) => texto(x.id, 64) || novoId();
    const freq = (f) => (FREQUENCIAS[f] ? f : 'mensal');
    const categorias = Array.isArray(dados.categorias)
      ? [...new Set(dados.categorias.map((c) => texto(c, 60).trim()).filter(Boolean))]
      : base.categorias;
    return {
      versao: VERSAO,
      categorias: categorias.length ? categorias : base.categorias,
      rendimentos: lista(dados.rendimentos).map((x) => ({
        id: id(x),
        nome: texto(x.nome, 100),
        tipo: TIPOS_RENDIMENTO[x.tipo] ? x.tipo : 'outro',
        valor: numero(x.valor),
        frequencia: freq(x.frequencia),
        notas: texto(x.notas, 500),
      })),
      despesas: lista(dados.despesas).map((x) => ({
        id: id(x),
        nome: texto(x.nome, 100),
        categoria: texto(x.categoria, 60) || 'Outros',
        valor: numero(x.valor),
        frequencia: freq(x.frequencia),
        notas: texto(x.notas, 500),
      })),
      poupancas: lista(dados.poupancas).map((x) => ({
        id: id(x),
        nome: texto(x.nome, 100),
        saldo: numero(x.saldo),
        contribuicaoMensal: numero(x.contribuicaoMensal),
        objetivo: numero(x.objetivo),
        notas: texto(x.notas, 500),
      })),
      investimentos: lista(dados.investimentos).map((x) => ({
        id: id(x),
        nome: texto(x.nome, 100),
        tipo: TIPOS_INVESTIMENTO[x.tipo] ? x.tipo : 'outro',
        valorInvestido: numero(x.valorInvestido),
        valorAtual: numero(x.valorAtual),
        contribuicaoMensal: numero(x.contribuicaoMensal),
        notas: texto(x.notas, 500),
      })),
    };
  }

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    VERSAO,
    FREQUENCIAS,
    TIPOS_RENDIMENTO,
    TIPOS_INVESTIMENTO,
    CATEGORIAS_PREDEFINIDAS,
    numero,
    valorMensal,
    totalMensal,
    despesasPorCategoria,
    resumoInvestimentos,
    ganhoInvestimento,
    progressoObjetivo,
    resumo,
    paraOndeVai,
    estadoInicial,
    normalizarEstado,
    novoId,
  };
});

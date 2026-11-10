// Comparador bancário: modelo dos produtos, simulador de rentabilidade e ranking personalizado.
// Os dados vêm de public/dados/produtos.json (documentação oficial). null = "Não disponível".
import { diasNoMes, somarDias, somarMeses } from './datas';

export interface Escalao {
  de: number;
  ate: number | null;
  tanb: number;
}

export interface NivelTaxa {
  nome: string;
  requisitos: string[];
  logica: 'qualquer' | 'todas';
  descricao: string;
  escaloes: Escalao[];
  tanl?: number | null;
}

export interface Produto {
  id: string;
  instituicaoId: string;
  nome: string;
  tipo: 'conta-poupanca' | 'conta-remunerada' | 'deposito-prazo';
  modalidade: string;
  descricao: string;
  estado: 'comercializado' | 'suspenso' | 'descontinuado';
  publicoAlvo: string | null;
  requisitosAcesso: string[];
  novosClientes: boolean;
  niveis: NivelTaxa[];
  modoEscalao: 'saldo-total' | 'marginal';
  regimeTaxa: string | null;
  promocao: { meses: number | null; inicio: string | null; fim: string | null; escaloes: Escalao[]; descricao: string; requisitos: string[] } | null;
  tael: number | null;
  montantes: { abertura: number | null; permanencia: number | null; maximo: number | null; maximoRemunerado: number | null };
  reforcos: { permite: boolean | null; minimo: number | null; maximo: number | null; descricao: string | null };
  prazo: { dias?: number; meses?: number; renovacao: 'automatica' | 'unica' | 'nao'; tanbRenovacao: number | null } | null;
  juros: {
    baseDias: 360 | 365 | null;
    calculo: string | null;
    periodicidade: 'diaria' | 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'vencimento';
    datasPagamento: { meses: number[]; dia: number } | null;
    regraData: string | null;
    capitaliza: boolean | 'opcional' | null;
    destino: string | null;
  };
  mobilizacao: { tipo: 'livre' | 'penalizacao' | 'nao-permitida'; perdaJuros: 'nenhuma' | 'periodo-corrente' | 'ate-30-dias' | 'total'; preAvisoDias: number | null; descricao: string };
  custos: { abertura: number | null; manutencaoMensal: number | null; encerramento: number | null; contaOrdemObrigatoria: boolean | null; custoContaOrdemMensal: number | null; notas: string | null };
  fiscal: string | null;
  garantia: { sistema: string; limite: number | null; entidade: string; pais: string; notas: string | null } | null;
  fontes: { tipo: string; titulo: string; url: string; vigorDesde: string | null }[];
  verificacao: { estado: 'verificada' | 'parcial' | 'desatualizada'; ultima: string; proxima: string | null; hashFonte: string | null; notas: string | null };
  historico: { data: string; descricao: string; anterior?: unknown }[];
}

export interface Instituicao {
  id: string;
  nome: string;
  entidade: string;
  pais: string;
  site: string;
  cobertura: 'verificada' | 'parcial' | 'sem-dados';
  motivo: string | null;
}

export interface BaseProdutos {
  versao: number;
  geradoEm: string;
  requisitos: Record<string, string>;
  instituicoes: Instituicao[];
  produtos: Produto[];
}

export const NOMES_TIPO_PRODUTO: Record<Produto['tipo'], string> = {
  'conta-poupanca': 'Conta poupança',
  'conta-remunerada': 'Conta remunerada',
  'deposito-prazo': 'Depósito a prazo',
};

export const NOMES_PERIODICIDADE_JUROS: Record<Produto['juros']['periodicidade'], string> = {
  diaria: 'Diária',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  vencimento: 'No vencimento',
};

/** Nível de taxa aplicável a quem cumpre os requisitos indicados (o primeiro da lista cujas condições se cumprem). */
export function nivelAplicavel(p: Produto, cumpridos: string[]): NivelTaxa | null {
  for (const n of p.niveis) {
    if (!n.requisitos.length) return n;
    const ok = n.logica === 'qualquer' ? n.requisitos.some((r) => cumpridos.includes(r)) : n.requisitos.every((r) => cumpridos.includes(r));
    if (ok) return n;
  }
  return null;
}

/** Maior TANB anunciada (incluindo promocional), apenas para ordenação e destaque — nunca usada como taxa permanente. */
export function tanbMaxima(p: Produto): number {
  const todas = [...p.niveis.flatMap((n) => n.escaloes), ...(p.promocao?.escaloes ?? [])].map((e) => e.tanb);
  return todas.length ? Math.max(...todas) : 0;
}

/** TANB permanente (sem promoção) para quem cumpre os requisitos. */
export function tanbPermanente(p: Produto, cumpridos: string[], saldo = 1000): number | null {
  const n = nivelAplicavel(p, cumpridos);
  if (!n) return null;
  return taxaPara(n.escaloes, saldo);
}

function taxaPara(escaloes: Escalao[], saldo: number): number {
  const e = escaloes.find((x) => saldo >= x.de && (x.ate == null || saldo <= x.ate));
  return e ? e.tanb : 0;
}

/** Juro bruto de um dia, respeitando escalões e capital máximo remunerado. */
export function juroDiario(escaloes: Escalao[], modo: Produto['modoEscalao'], saldo: number, maxRem: number | null, base: number): number {
  const s = Math.max(0, maxRem != null ? Math.min(saldo, maxRem) : saldo);
  if (s <= 0) return 0;
  if (modo === 'marginal') {
    let total = 0;
    for (const e of escaloes) {
      const topo = e.ate == null ? s : Math.min(s, e.ate);
      const parte = Math.max(0, topo - e.de);
      total += (parte * e.tanb) / 100;
    }
    return total / base;
  }
  return (s * taxaPara(escaloes, saldo)) / 100 / base;
}

// ---------- Simulador (Módulos 12 e 13) ----------

export interface ParametrosSimulacao {
  capitalInicial: number;
  reforcoMensal: number;
  diaReforco: number;
  reforcosExtra: { data: string; valor: number }[];
  meses: number;
  dataAbertura: string;
  requisitosCumpridos: string[];
  /** Imposto sobre juros (%), configurável. */
  taxaImposto: number;
  incluirCustoContaOrdem: boolean;
  /** Capitalizar quando o produto deixa escolher. */
  capitalizarOpcional: boolean;
}

export interface PontoMensal {
  mes: number;
  data: string;
  depositado: number;
  saldo: number;
  jurosBrutos: number;
  imposto: number;
  jurosLiquidos: number;
  custos: number;
}

export interface ResultadoSimulacao {
  produto: Produto;
  serie: PontoMensal[];
  capitalInicial: number;
  totalReforcos: number;
  jurosBrutos: number;
  imposto: number;
  jurosLiquidos: number;
  /** Juros que se perdem por o horizonte terminar a meio de um período (regras de mobilização antecipada). */
  jurosPerdidos: number;
  custos: number;
  /** Saldo no produto + juros pagos fora dele − custos. */
  capitalFinal: number;
  ganhoLiquido: number;
  /** Ganho líquido anualizado sobre o capital médio aplicado. */
  rentabilidadeLiquida: number;
  elegivel: boolean;
  avisos: string[];
  pressupostos: string[];
}

function datasPagamento(p: Produto, inicio: string, fim: string): Set<string> {
  const out = new Set<string>();
  const j = p.juros;
  if (j.periodicidade === 'vencimento' || j.periodicidade === 'diaria') return out;
  if (j.datasPagamento) {
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      const [, m, dia] = d.split('-').map(Number);
      if (j.datasPagamento.meses.includes(m) && dia === Math.min(j.datasPagamento.dia, diasNoMes(Number(d.slice(0, 4)), m)) && d > inicio) out.add(d);
    }
    return out;
  }
  // Sem data fixa: assume aniversários a partir da abertura.
  const passo = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[j.periodicidade];
  const dia = Number(inicio.slice(8, 10));
  for (let k = 1; ; k++) {
    const d = somarMeses(inicio, k * passo, dia);
    if (d > fim) break;
    out.add(d);
  }
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function simular(p: Produto, prm: ParametrosSimulacao): ResultadoSimulacao {
  const avisos: string[] = [];
  const pressupostos: string[] = [];
  const base = p.juros.baseDias ?? 365;
  if (p.juros.baseDias == null) pressupostos.push('Base de cálculo não indicada na fonte: assumido ano de 365 dias.');
  pressupostos.push(`Imposto sobre juros: ${prm.taxaImposto.toString().replace('.', ',')} % (configurável nas Definições).`);
  const nivel = nivelAplicavel(p, prm.requisitosCumpridos);
  const elegivel = p.requisitosAcesso.every((r) => r === 'conta-ordem-banco' || r === 'maior-idade' || prm.requisitosCumpridos.includes(r));
  if (!elegivel) avisos.push('Não indicaste cumprir todas as condições de acesso a este produto.');
  if (nivel && nivel.requisitos.length) pressupostos.push(`Taxa aplicada: ${nivel.nome} (indicaste cumprir as condições).`);
  else if (p.niveis.some((n) => n.requisitos.length)) pressupostos.push('Não indicaste cumprir as condições da taxa bonificada: usada a taxa base.');
  const capitaliza = p.juros.capitaliza === 'opcional' ? prm.capitalizarOpcional : p.juros.capitaliza === true;
  if (p.juros.capitaliza === 'opcional') pressupostos.push(capitaliza ? 'Juros capitalizados (opção do produto).' : 'Juros pagos na conta à ordem (opção do produto).');
  if (p.juros.capitaliza === null) pressupostos.push('Capitalização não indicada: assumido que os juros não são capitalizados.');
  if (p.juros.periodicidade !== 'vencimento' && !p.juros.datasPagamento) pressupostos.push('Data exata de pagamento não indicada: assumidos aniversários da data de abertura.');

  const fim = somarMeses(prm.dataAbertura, prm.meses);
  const pagamentos = datasPagamento(p, prm.dataAbertura, fim);
  // Prazo (depósitos a prazo)
  const prazoMeses = p.prazo?.meses ?? null;
  const prazoDias = p.prazo?.dias ?? null;
  const fimPrazo = (n: number) => (prazoMeses ? somarMeses(prm.dataAbertura, prazoMeses * n) : prazoDias ? somarDias(prm.dataAbertura, prazoDias * n) : null);
  const fimPromo = p.promocao?.meses ? somarMeses(prm.dataAbertura, p.promocao.meses) : p.promocao?.fim ?? null;
  if (p.promocao) pressupostos.push(`Taxa promocional até ${fimPromo ?? 'data não indicada'}; depois: ${nivel ? nivel.nome : 'taxa não disponível na fonte — simulada como 0 %'}.`);
  if (!nivel && !p.promocao) avisos.push('Nenhuma taxa aplicável disponível para as condições indicadas.');

  if (p.montantes.abertura != null && prm.capitalInicial < p.montantes.abertura) avisos.push(`Montante mínimo de abertura: ${p.montantes.abertura} €.`);
  if (p.reforcos.permite === false && (prm.reforcoMensal > 0 || prm.reforcosExtra.length)) avisos.push('Este produto não aceita reforços: foram ignorados.');
  if (p.reforcos.permite === null && prm.reforcoMensal > 0) pressupostos.push('Possibilidade de reforços não confirmada na fonte: considerados.');
  if (p.reforcos.minimo != null && prm.reforcoMensal > 0 && prm.reforcoMensal < p.reforcos.minimo) avisos.push(`Reforço mínimo do produto: ${p.reforcos.minimo} €.`);

  const custoMensal = (p.custos.manutencaoMensal ?? 0) + (prm.incluirCustoContaOrdem ? p.custos.custoContaOrdemMensal ?? 0 : 0);
  if (prm.incluirCustoContaOrdem && p.custos.contaOrdemObrigatoria && p.custos.custoContaOrdemMensal == null) pressupostos.push('Custo da conta à ordem obrigatória não disponível: não incluído.');
  if (p.custos.manutencaoMensal == null) pressupostos.push('Comissões da conta não confirmadas: consideradas 0 €.');

  let saldo = prm.capitalInicial;
  let depositado = prm.capitalInicial;
  let totalReforcos = 0;
  let acumulado = 0; // juro bruto corrido desde o último pagamento
  let fora = 0; // juros líquidos pagos na conta à ordem
  let bruto = 0;
  let imposto = 0;
  let custos = 0;
  let somaSaldos = 0;
  let dias = 0;
  let renovacoes = 0;
  let diasDesdePagamento = 0;
  const serie: PontoMensal[] = [{ mes: 0, data: prm.dataAbertura, depositado, saldo, jurosBrutos: 0, imposto: 0, jurosLiquidos: 0, custos: 0 }];
  let proximoMes = somarMeses(prm.dataAbertura, 1);
  let mesN = 1;
  const pagar = () => {
    const g = r2(acumulado);
    acumulado = 0;
    diasDesdePagamento = 0;
    if (g <= 0) return;
    const t = r2((g * prm.taxaImposto) / 100);
    bruto += g;
    imposto += t;
    if (capitaliza) saldo += g - t;
    else fora += g - t;
  };

  for (let d = prm.dataAbertura; d < fim; d = somarDias(d, 1)) {
    // Reforços (no dia escolhido de cada mês, exceto o da abertura)
    const diaMes = Number(d.slice(8, 10));
    const alvo = Math.min(prm.diaReforco, diasNoMes(Number(d.slice(0, 4)), Number(d.slice(5, 7))));
    if (d > prm.dataAbertura && diaMes === alvo && prm.reforcoMensal > 0 && p.reforcos.permite !== false) {
      let v = prm.reforcoMensal;
      if (p.montantes.maximo != null) v = Math.max(0, Math.min(v, p.montantes.maximo - saldo));
      saldo += v;
      depositado += v;
      totalReforcos += v;
    }
    for (const x of prm.reforcosExtra) {
      if (x.data === d && p.reforcos.permite !== false) {
        saldo += x.valor;
        depositado += x.valor;
        totalReforcos += x.valor;
      }
    }
    // Taxa do dia
    let escaloes: Escalao[] = nivel?.escaloes ?? [];
    let maxRem = p.montantes.maximoRemunerado;
    if (p.promocao && fimPromo && d < fimPromo) {
      escaloes = p.promocao.escaloes;
      maxRem = p.promocao.escaloes.reduce<number | null>((m, e) => (e.ate == null ? m : Math.max(m ?? 0, e.ate)), maxRem);
    }
    if (p.prazo) {
      const f1 = fimPrazo(renovacoes + 1);
      if (f1 && d >= f1) {
        // Vencimento: pagamento dos juros e eventual renovação
        if (p.juros.periodicidade === 'vencimento') pagar();
        renovacoes++;
        if (p.prazo.renovacao === 'unica' && renovacoes === 1) pressupostos.push(`Renovação única à TANB de ${String(p.prazo.tanbRenovacao ?? 0).replace('.', ',')} %.`);
        if (p.prazo.renovacao === 'automatica' && renovacoes === 1 && p.regimeTaxa?.includes('preçário')) pressupostos.push('Na renovação a taxa depende do preçário em vigor: simulada com a taxa atual (pode mudar).');
      }
      if (renovacoes >= 1 && p.prazo.renovacao === 'unica') escaloes = renovacoes === 1 ? [{ de: 0, ate: null, tanb: p.prazo.tanbRenovacao ?? 0 }] : [];
      if (renovacoes >= 1 && p.prazo.renovacao === 'nao') escaloes = [];
    }
    acumulado += juroDiario(escaloes, p.modoEscalao, saldo, maxRem, base);
    diasDesdePagamento++;
    somaSaldos += saldo;
    dias++;
    const amanha = somarDias(d, 1);
    if (pagamentos.has(amanha)) pagar();
    if (amanha >= proximoMes || amanha >= fim) {
      if (amanha >= proximoMes) {
        custos += custoMensal;
      }
      serie.push({ mes: mesN, data: amanha, depositado, saldo: r2(saldo + acumulado), jurosBrutos: r2(bruto + acumulado), imposto: r2(imposto), jurosLiquidos: r2(bruto - imposto), custos: r2(custos) });
      mesN++;
      proximoMes = somarMeses(prm.dataAbertura, mesN);
    }
  }
  // Se o horizonte termina exatamente num vencimento, os juros desse prazo são pagos.
  if (p.prazo && fimPrazo(renovacoes + 1) === fim) {
    if (p.juros.periodicidade === 'vencimento') pagar();
    renovacoes++;
  }
  // Fim do horizonte = levantamento do dinheiro: os juros corridos são pagos ou perdidos conforme a regra de mobilização.
  let perdidos = 0;
  if (acumulado > 0.004 && p.mobilizacao.perdaJuros !== 'nenhuma') {
    const terminaNoVencimento = diasDesdePagamento === 0;
    if (!terminaNoVencimento) {
      perdidos = p.mobilizacao.perdaJuros === 'ate-30-dias' ? r2(Math.min(acumulado, (acumulado / Math.max(1, diasDesdePagamento)) * 30)) : r2(acumulado);
      acumulado = Math.max(0, acumulado - perdidos);
      avisos.push(`Ao levantar no fim do horizonte perdem-se ${perdidos.toFixed(2).replace('.', ',')} € de juros brutos (regra de mobilização antecipada).`);
    }
  }
  pagar();
  const capitalFinal = r2(saldo + fora - custos);
  const ganhoLiquido = r2(bruto - imposto - custos);
  const medio = dias ? somaSaldos / dias : 0;
  const ultimo = serie[serie.length - 1];
  serie[serie.length - 1] = { ...ultimo, saldo: r2(saldo), jurosBrutos: r2(bruto), imposto: r2(imposto), jurosLiquidos: r2(bruto - imposto), custos: r2(custos) };
  return {
    produto: p,
    serie,
    capitalInicial: prm.capitalInicial,
    totalReforcos,
    jurosBrutos: r2(bruto),
    imposto: r2(imposto),
    jurosLiquidos: r2(bruto - imposto),
    jurosPerdidos: perdidos,
    custos: r2(custos),
    capitalFinal,
    ganhoLiquido,
    rentabilidadeLiquida: medio > 0 && dias > 0 ? (ganhoLiquido / medio) * (365 / dias) : 0,
    elegivel,
    avisos,
    pressupostos,
  };
}

// ---------- Ranking personalizado (Módulo 14) ----------

export interface PerfilComparacao {
  capital: number;
  reforcoMensal: number;
  meses: number;
  requisitosCumpridos: string[];
  instituicoesCliente: string[];
  liquidez: 'imediata' | 'curta' | 'indiferente';
  semComissoes: boolean;
  taxaImposto: number;
  incluirCustoContaOrdem: boolean;
}

export interface LinhaRanking {
  resultado: ResultadoSimulacao;
  excluido: string | null;
  fatores: string[];
}

export function liquidezImediata(p: Produto): boolean {
  return p.mobilizacao.tipo === 'livre' && p.mobilizacao.perdaJuros === 'nenhuma' && !p.mobilizacao.preAvisoDias;
}

export function rankingPersonalizado(produtos: Produto[], perfil: PerfilComparacao, hojeIso: string): LinhaRanking[] {
  const linhas = produtos
    .filter((p) => p.estado === 'comercializado')
    .map((p): LinhaRanking => {
      const r = simular(p, {
        capitalInicial: perfil.capital,
        reforcoMensal: perfil.reforcoMensal,
        diaReforco: 1,
        reforcosExtra: [],
        meses: perfil.meses,
        dataAbertura: hojeIso,
        requisitosCumpridos: perfil.requisitosCumpridos,
        taxaImposto: perfil.taxaImposto,
        incluirCustoContaOrdem: perfil.incluirCustoContaOrdem,
        capitalizarOpcional: true,
      });
      let excluido: string | null = null;
      if (p.novosClientes && perfil.instituicoesCliente.includes(p.instituicaoId)) excluido = 'Só para novos clientes e já és cliente.';
      else if (!r.elegivel) excluido = 'Condições de acesso não cumpridas.';
      else if (p.montantes.abertura != null && perfil.capital < p.montantes.abertura) excluido = `Exige pelo menos ${p.montantes.abertura.toLocaleString('pt-PT')} €.`;
      else if (perfil.liquidez === 'imediata' && !liquidezImediata(p)) excluido = 'Não permite levantar sem perder juros.';
      else if (perfil.semComissoes && ((p.custos.manutencaoMensal ?? 0) > 0 || (p.custos.custoContaOrdemMensal ?? 0) > 0)) excluido = 'Tem comissões associadas.';
      else if (perfil.reforcoMensal > 0 && p.reforcos.permite === false) excluido = 'Não aceita reforços.';
      const fatores: string[] = [];
      const n = nivelAplicavel(p, perfil.requisitosCumpridos);
      if (p.promocao) fatores.push(`Taxa promocional de ${String(p.promocao.escaloes[0]?.tanb ?? 0).replace('.', ',')} % só nos primeiros ${p.promocao.meses ?? '?'} meses`);
      if (n) fatores.push(`TANB aplicável: ${String(taxaPara(n.escaloes, perfil.capital)).replace('.', ',')} % (${n.nome})`);
      if (p.montantes.maximoRemunerado != null) fatores.push(`Só remunera até ${p.montantes.maximoRemunerado.toLocaleString('pt-PT')} €`);
      fatores.push(liquidezImediata(p) ? 'Levantamento sem penalização' : `Liquidez: ${p.mobilizacao.descricao}`);
      if (r.custos > 0) fatores.push(`Custos de ${r.custos.toFixed(2).replace('.', ',')} € no período`);
      if (r.jurosPerdidos > 0) fatores.push('Horizonte termina a meio do prazo (perde juros)');
      if (p.garantia && p.garantia.pais !== 'Portugal') fatores.push(`Garantia de depósitos de ${p.garantia.pais}`);
      return { resultado: r, excluido, fatores };
    });
  return linhas.sort((a, b) => (a.excluido ? 1 : 0) - (b.excluido ? 1 : 0) || b.resultado.capitalFinal - a.resultado.capitalFinal);
}

/** Produtos adequados ao fundo de emergência: liquidez imediata, sem penalizações nem imobilização, capital garantido. */
export function adequadoFundo(p: Produto): { adequado: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (!liquidezImediata(p)) motivos.push('Levantamento com perda de juros ou condicionado');
  if (p.tipo === 'deposito-prazo' && p.mobilizacao.tipo !== 'livre') motivos.push('Depósito a prazo não mobilizável sem penalização');
  if (!p.garantia) motivos.push('Sem garantia de depósitos identificada');
  return { adequado: motivos.length === 0, motivos };
}

// ---------- Deteção de alterações (Módulos 10 e 16) ----------

/** Assinatura das condições relevantes de um produto (taxas, promoção, limites, mobilização, custos, requisitos). */
export function assinatura(p: Produto): string {
  return JSON.stringify({
    n: p.niveis.map((x) => [x.requisitos, x.escaloes]),
    pr: p.promocao && [p.promocao.escaloes, p.promocao.meses, p.promocao.fim],
    m: p.montantes,
    mo: [p.mobilizacao.tipo, p.mobilizacao.perdaJuros, p.mobilizacao.preAvisoDias],
    c: [p.custos.manutencaoMensal, p.custos.custoContaOrdemMensal, p.custos.abertura, p.custos.encerramento],
    r: p.requisitosAcesso,
    e: p.estado,
  });
}

export interface Alteracao {
  produtoId: string;
  texto: string;
  /** Diferença estimada na remuneração anual líquida (positiva = ganhas mais). */
  impacto: number | null;
}

/** Compara a base atual com a assinatura guardada da última consulta. */
export function detetarAlteracoes(
  produtos: Produto[],
  anterior: Record<string, string>,
  contasLigadas: { produtoId: string; saldo: number; nome: string }[],
  cumpridos: string[],
  taxaImposto: number,
  hojeIso: string,
): Alteracao[] {
  if (!Object.keys(anterior).length) return [];
  const out: Alteracao[] = [];
  for (const p of produtos) {
    const antes = anterior[p.id];
    if (!antes) {
      out.push({ produtoId: p.id, texto: `Novo produto na base: ${p.nome}.`, impacto: null });
      continue;
    }
    if (antes === assinatura(p)) continue;
    const a = JSON.parse(antes);
    const ligada = contasLigadas.find((c) => c.produtoId === p.id);
    const tanbAntes: number | null = (() => {
      const niveis = a.n as [string[], Escalao[]][];
      const nivel = niveis.find(([req]) => !req.length || req.some((r) => cumpridos.includes(r)));
      return nivel ? taxaPara(nivel[1], ligada?.saldo ?? 1000) : null;
    })();
    const tanbDepois = tanbPermanente(p, cumpridos, ligada?.saldo ?? 1000);
    const partes: string[] = [];
    if (tanbAntes != null && tanbDepois != null && Math.abs(tanbAntes - tanbDepois) > 1e-9)
      partes.push(`a TANB ${tanbDepois < tanbAntes ? 'desceu' : 'subiu'} de ${String(tanbAntes).replace('.', ',')} % para ${String(tanbDepois).replace('.', ',')} %`);
    if (JSON.stringify(a.m) !== JSON.stringify(p.montantes)) partes.push('os limites de capital mudaram');
    if (JSON.stringify(a.mo) !== JSON.stringify([p.mobilizacao.tipo, p.mobilizacao.perdaJuros, p.mobilizacao.preAvisoDias])) partes.push('as condições de mobilização mudaram');
    if (JSON.stringify(a.c) !== JSON.stringify([p.custos.manutencaoMensal, p.custos.custoContaOrdemMensal, p.custos.abertura, p.custos.encerramento])) partes.push('as comissões mudaram');
    if (JSON.stringify(a.r) !== JSON.stringify(p.requisitosAcesso)) partes.push('as condições de elegibilidade mudaram');
    if (JSON.stringify(a.pr) !== JSON.stringify(p.promocao && [p.promocao.escaloes, p.promocao.meses, p.promocao.fim])) partes.push(p.promocao ? 'a campanha promocional mudou' : 'a campanha promocional terminou');
    if (a.e !== p.estado) partes.push(`o estado passou a "${p.estado}"`);
    if (!partes.length) partes.push('as condições foram atualizadas');
    let impacto: number | null = null;
    if (ligada && tanbAntes != null && tanbDepois != null) {
      const base = Math.min(ligada.saldo, p.montantes.maximoRemunerado ?? ligada.saldo);
      impacto = Math.round(base * ((tanbDepois - tanbAntes) / 100) * (1 - taxaImposto / 100) * 100) / 100;
    }
    out.push({ produtoId: p.id, texto: `${p.nome}${ligada ? ` (a tua conta ${ligada.nome})` : ''}: ${partes.join(', ')}.`, impacto });
  }
  // Campanhas que terminaram por data
  for (const p of produtos) if (p.promocao?.fim && p.promocao.fim < hojeIso) out.push({ produtoId: p.id, texto: `A campanha de ${p.nome} terminou a ${p.promocao.fim}.`, impacto: null });
  return out;
}

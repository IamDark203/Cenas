import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, estadoVazio } from './dadosIniciais';
import { hoje } from './datas';
import { saldoConta } from './saldos';
import type { Estado } from './tipos';

type Obj = Record<string, unknown>;

const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function lista<T>(v: unknown, base: (x: Obj) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    if (!ehObj(x) || typeof x.id !== 'string') continue;
    const r = base(x);
    if (r) out.push(r);
  }
  return out;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown, d = ''): string => (typeof v === 'string' ? v.slice(0, 2000) : d);
const dataIso = (v: unknown, d: string): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);

/**
 * Valida dados vindos do armazenamento ou de um ficheiro importado e completa campos em falta.
 * Lança um erro se o ficheiro não for uma cópia desta aplicação.
 */
export function normalizarEstado(dados: unknown): Estado {
  if (!ehObj(dados) || dados.versao !== 1 || !Array.isArray(dados.contas)) {
    throw new Error('O ficheiro não é uma cópia de segurança desta aplicação.');
  }
  const base = estadoVazio(dataIso(dados.criadoEm, estadoVazio().criadoEm));
  const d = dados as Obj;
  const estado: Estado = {
    ...base,
    perfil: { ...base.perfil, ...(ehObj(d.perfil) ? (d.perfil as object) : {}) },
    contas: lista(d.contas, (x) => ({
      ...(x as object),
      nome: txt(x.nome, 'Conta'),
      saldoInicial: num(x.saldoInicial),
      dataSaldoInicial: dataIso(x.dataSaldoInicial, base.criadoEm),
      tanb: numOuNull(x.tanb),
      tanl: numOuNull(x.tanl),
      limiteRemunerado: numOuNull(x.limiteRemunerado),
      fundoEmergencia: x.fundoEmergencia === true,
      arquivada: x.arquivada === true,
      paraGastos: typeof x.paraGastos === 'boolean' ? x.paraGastos : x.tipo === 'ordem',
      politicaJuros: ['nao-atribuido', 'proporcional', 'destino'].includes(x.politicaJuros as string) ? x.politicaJuros : 'nao-atribuido',
      jurosDestino: typeof x.jurosDestino === 'string' ? x.jurosDestino : null,
      produtoId: typeof x.produtoId === 'string' ? x.produtoId : null,
    })) as Estado['contas'],
    categorias: lista(d.categorias, (x) => ({ ...(x as object), nome: txt(x.nome, 'Categoria'), orcamento: numOuNull(x.orcamento) })) as Estado['categorias'],
    movimentos: lista(d.movimentos, (x) =>
      typeof x.contaId === 'string' ? { ...(x as object), valor: num(x.valor), data: dataIso(x.data, base.criadoEm) } : null,
    ) as Estado['movimentos'],
    recorrentes: lista(d.recorrentes, (x) =>
      typeof x.contaId === 'string' ? { ...(x as object), valor: num(x.valor), inicio: dataIso(x.inicio, base.criadoEm) } : null,
    ) as Estado['recorrentes'],
    objetivos: lista(d.objetivos, (x) => ({
      ...(x as object),
      valorAlvo: num(x.valorAlvo),
      reforcoMensal: num(x.reforcoMensal),
      valorInicial: num(x.valorInicial),
      contribuicoes: lista(x.contribuicoes, (c) => ({ ...(c as object), valor: num(c.valor) })),
    })) as Estado['objetivos'],
    ativos: lista(d.ativos, (x) => ({
      ...(x as object),
      precos: Array.isArray(x.precos) ? (x.precos as Obj[]).filter((p) => ehObj(p) && Number.isFinite(p.preco)) : [],
    })) as Estado['ativos'],
    operacoes: lista(d.operacoes, (x) => ({
      ...(x as object),
      quantidade: num(x.quantidade),
      preco: num(x.preco),
      comissao: num(x.comissao),
    })) as Estado['operacoes'],
    alocacaoAlvo: { ...base.alocacaoAlvo, ...(ehObj(d.alocacaoAlvo) ? (d.alocacaoAlvo as object) : {}) },
    fundo: { ...base.fundo, ...(ehObj(d.fundo) ? (d.fundo as object) : {}) },
    cenarios: lista(d.cenarios, (x) => x as never),
    alertas: { ...base.alertas, ...(ehObj(d.alertas) ? (d.alertas as object) : {}) },
    alocacoes: lista(d.alocacoes, (x) =>
      typeof x.contaId === 'string'
        ? { ...(x as object), nome: txt(x.nome, 'Alocação'), valor: Math.max(0, num(x.valor)), historico: Array.isArray(x.historico) ? x.historico : [] }
        : null,
    ) as Estado['alocacoes'],
    prioridades: Array.isArray(d.prioridades) && d.prioridades.length === 4 ? (d.prioridades as Estado['prioridades']) : base.prioridades,
    planoMensal: { ...base.planoMensal, ...(ehObj(d.planoMensal) ? (d.planoMensal as object) : {}) },
    refeicao: { ...base.refeicao, ...(ehObj(d.refeicao) ? (d.refeicao as object) : {}) },
    bancos: { ...base.bancos, ...(ehObj(d.bancos) ? (d.bancos as object) : {}) },
    alertasDispensados: Array.isArray(d.alertasDispensados) ? (d.alertasDispensados as unknown[]).filter((s): s is string => typeof s === 'string') : [],
    pressupostos: {
      ...base.pressupostos,
      ...(ehObj(d.pressupostos) ? (d.pressupostos as object) : {}),
    } as Estado['pressupostos'],
  };
  const p = ehObj(d.pressupostos) ? (d.pressupostos as Obj) : {};
  estado.pressupostos.dca = { ...base.pressupostos.dca, ...(ehObj(p.dca) ? (p.dca as object) : {}) } as Estado['pressupostos']['dca'];
  estado.pressupostos.projecao = { ...base.pressupostos.projecao, ...(ehObj(p.projecao) ? (p.projecao as object) : {}) };
  estado.pressupostos.cotacoes = { ...base.pressupostos.cotacoes, ...(ehObj(p.cotacoes) ? (p.cotacoes as object) : {}) };
  return migrar(estado, d);
}

/** Converte dados de versões anteriores da aplicação para o modelo atual, sem perder informação. */
function migrar(estado: Estado, d: Obj): Estado {
  // Categorias novas e marcação essencial/lazer das categorias predefinidas.
  const ids = new Set(estado.categorias.map((c) => c.id));
  for (const [id, nome, , t] of CATEGORIAS_DESPESA) {
    if (!ids.has(id)) estado.categorias.push({ id, nome, tipo: 'despesa', orcamento: null, essencial: t === 'e', lazer: t === 'l' });
  }
  for (const [id, nome] of CATEGORIAS_RECEITA) if (!ids.has(id)) estado.categorias.push({ id, nome, tipo: 'receita', orcamento: null });
  const marcacao = new Map(CATEGORIAS_DESPESA.map(([id, , , t]) => [id, t]));
  estado.categorias = estado.categorias.map((c) =>
    c.tipo === 'despesa' && c.essencial === undefined && c.lazer === undefined
      ? { ...c, essencial: marcacao.get(c.id) === 'e', lazer: marcacao.get(c.id) === 'l' }
      : c,
  );
  // Fundo: o "objetivo manual" antigo passa a ser o mínimo protegido.
  if (estado.fundo.minimoProtegido === undefined) {
    estado.fundo = { ...estado.fundo, minimoProtegido: estado.fundo.objetivoManual ?? null, objetivoManual: null };
  }
  if (estado.fundo.modo === undefined) estado.fundo = { ...estado.fundo, modo: 'automatico', usarSugestao: false };
  // Contas marcadas como fundo de emergência passam a ter uma alocação igual ao saldo atual.
  if (!Array.isArray(d.alocacoes)) {
    const data = hoje();
    for (const c of estado.contas) {
      if (!c.fundoEmergencia) continue;
      const saldo = saldoConta(estado, c, data);
      if (saldo > 0) {
        estado.alocacoes.push({
          id: `aloc-fundo-${c.id}`,
          contaId: c.id,
          nome: 'Fundo de emergência',
          tipo: 'fundo',
          valor: saldo,
          historico: [{ data, delta: saldo, motivo: 'Migração: a conta estava marcada como fundo de emergência' }],
        });
      }
    }
    estado.contas = estado.contas.map((c) => ({ ...c, fundoEmergencia: false }));
  }
  // Liga a conta poupança do Banco CTT ao produto do comparador (se ainda não estiver ligada).
  estado.contas = estado.contas.map((c) =>
    !c.produtoId && c.tipo === 'poupanca' && /ctt/i.test(c.instituicao) && /poupan/i.test(c.nome) ? { ...c, produtoId: 'ctt-conta-poupanca-livre' } : c,
  );
  return estado;
}

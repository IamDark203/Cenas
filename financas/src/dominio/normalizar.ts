import { estadoVazio } from './dadosIniciais';
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
  return estado;
}

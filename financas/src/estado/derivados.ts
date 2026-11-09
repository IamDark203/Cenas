import { useMemo } from 'react';
import { calcularAlertas } from '../dominio/alertas';
import { mesDe } from '../dominio/datas';
import { estimativaRecorrente, fluxoMes } from '../dominio/fluxos';
import { composicao } from '../dominio/saldos';
import type { Estado, MeioPagamento, TipoConta } from '../dominio/tipos';
import { useLoja } from './loja';

/** Valores calculados usados em vários ecrãs. */
export function useResumo() {
  const { estado, hoje } = useLoja();
  return useMemo(() => {
    const mesRef = estado.perfil.mesReferencia ?? mesDe(hoje);
    const alertas = calcularAlertas(estado, hoje).filter((a) => !estado.alertasDispensados.includes(a.id));
    return {
      mesRef,
      atual: composicao(estado, hoje),
      fluxo: fluxoMes(estado, mesRef),
      estimativa: estimativaRecorrente(estado),
      alertas,
    };
  }, [estado, hoje]);
}

export const NOMES_MEIO: Record<MeioPagamento, string> = {
  debito: 'Débito / transferência',
  cartao: 'Cartão bancário',
  refeicao: 'Cartão-refeição',
  numerario: 'Numerário',
};

export function opcoesContas(estado: Estado, tipos?: TipoConta[]) {
  return estado.contas
    .filter((c) => !c.arquivada && (!tipos || tipos.includes(c.tipo)))
    .map((c) => ({ valor: c.id, nome: c.instituicao ? `${c.nome} · ${c.instituicao}` : c.nome }));
}

export function opcoesCategorias(estado: Estado, tipo: 'receita' | 'despesa') {
  return estado.categorias.filter((c) => c.tipo === tipo).map((c) => ({ valor: c.id, nome: c.nome }));
}

export function nomeConta(estado: Estado, id: string | null): string {
  const c = estado.contas.find((x) => x.id === id);
  return c ? c.nome : '—';
}

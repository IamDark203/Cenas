import { nomeCategoria } from '../dominio/fluxos';
import { NOMES_TIPO_CONTA, saldoConta } from '../dominio/saldos';
import { resumoCarteira, NOMES_CATEGORIA_ATIVO } from '../dominio/investimentos';
import type { Estado, Movimento } from '../dominio/tipos';
import { NOMES_MEIO, nomeConta } from '../estado/derivados';
import type { Celula } from './xlsx';

/** Entrega um ficheiro: folha de partilha no telemóvel (Guardar em Ficheiros), transferência no computador. */
export async function entregarFicheiro(nome: string, conteudo: Blob): Promise<'partilhado' | 'transferido' | 'cancelado'> {
  const ficheiro = typeof File === 'function' ? new File([conteudo], nome, { type: conteudo.type }) : null;
  const telemovel = window.matchMedia('(pointer: coarse)').matches;
  if (telemovel && ficheiro && navigator.canShare?.({ files: [ficheiro] })) {
    try {
      await navigator.share({ files: [ficheiro], title: nome });
      return 'partilhado';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'transferido';
}

const NOMES_TIPO_MOV = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência', ajuste: 'Correção de saldo' };

/** Linhas de movimentos para exportação (datas ISO, valores numéricos). */
export function linhasMovimentos(estado: Estado, movimentos: Movimento[]): Celula[][] {
  const refeicao = new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
  const cab: Celula[] = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Conta de destino', 'Meio de pagamento', 'Fixa/variável', 'Valor (€)', 'Benefício (cartão-refeição)', 'Observações'];
  const linhas = [...movimentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((m): Celula[] => [
      { data: m.data },
      NOMES_TIPO_MOV[m.tipo],
      m.descricao,
      m.tipo === 'transferencia' || m.tipo === 'ajuste' ? '' : nomeCategoria(estado, m.categoriaId),
      nomeConta(estado, m.contaId),
      m.contaDestinoId ? nomeConta(estado, m.contaDestinoId) : '',
      m.meio ? NOMES_MEIO[m.meio] : '',
      m.tipo === 'despesa' ? (m.fixa ? 'Fixa' : 'Variável') : '',
      { euro: m.tipo === 'despesa' ? -m.valor : m.valor },
      refeicao.has(m.contaId) ? 'Sim' : 'Não',
      m.notas,
    ]);
  return [cab, ...linhas];
}

export function linhasContas(estado: Estado, hojeIso: string): Celula[][] {
  return [
    ['Conta', 'Instituição', 'Tipo', 'Saldo atual (€)', 'TANB (%)', 'TANL (%)', 'Capital remunerado até (€)', 'Fundo de emergência', 'Condições'],
    ...estado.contas.map((c): Celula[] => [
      c.nome,
      c.instituicao,
      NOMES_TIPO_CONTA[c.tipo],
      { euro: saldoConta(estado, c, hojeIso) },
      c.tanb ?? '',
      c.tanl ?? '',
      c.limiteRemunerado != null ? { euro: c.limiteRemunerado } : '',
      c.fundoEmergencia ? 'Sim' : 'Não',
      c.condicoes,
    ]),
  ];
}

export function linhasInvestimentos(estado: Estado): Celula[][] {
  const r = resumoCarteira(estado);
  return [
    ['Ativo', 'Identificador', 'Categoria', 'Unidades', 'Preço médio (€)', 'Capital investido (€)', 'Cotação (€)', 'Valor de mercado (€)', 'Ganho/perda (€)', 'Rentabilidade (%)'],
    ...r.linhas.map((l): Celula[] => [
      l.ativo.nome,
      l.ativo.identificador,
      NOMES_CATEGORIA_ATIVO[l.ativo.categoria],
      l.posicao.quantidade,
      { euro: l.posicao.precoMedio },
      { euro: l.posicao.custo },
      l.cotacao ? { euro: l.cotacao.preco } : '',
      { euro: l.valor },
      { euro: l.ganho },
      Math.round(l.rentabilidade * 10000) / 100,
    ]),
  ];
}

/** CSV com ponto e vírgula e vírgula decimal (abre corretamente no Excel em português). */
export function paraCsv(linhas: Celula[][]): Blob {
  const txt = linhas
    .map((l) =>
      l
        .map((c) => {
          let v: string;
          if (c == null) v = '';
          else if (typeof c === 'number') v = String(c).replace('.', ',');
          else if (typeof c === 'object' && 'euro' in c) v = c.euro.toFixed(2).replace('.', ',');
          else if (typeof c === 'object' && 'data' in c) v = c.data.split('-').reverse().join('/');
          else v = String(c);
          return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(';'),
    )
    .join('\r\n');
  return new Blob([`﻿${txt}`], { type: 'text/csv;charset=utf-8' });
}

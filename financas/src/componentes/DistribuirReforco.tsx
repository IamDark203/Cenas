import { useMemo, useState } from 'react';
import { alocacoesConta, definirAlocacao, reforcarFundo } from '../dominio/alocacoes';
import { euro } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { NOMES_DESTINO, sugerirDistribuicao, type LinhaDistribuicao } from '../dominio/orcamento';
import { saldoConta } from '../dominio/saldos';
import type { DestinoReforco, Estado } from '../dominio/tipos';
import { nomeConta, opcoesContas } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { CampoCaixa, CampoEscolha, CampoNumero } from './campos';
import { Modal, useInteracoes } from './janelas';
import { Aviso, NotaSimulacao } from './ui';

/**
 * Propõe como distribuir um novo valor (rendimento ou reforço) pelas prioridades configuradas.
 * O utilizador pode aceitar, alterar ou rejeitar. Só as alocações são atualizadas após confirmação;
 * transferências bancárias nunca são executadas (podem apenas ser registadas, se o utilizador quiser).
 */
export function DistribuirReforco({ aoFechar, valorInicial }: { aoFechar: () => void; valorInicial?: number }) {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const contas = opcoesContas(estado).filter((c) => estado.contas.find((x) => x.id === c.valor)?.tipo !== 'refeicao');
  const [valor, setValor] = useState<number | null>(valorInicial ?? null);
  const [origem, setOrigem] = useState(() => {
    // Por omissão, a conta com mais capital não atribuído.
    let melhor = contas[0]?.valor ?? '';
    let max = Number.NEGATIVE_INFINITY;
    for (const c of contas) {
      const conta = estado.contas.find((x) => x.id === c.valor);
      if (!conta) continue;
      const livre = alocacoesConta(estado, conta.id, saldoConta(estado, conta, hoje)).naoAtribuido;
      if (livre > max) [max, melhor] = [livre, conta.id];
    }
    return melhor;
  });
  const proposta = useMemo(() => sugerirDistribuicao(estado, valor ?? 0, hoje), [estado, valor, hoje]);
  const [ajustes, setAjustes] = useState<Record<string, number | null>>({});
  const [registarTransf, setRegistarTransf] = useState(false);
  const chave = (l: LinhaDistribuicao) => `${l.destino}:${l.objetivoId ?? ''}`;
  const linhas = proposta.map((l) => ({ ...l, valor: ajustes[chave(l)] ?? l.valor }));
  // Só conta o que é efetivamente alocado; o capital disponível é o que sobra.
  const total = linhas.filter((l) => l.destino !== 'disponivel').reduce((s, l) => s + (l.valor ?? 0), 0);
  const contaOrigem = estado.contas.find((c) => c.id === origem);
  const livreOrigem = contaOrigem ? alocacoesConta(estado, origem, saldoConta(estado, contaOrigem, hoje)).naoAtribuido : 0;

  // Quanto tem de caber no capital não atribuído de cada conta.
  const necessidade = new Map<string, number>();
  const avisos: string[] = [];
  for (const l of linhas) {
    if (!l.valor) continue;
    if (l.destino === 'fundo' || l.destino === 'investimentos') necessidade.set(origem, (necessidade.get(origem) ?? 0) + l.valor);
    if (l.destino === 'objetivos') {
      const o = estado.objetivos.find((x) => x.id === l.objetivoId);
      if (!o?.contaId) avisos.push(`"${l.nome}" não tem conta associada: a reserva fica registada no objetivo mas não numa conta.`);
      else if (o.contaId === origem || registarTransf) necessidade.set(origem, (necessidade.get(origem) ?? 0) + l.valor);
      else {
        necessidade.set(o.contaId, (necessidade.get(o.contaId) ?? 0) + l.valor);
        avisos.push(`"${l.nome}" está em ${nomeConta(estado, o.contaId)}: o dinheiro tem de estar (ou ser transferido) para lá.`);
      }
    }
  }
  const erros: string[] = [];
  if (total > (valor ?? 0) + 0.005) erros.push(`A distribuição (${euro(total)}) excede o valor a distribuir (${euro(valor ?? 0)}).`);
  for (const [contaId, v] of necessidade) {
    const c = estado.contas.find((x) => x.id === contaId);
    if (!c) continue;
    const livre = alocacoesConta(estado, contaId, saldoConta(estado, c, hoje)).naoAtribuido;
    if (v > livre + 0.005) erros.push(`${c.nome} só tem ${euro(livre)} não atribuídos (precisa de ${euro(v)}). Regista primeiro o rendimento ou a transferência que trouxe este dinheiro.`);
  }

  const aceitar = () => {
    if (erros.length) return;
    atualizar((e0) => {
      let e: Estado = e0;
      for (const l of linhas) {
        if (!l.valor || l.valor <= 0) continue;
        if (l.destino === 'fundo') e = reforcarFundo(e, origem, l.valor, hoje, 'Distribuição de reforço');
        if (l.destino === 'investimentos') {
          const a = e.alocacoes.find((x) => x.contaId === origem && x.tipo === 'investimento');
          e = definirAlocacao(e, { id: a?.id, contaId: origem, nome: a?.nome ?? 'Investimento por executar', tipo: 'investimento', valor: (a?.valor ?? 0) + l.valor }, hoje, 'Distribuição de reforço');
        }
        if (l.destino === 'objetivos') {
          const o = e.objetivos.find((x) => x.id === l.objetivoId);
          if (!o) continue;
          e = { ...e, objetivos: e.objetivos.map((x) => (x.id === o.id ? { ...x, contribuicoes: [...x.contribuicoes, { id: novoId(), data: hoje, valor: l.valor, notas: 'Distribuição de reforço' }] } : x)) };
          if (registarTransf && o.contaId && o.contaId !== origem)
            e = {
              ...e,
              movimentos: [
                ...e.movimentos,
                { id: novoId(), tipo: 'transferencia', data: hoje, valor: l.valor, descricao: `Reforço: ${o.nome}`, contaId: origem, contaDestinoId: o.contaId, categoriaId: null, meio: null, fixa: false, recorrenteId: null, valorBruto: null, notas: 'Registada a partir da distribuição de reforço' },
              ],
            };
        }
      }
      return e;
    });
    avisar('Distribuição aplicada às alocações. Nenhuma transferência bancária foi executada.');
    aoFechar();
  };

  const mover = (d: DestinoReforco, dir: -1 | 1) =>
    atualizar((e) => {
      const p = [...e.prioridades];
      const i = p.indexOf(d);
      const j = i + dir;
      if (j < 0 || j >= p.length) return e;
      [p[i], p[j]] = [p[j], p[i]];
      return { ...e, prioridades: p };
    });

  return (
    <Modal
      titulo="Distribuir um reforço"
      largo
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="esquerda" onClick={() => setAjustes({})}>
            Repor proposta
          </button>
          <button type="button" onClick={aoFechar}>
            Rejeitar
          </button>
          <button type="button" className="primario" disabled={!!erros.length || total <= 0} onClick={aceitar}>
            Aceitar distribuição
          </button>
        </>
      }
    >
      <div className="linha-campos">
        <CampoNumero rotulo="Valor a distribuir" valor={valor} mudar={(v) => (setValor(v), setAjustes({}))} />
        <CampoEscolha rotulo="Conta onde está o dinheiro" valor={origem} mudar={setOrigem} opcoes={contas} dica={`Não atribuído nesta conta: ${euro(livreOrigem)}`} />
      </div>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Destino</th>
              <th>Motivo</th>
              <th className="num" style={{ width: 150 }}>
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={chave(l)}>
                <td>
                  <strong>{l.nome}</strong>
                  {l.destino === 'objetivos' && <div className="mais-suave pequeno">Objetivo de poupança</div>}
                </td>
                <td className="suave pequeno">{l.motivo}</td>
                <td>
                  {l.destino === 'disponivel' ? (
                    <span className="num">{euro(Math.max(0, (valor ?? 0) - linhas.filter((x) => x.destino !== 'disponivel').reduce((s, x) => s + (x.valor ?? 0), 0)))}</span>
                  ) : (
                    <CampoNumero rotulo="" valor={l.valor} mudar={(v) => setAjustes({ ...ajustes, [chave(l)]: v })} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {avisos.length > 0 && <Aviso tom="info">{avisos.join(' ')}</Aviso>}
      {avisos.some((a) => a.includes('transferido')) && <CampoCaixa rotulo="Registar também as transferências necessárias (só o registo; não move dinheiro no banco)" valor={registarTransf} mudar={setRegistarTransf} />}
      {erros.map((e) => (
        <p key={e} className="negativo pequeno">
          {e}
        </p>
      ))}
      <details>
        <summary className="suave pequeno" style={{ cursor: 'pointer' }}>
          Ordem de prioridade
        </summary>
        <div className="lista" style={{ marginTop: 8 }}>
          {estado.prioridades.map((d, i) => (
            <div className="item" key={d} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
              <span className="avatar">{i + 1}</span>
              <span>{NOMES_DESTINO[d]}</span>
              <span className="acoes">
                <button type="button" className="pequeno" disabled={i === 0} onClick={() => mover(d, -1)} aria-label="Subir">
                  ↑
                </button>
                <button type="button" className="pequeno" disabled={i === estado.prioridades.length - 1} onClick={() => mover(d, 1)} aria-label="Descer">
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
      </details>
      <NotaSimulacao>Proposta calculada a partir das tuas prioridades. Ao aceitar, só as alocações e os objetivos são atualizados; nenhuma transferência bancária é executada.</NotaSimulacao>
    </Modal>
  );
}

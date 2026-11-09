import { useState } from 'react';
import { CampoCaixa, CampoNumero, CampoTexto, Segmentos } from '../componentes/campos';
import { GraficoSeries, useCores } from '../componentes/graficos';
import { Aviso, Barra, Cartao, Kpi, NotaSimulacao } from '../componentes/ui';
import { euro, numero, pct } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { despesaEssencialMensal, objetivoCalculadoFundo, resumoFundo, simularDesemprego } from '../dominio/planeamento';
import { equivalenteMensal } from '../dominio/recorrencias';
import type { FundoEmergenciaConfig } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

const meses1 = (n: number | null) => (n == null ? '—' : `${numero(Math.round(n * 10) / 10)} ${Math.abs(n - 1) < 0.05 ? 'mês' : 'meses'}`);

export default function Fundo() {
  const { estado, atualizar } = useLoja();
  const { atual } = useResumo();
  const c = useCores();
  const f = estado.fundo;
  const r = resumoFundo(estado, atual.fundoEmergencia);
  const mudar = (p: Partial<FundoEmergenciaConfig>) => atualizar((e) => ({ ...e, fundo: { ...e.fundo, ...p } }));
  const despesas = estado.recorrentes.filter((x) => x.tipo === 'despesa' && x.ativo);
  const contas = estado.contas.filter((x) => !x.arquivada && x.tipo !== 'refeicao');
  const [novaExtra, setNovaExtra] = useState({ nome: '', valor: 0 as number | null });

  // Simulação de perda de rendimento
  const [rendimentoRestante, setRendimentoRestante] = useState<number | null>(0);
  const [despesaSim, setDespesaSim] = useState<number | null>(null);
  const [incluirPoupancas, setIncluirPoupancas] = useState(false);
  const despesaUsada = despesaSim ?? r.essencial;
  const capitalSim = r.capital + (incluirPoupancas ? atual.poupancas : 0);
  const sim = simularDesemprego(capitalSim, despesaUsada, rendimentoRestante ?? 0);

  return (
    <>
      <Cartao titulo="Fundo de emergência" subtitulo="Reserva separada do dinheiro do dia a dia e dos investimentos.">
        <div className="kpis">
          <Kpi rotulo="Capital reservado" valor={euro(r.capital)} cor={c.serie[5]} />
          <Kpi rotulo="Objetivo" valor={euro(r.objetivo)} detalhe={f.objetivoManual != null ? 'Definido por ti' : `${f.meses} meses de despesas essenciais`} />
          <Kpi rotulo="Em falta" valor={euro(r.falta)} classeValor={r.falta > 0 ? '' : 'positivo'} />
          <Kpi rotulo="Meses cobertos" valor={meses1(r.mesesCobertos)} detalhe={`Despesas essenciais: ${euro(r.essencial)}/mês`} />
          <Kpi rotulo="Concretização" valor={pct(r.progresso)} />
          <Kpi rotulo="Tempo até ao objetivo" valor={r.mesesParaObjetivo === 0 ? 'Atingido' : r.mesesParaObjetivo == null ? '—' : meses1(r.mesesParaObjetivo)} detalhe={f.reforcoMensal > 0 ? `Com reforços de ${euro(f.reforcoMensal)}/mês` : 'Define um reforço mensal'} />
        </div>
        <Barra grande fracao={r.progresso} cor={r.progresso >= 1 ? c.positivo : c.serie[5]} />
        {r.essencial === 0 && <Aviso>Seleciona as despesas essenciais abaixo para calcular o objetivo e os meses cobertos.</Aviso>}
      </Cartao>

      <div className="grelha">
        <Cartao titulo="Objetivo" subtitulo="Quantos meses de despesas essenciais queres cobrir?">
          <Segmentos rotulo="Meses" valor={String(f.meses)} mudar={(v) => mudar({ meses: Number(v) })} opcoes={[3, 6, 9, 12].map((n) => ({ valor: String(n), nome: `${n} meses` }))} />
          <div className="linha-campos">
            <CampoNumero rotulo="Outro número de meses" sufixo="meses" valor={f.meses} min={1} max={60} mudar={(v) => v && v > 0 && mudar({ meses: v })} />
            <CampoNumero rotulo="Reforço mensal" valor={f.reforcoMensal} mudar={(v) => mudar({ reforcoMensal: v ?? 0 })} />
          </div>
          <CampoCaixa rotulo="Definir o objetivo manualmente" valor={f.objetivoManual != null} mudar={(v) => mudar({ objetivoManual: v ? Math.round(objetivoCalculadoFundo(estado)) : null })} dica={`Calculado: ${euro(objetivoCalculadoFundo(estado))}`} />
          {f.objetivoManual != null && <CampoNumero rotulo="Objetivo manual" valor={f.objetivoManual} mudar={(v) => mudar({ objetivoManual: v ?? 0 })} />}
        </Cartao>

        <Cartao titulo="Contas associadas" subtitulo="O saldo destas contas forma o fundo.">
          {contas.map((ct) => (
            <CampoCaixa
              key={ct.id}
              rotulo={`${ct.nome}${ct.instituicao ? ` · ${ct.instituicao}` : ''}`}
              valor={ct.fundoEmergencia}
              mudar={(v) => atualizar((e) => ({ ...e, contas: e.contas.map((x) => (x.id === ct.id ? { ...x, fundoEmergencia: v } : x)) }))}
            />
          ))}
        </Cartao>

        <Cartao titulo="Despesas essenciais" subtitulo={`${euro(despesaEssencialMensal(estado))} por mês`}>
          {despesas.map((d) => (
            <CampoCaixa
              key={d.id}
              rotulo={`${d.descricao} · ${d.porDefinir ? 'valor por definir' : `${euro(equivalenteMensal(d))}/mês`}`}
              valor={f.essenciaisIds.includes(d.id)}
              mudar={(v) => mudar({ essenciaisIds: v ? [...f.essenciaisIds, d.id] : f.essenciaisIds.filter((x) => x !== d.id) })}
            />
          ))}
          <CampoNumero rotulo="Alimentação e necessidades básicas (extra)" valor={f.necessidadesBasicas} mudar={(v) => mudar({ necessidadesBasicas: v ?? 0 })} dica="Valor mensal estimado, além das despesas selecionadas." />
        </Cartao>

        <Cartao titulo="Despesas extraordinárias" subtitulo="Valores únicos somados ao objetivo (ex.: reparação do carro).">
          {f.extraordinarias.map((x) => (
            <div key={x.id} className="cartao-cabeca">
              <span>{x.nome}</span>
              <span className="acoes">
                <span className="num">{euro(x.valor)}</span>
                <button type="button" className="pequeno perigo" onClick={() => mudar({ extraordinarias: f.extraordinarias.filter((y) => y.id !== x.id) })}>
                  Remover
                </button>
              </span>
            </div>
          ))}
          <div className="linha-campos">
            <CampoTexto rotulo="Descrição" valor={novaExtra.nome} mudar={(nome) => setNovaExtra({ ...novaExtra, nome })} />
            <CampoNumero rotulo="Valor" valor={novaExtra.valor} mudar={(valor) => setNovaExtra({ ...novaExtra, valor })} />
          </div>
          <button
            type="button"
            disabled={!novaExtra.nome.trim() || !(novaExtra.valor && novaExtra.valor > 0)}
            onClick={() => {
              mudar({ extraordinarias: [...f.extraordinarias, { id: novoId(), nome: novaExtra.nome.trim(), valor: novaExtra.valor ?? 0 }] });
              setNovaExtra({ nome: '', valor: 0 });
            }}
          >
            Adicionar
          </button>
        </Cartao>
      </div>

      <Cartao titulo="Simulador de objetivos" subtitulo="Compara objetivos de 3, 6, 9 e 12 meses com o capital atual.">
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Cobertura</th>
                <th className="num">Objetivo</th>
                <th className="num">Concretizado</th>
                <th className="num">Em falta</th>
                <th className="num">Tempo com reforço atual</th>
              </tr>
            </thead>
            <tbody>
              {[3, 6, 9, 12].map((n) => {
                const alvo = objetivoCalculadoFundo(estado, n);
                const falta = Math.max(0, alvo - r.capital);
                return (
                  <tr key={n} style={n === f.meses ? { fontWeight: 650 } : undefined}>
                    <td>{n} meses</td>
                    <td className="num">{euro(alvo)}</td>
                    <td className="num">{alvo > 0 ? pct(Math.min(1, r.capital / alvo)) : '—'}</td>
                    <td className="num">{euro(falta)}</td>
                    <td className="num">{falta === 0 ? 'Atingido' : f.reforcoMensal > 0 ? meses1(Math.ceil(falta / f.reforcoMensal)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao titulo="Simulação de perda de rendimento" subtitulo="Durante quanto tempo o fundo cobre as despesas sem o salário?">
        <div className="linha-campos">
          <CampoNumero rotulo="Rendimento que continuaria a receber" valor={rendimentoRestante} mudar={setRendimentoRestante} dica="Ex.: subsídio de desemprego, se souberes o valor." />
          <CampoNumero rotulo="Despesas mensais a cobrir" valor={despesaUsada} mudar={setDespesaSim} dica="Por omissão, as despesas essenciais selecionadas." />
        </div>
        <CampoCaixa rotulo={`Usar também as outras poupanças (${euro(atual.poupancas)})`} valor={incluirPoupancas} mudar={setIncluirPoupancas} />
        <div className="kpis">
          <Kpi rotulo="Capital usado" valor={euro(capitalSim)} />
          <Kpi rotulo="Défice mensal" valor={euro(sim.defice)} />
          <Kpi rotulo="O fundo dura" valor={Number.isFinite(sim.meses) ? meses1(sim.meses) : 'Sem défice'} classeValor={Number.isFinite(sim.meses) && sim.meses < f.meses ? 'negativo' : 'positivo'} />
        </div>
        {sim.serie.length > 1 && (
          <GraficoSeries tipo="area" altura="baixo" dados={sim.serie.map((p) => ({ ...p, rotulo: `Mês ${p.mes}` }))} x="rotulo" series={[{ chave: 'saldo', nome: 'Capital restante', cor: c.serie[5] }]} />
        )}
        <NotaSimulacao>Simulação simplificada: assume despesas constantes e não considera juros nem impostos.</NotaSimulacao>
      </Cartao>
    </>
  );
}

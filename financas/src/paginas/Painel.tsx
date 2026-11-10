import { useMemo, useState } from 'react';
import { Segmentos } from '../componentes/campos';
import { DistribuirReforco } from '../componentes/DistribuirReforco';
import { Modal } from '../componentes/janelas';
import { sugestoesAssistente } from '../dominio/assistente';
import { disponivelParaGastar, orcamentoDoMes } from '../dominio/orcamento';
import { GraficoDonut, GraficoSeries, useCores } from '../componentes/graficos';
import { Aviso, Barra, Cartao, Kpi, LinhasResumo, Vazio } from '../componentes/ui';
import { NOMES_PERIODO, fimMes, mesDe, mesesDoPeriodo, somarDias, type Periodo } from '../dominio/datas';
import { data as fmtData, euro, euroRedondo, mesCurto, pct, sinal } from '../dominio/formato';
import { inicioDados, orcamentoMes, primeiroMes, serieFluxos, somarFluxos } from '../dominio/fluxos';
import { resumoCarteira } from '../dominio/investimentos';
import { ocorrenciasEntre } from '../dominio/recorrencias';
import { composicao } from '../dominio/saldos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { irPara } from '../navegacao';

function lerPeriodo(): Periodo {
  try {
    return (sessionStorage.getItem('capital.periodo') as Periodo) || '6m';
  } catch {
    return '6m';
  }
}

export default function Painel() {
  const { estado, hoje } = useLoja();
  const { atual, mesRef, estimativa, alertas } = useResumo();
  const c = useCores();
  const [periodo, setPeriodoEstado] = useState<Periodo>(lerPeriodo);
  const setPeriodo = (p: Periodo) => {
    setPeriodoEstado(p);
    try {
      sessionStorage.setItem('capital.periodo', p);
    } catch {
      /* sem armazenamento */
    }
  };

  const d = useMemo(() => {
    const comeco = inicioDados(estado, hoje);
    const meses = mesesDoPeriodo(periodo, mesRef, primeiroMes(estado, mesRef)).filter((m, i, l) => m >= mesDe(comeco) || i === l.length - 1);
    const fluxos = serieFluxos(estado, meses);
    const total = somarFluxos(fluxos);
    // Pontos de evolução: fim de cada mês, ou de 3 em 3 dias quando o período é um só mês.
    const datas =
      meses.length === 1
        ? Array.from({ length: 11 }, (_, i) => somarDias(`${meses[0]}-01`, i * 3)).filter((x) => x <= hoje && x >= comeco && mesDe(x) === meses[0])
        : meses.map((m) => (fimMes(m) < hoje ? fimMes(m) : hoje));
    if (!datas.includes(hoje) && mesDe(hoje) === meses[meses.length - 1]) datas.push(hoje);
    const evolucao = datas.map((dt) => {
      const k = composicao(estado, dt);
      return {
        rotulo: meses.length === 1 ? fmtData(dt).slice(0, 5) : mesCurto(mesDe(dt)),
        patrimonio: k.patrimonio,
        poupancas: k.poupancas + k.fundoEmergencia,
        investimentos: k.carteira,
      };
    });
    const inicio = evolucao[0]?.patrimonio ?? 0;
    return { meses, fluxos, total, evolucao, variacao: atual.patrimonio - inicio };
  }, [estado, periodo, mesRef, hoje, atual.patrimonio]);

  const carteira = useMemo(() => resumoCarteira(estado), [estado]);
  const disp = useMemo(() => disponivelParaGastar(estado, hoje), [estado, hoje]);
  const orcMes = useMemo(() => orcamentoDoMes(estado, hoje), [estado, hoje]);
  const sugestoes = useMemo(() => sugestoesAssistente(estado, hoje), [estado, hoje]);
  const [detalhe, setDetalhe] = useState<'agora' | 'mes' | null>(null);
  const [distribuir, setDistribuir] = useState(false);
  const proximos = useMemo(
    () => ocorrenciasEntre(estado, hoje, somarDias(hoje, 14)).filter((o) => !o.lancada && o.recorrente.tipo !== 'transferencia'),
    [estado, hoje],
  );
  const orcamento = useMemo(() => orcamentoMes(estado, mesRef).filter((l) => l.orcamento != null).sort((a, b) => b.utilizacao - a.utilizacao).slice(0, 5), [estado, mesRef]);
  const umMes = d.meses.length === 1;
  const sufixo = umMes ? 'do mês' : 'no período';

  const distribuicao = [
    { nome: 'Disponível', valor: atual.disponivel, cor: c.serie[0] },
    { nome: 'Poupanças', valor: atual.poupancas, cor: c.serie[1] },
    { nome: 'Fundo de emergência', valor: atual.fundoEmergencia, cor: c.serie[5] },
    { nome: 'Investimentos', valor: atual.carteira, cor: c.serie[3] },
    { nome: 'Liquidez em carteiras', valor: atual.liquidezCarteiras, cor: c.serie[6] },
    ...(estado.perfil.incluirRefeicaoPatrimonio ? [{ nome: 'Cartão-refeição', valor: atual.refeicao, cor: c.serie[2] }] : []),
  ];
  const porProduto = [
    ...atual.porConta.filter((p) => p.saldo > 0).map((p) => ({ nome: p.conta.instituicao ? `${p.conta.nome} (${p.conta.instituicao})` : p.conta.nome, valor: p.saldo })),
    ...carteira.linhas.filter((l) => l.valor > 0).map((l) => ({ nome: l.ativo.nome, valor: l.valor })),
  ];

  return (
    <>
      {(estimativa.liquidoPorConfirmar > 0 || estimativa.porDefinir > 0) && (
        <Aviso>
          {estimativa.liquidoPorConfirmar > 0 && <>Há {estimativa.liquidoPorConfirmar} rendimento(s) com valor líquido por confirmar (os cálculos usam o bruto). </>}
          {estimativa.porDefinir > 0 && <>Há {estimativa.porDefinir} valor(es) por definir. </>}
          <button type="button" className="pequeno" style={{ marginLeft: 4 }} onClick={() => irPara(estimativa.liquidoPorConfirmar > 0 ? 'receitas' : 'despesas')}>
            Rever
          </button>
        </Aviso>
      )}

      <div className="cartao-cabeca">
        <Segmentos rotulo="Período" valor={periodo} mudar={setPeriodo} opcoes={(Object.keys(NOMES_PERIODO) as Periodo[]).map((p) => ({ valor: p, nome: NOMES_PERIODO[p] }))} />
      </div>

      <div className="kpis">
        <Kpi destaque rotulo="Património financeiro total" valor={euro(atual.patrimonio)} detalhe={d.evolucao.length > 1 ? `${sinal(d.variacao)} ${umMes ? 'este mês' : `desde ${mesCurto(d.meses[0])}`}` : 'Registos a partir de hoje'} />
        <Kpi rotulo="Saldo das contas bancárias" valor={euro(atual.bancario)} detalhe="À ordem, poupança e depósitos" />
        <button type="button" className="kpi" style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', display: 'grid', justifyItems: 'start', whiteSpace: 'normal' }} onClick={() => setDetalhe('agora')}>
          <span className="rotulo">
            <span className="ponto" style={{ background: c.serie[0] }} />
            Disponível para gastar agora
          </span>
          <span className={`valor ${disp.agora < 0 ? 'negativo' : ''}`}>{euro(disp.agora)}</span>
          <span className="detalhe">Livre de alocações e compromissos · ver cálculo</span>
        </button>
        <button type="button" className="kpi" style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', display: 'grid', justifyItems: 'start', whiteSpace: 'normal' }} onClick={() => setDetalhe('mes')}>
          <span className="rotulo">Orçamento disponível para o mês</span>
          <span className={`valor ${orcMes.restante < 0 ? 'negativo' : ''}`}>{euro(orcMes.restante)}</span>
          <span className="detalhe">De {euro(orcMes.orcamento)} planeados · ver cálculo</span>
        </button>
        <Kpi rotulo="Total de poupanças" valor={euro(atual.poupancas)} cor={c.serie[1]} detalhe="Sem o fundo de emergência" />
        <Kpi rotulo="Fundo de emergência" valor={euro(atual.fundoEmergencia)} cor={c.serie[5]} detalhe="Reservado à parte" />
        <Kpi rotulo="Capital investido" valor={euro(carteira.investido)} cor={c.serie[3]} detalhe={carteira.investido > 0 ? `Valor atual ${euro(carteira.valor)} (${sinal(carteira.ganhoLatente)})` : 'Sem investimentos'} />
        <Kpi rotulo={`Receitas ${sufixo}`} valor={euro(d.total.receitas)} detalhe={d.total.beneficios > 0 ? `+ ${euro(d.total.beneficios)} em cartão-refeição` : 'Só dinheiro'} />
        <Kpi rotulo={`Despesas ${sufixo}`} valor={euro(d.total.despesas)} detalhe={d.total.despesasRefeicao > 0 ? `+ ${euro(d.total.despesasRefeicao)} em cartão-refeição` : 'Pagas com dinheiro'} />
        <Kpi rotulo={`Taxa de poupança ${sufixo}`} valor={d.total.receitas > 0 ? pct(d.total.taxaPoupanca) : '—'} classeValor={d.total.taxaPoupanca < 0 ? 'negativo' : 'positivo'} detalhe={d.total.receitas > 0 ? `${euro(d.total.poupanca)} poupados` : `Plano mensal: ${pct(estimativa.taxaPoupanca)}`} />
      </div>

      <div className="grelha">
        <Cartao titulo="Evolução do património líquido" subtitulo={NOMES_PERIODO[periodo]}>
          {d.evolucao.length > 0 ? (
            <GraficoSeries dados={d.evolucao} x="rotulo" series={[{ chave: 'patrimonio', nome: 'Património', cor: c.acento }]} />
          ) : (
            <Vazio>Sem dados neste período.</Vazio>
          )}
        </Cartao>
        <Cartao titulo="Distribuição do património" subtitulo="Por categoria, hoje">
          <GraficoDonut fatias={distribuicao} vazio="Ainda não há saldos registados." />
        </Cartao>
        <Cartao titulo="Receitas e despesas" subtitulo="Em dinheiro, por mês">
          <GraficoSeries
            tipo="barra"
            dados={d.fluxos.map((f) => ({ ...f, rotulo: mesCurto(f.mes) }))}
            x="rotulo"
            series={[
              { chave: 'receitas', nome: 'Receitas', cor: c.positivo },
              { chave: 'despesas', nome: 'Despesas', cor: c.negativo },
            ]}
          />
        </Cartao>
        <Cartao titulo="Evolução das poupanças" subtitulo="Poupanças e fundo de emergência">
          <GraficoSeries dados={d.evolucao} x="rotulo" series={[{ chave: 'poupancas', nome: 'Poupanças', cor: c.serie[1] }]} />
        </Cartao>
        <Cartao titulo="Dinheiro por conta e produto" subtitulo="Saldos e valor de mercado">
          <GraficoDonut fatias={porProduto} vazio="Ainda não há saldos registados." />
        </Cartao>
        <Cartao titulo="Próximos 14 dias" acoes={<button type="button" className="pequeno" onClick={() => irPara('despesas')}>Calendário</button>}>
          {proximos.length ? (
            <div className="lista">
              {proximos.slice(0, 6).map((o) => (
                <div className="item" key={`${o.recorrente.id}${o.data}`}>
                  <span className="avatar">{fmtData(o.data).slice(0, 5)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="titulo">{o.recorrente.descricao}</div>
                    <div className="sub">{o.recorrente.automatico ? 'Registo automático' : 'Previsto'}</div>
                  </div>
                  <div className={`montante ${o.recorrente.tipo === 'receita' ? 'positivo' : ''}`}>
                    {o.recorrente.porDefinir ? 'Por definir' : `${o.recorrente.tipo === 'receita' ? '+' : '−'}${euro(o.valor)}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="suave pequeno">Sem pagamentos ou recebimentos previstos.</p>
          )}
        </Cartao>
        <Cartao titulo="Orçamento do mês" acoes={<button type="button" className="pequeno" onClick={() => irPara('despesas')}>Ver tudo</button>}>
          {orcamento.length ? (
            orcamento.map((l) => (
              <div className="linha-barra" key={l.categoriaId}>
                <div className="cabeca">
                  <span>{l.nome}</span>
                  <span className={`num ${l.excedido ? 'negativo' : 'suave'}`}>
                    {euroRedondo(l.real)} / {euroRedondo(l.orcamento ?? 0)}
                  </span>
                </div>
                <Barra fracao={l.utilizacao} cor={l.excedido ? c.negativo : l.utilizacao > 0.85 ? 'var(--aviso)' : c.acento} />
              </div>
            ))
          ) : (
            <p className="suave pequeno">Define orçamentos por categoria em Despesas.</p>
          )}
        </Cartao>
        {sugestoes.length > 0 && (
          <Cartao titulo="Assistente" acoes={<button type="button" className="pequeno" onClick={() => irPara('assistente')}>Ver todas ({sugestoes.length})</button>}>
            {sugestoes.slice(0, 3).map((s) => (
              <Aviso key={s.id} tom={s.tom === 'positivo' ? 'positivo' : s.tom === 'aviso' ? 'aviso' : 'info'}>
                <strong>{s.titulo}</strong>
                <div className="pequeno">{s.origem}</div>
              </Aviso>
            ))}
            <button type="button" className="primario" style={{ justifySelf: 'start' }} onClick={() => setDistribuir(true)}>
              Distribuir um reforço
            </button>
          </Cartao>
        )}
        <Cartao titulo="Alertas" acoes={<button type="button" className="pequeno" onClick={() => irPara('alertas')}>Ver todos ({alertas.length})</button>}>
          {alertas.length ? (
            alertas.slice(0, 4).map((a) => (
              <Aviso key={a.id} tom={a.nivel === 'sucesso' ? 'positivo' : a.nivel === 'aviso' ? 'aviso' : 'info'}>
                <strong>{a.titulo}</strong>
                <div>{a.detalhe}</div>
              </Aviso>
            ))
          ) : (
            <p className="suave pequeno">Sem alertas.</p>
          )}
        </Cartao>
      </div>
      {distribuir && <DistribuirReforco aoFechar={() => setDistribuir(false)} />}
      {detalhe === 'agora' && (
        <Modal titulo="Disponível para gastar agora" aoFechar={() => setDetalhe(null)}>
          <p className="suave pequeno">Dinheiro das contas para gastos ({disp.contas.map((x) => x.nome).join(', ') || 'nenhuma'}) que não está reservado nem comprometido. Exclui investimentos, cartão-refeição e contas que não marcaste para gastos.</p>
          <LinhasResumo
            linhas={[
              ['Saldo das contas para gastos', euro(disp.saldo)],
              ['− Capital alocado (fundo, objetivos, despesas futuras)', euro(-disp.alocado)],
              ...disp.compromissos.map((x): [string, string] => [`− ${x.descricao}${x.data ? ` (${fmtData(x.data)})` : ''}`, euro(-x.valor)]),
              ['Disponível para gastar agora', euro(disp.agora), 'total'],
            ]}
          />
        </Modal>
      )}
      {detalhe === 'mes' && (
        <Modal titulo="Orçamento disponível para o mês" aoFechar={() => setDetalhe(null)}>
          <p className="suave pequeno">O que podes usar este mês em despesas não planeadas, depois das despesas programadas, poupanças e reforços. Não inclui o cartão-refeição.</p>
          <LinhasResumo
            linhas={[
              ['Rendimentos recebidos este mês', euro(orcMes.recebido)],
              ['+ Rendimentos ainda previstos', euro(orcMes.porReceber)],
              ['− Despesas programadas (pagas e por pagar)', euro(-orcMes.despesasProgramadas)],
              ['− Reforços, investimentos e poupanças planeados', euro(-orcMes.reforcos)],
              ['= Orçamento do mês', euro(orcMes.orcamento), 'total'],
              ['− Gastos fora do plano já feitos', euro(-orcMes.gastoForaPlano)],
              ['Restante', euro(orcMes.restante), 'total'],
            ]}
          />
        </Modal>
      )}
    </>
  );
}

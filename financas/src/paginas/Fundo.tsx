import { useState } from 'react';
import { CampoCaixa, CampoEscolha, CampoNumero, CampoTexto, Segmentos } from '../componentes/campos';
import { FundoNasContas, ProdutosParaFundo } from '../componentes/FundoContas';
import { jurosEstimados, saldoConta } from '../dominio/saldos';
import { fundoNaConta } from '../dominio/alocacoes';
import { GraficoSeries, useCores } from '../componentes/graficos';
import { useInteracoes } from '../componentes/janelas';
import { Aviso, Barra, Cartao, Kpi, LinhasResumo, NotaSimulacao } from '../componentes/ui';
import { euro, numero, pct } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { planoMensal } from '../dominio/orcamento';
import { detalheEssenciais, objetivoCalculadoFundo, resumoFundo, simularDesemprego, sugestaoCobertura } from '../dominio/planeamento';
import { equivalenteMensal } from '../dominio/recorrencias';
import type { FundoEmergenciaConfig, Perfil } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

const meses1 = (n: number | null) => (n == null ? '—' : `${numero(Math.round(n * 10) / 10)} ${Math.abs(n - 1) < 0.05 ? 'mês' : 'meses'}`);

export default function Fundo() {
  const { estado, atualizar, hoje } = useLoja();
  const { atual } = useResumo();
  const { confirmar } = useInteracoes();
  const c = useCores();
  const f = estado.fundo;
  const r = resumoFundo(estado, atual.fundoEmergencia, hoje);
  const sug = sugestaoCobertura(estado);
  const plano = planoMensal(estado, hoje);
  const mudar = (p: Partial<FundoEmergenciaConfig>) => atualizar((e) => ({ ...e, fundo: { ...e.fundo, ...p } }));
  const mudarPerfil = (p: Partial<Perfil>) => atualizar((e) => ({ ...e, perfil: { ...e.perfil, ...p } }));
  const modo = f.modo ?? 'automatico';
  const essenciais = detalheEssenciais(estado, hoje);
  const despesas = estado.recorrentes.filter((x) => x.tipo === 'despesa' && x.ativo);
  const [novaExtra, setNovaExtra] = useState({ nome: '', valor: 0 as number | null });
  const [minimoTexto, setMinimoTexto] = useState<number | null>(f.minimoProtegido ?? null);

  // Simulação de perda de rendimento
  const [rendimentoRestante, setRendimentoRestante] = useState<number | null>(0);
  const [despesaSim, setDespesaSim] = useState<number | null>(null);
  const [incluirPoupancas, setIncluirPoupancas] = useState(false);
  const despesaUsada = despesaSim ?? r.essencial;
  const capitalSim = r.capital + (incluirPoupancas ? atual.poupancas : 0);
  const sim = simularDesemprego(capitalSim, despesaUsada, rendimentoRestante ?? 0);
  const viaRefeicao = essenciais.reduce((s, l) => s + l.viaRefeicao, 0);

  const guardarMinimo = async () => {
    const novo = minimoTexto ?? null;
    const atualMin = f.minimoProtegido ?? null;
    // O mínimo protegido só baixa com confirmação explícita.
    if (atualMin != null && (novo == null || novo < atualMin)) {
      const ok = await confirmar(`Reduzir o valor mínimo protegido de ${euro(atualMin)} para ${novo == null ? 'nenhum' : euro(novo)}?`, { botao: 'Reduzir', perigo: true });
      if (!ok) return setMinimoTexto(atualMin);
    }
    mudar({ minimoProtegido: novo });
  };

  return (
    <>
      <Cartao titulo="Fundo de emergência" subtitulo="Reserva alocada dentro das tuas contas, separada do dinheiro do dia a dia e dos investimentos.">
        <div className="kpis">
          <Kpi rotulo="Valor recomendado" valor={euro(r.recomendado)} detalhe={`${sug.meses} meses × ${euro(r.essencial)} de despesas essenciais`} />
          <Kpi rotulo="Valor mínimo protegido" valor={r.minimo > 0 ? euro(r.minimo) : '—'} detalhe="Definido por ti" />
          <Kpi rotulo="Objetivo efetivo" valor={euro(r.objetivo)} detalhe={r.origemObjetivo === 'minimo' ? 'Mínimo protegido (é maior que o calculado)' : `Calculado: ${r.meses} meses de despesas essenciais`} />
          <Kpi rotulo="Capital alocado" valor={euro(r.capital)} cor={c.serie[5]} />
          <Kpi rotulo="Em falta" valor={euro(r.falta)} classeValor={r.falta > 0 ? '' : 'positivo'} />
          <Kpi rotulo="Concretização" valor={pct(r.progresso)} />
          <Kpi rotulo="Meses cobertos" valor={meses1(r.mesesCobertos)} detalhe={`Despesas essenciais: ${euro(r.essencial)}/mês`} />
          <Kpi
            rotulo="Tempo até ao objetivo"
            valor={r.mesesParaObjetivo === 0 ? 'Atingido' : r.mesesParaObjetivo == null ? '—' : meses1(r.mesesParaObjetivo)}
            detalhe={f.reforcoMensal > 0 ? `Com reforços de ${euro(f.reforcoMensal)}/mês` : 'Define um reforço mensal'}
          />
        </div>
        <Barra grande fracao={r.progresso} cor={r.progresso >= 1 ? c.positivo : c.serie[5]} />
        {r.essencial === 0 && <Aviso>Ainda não há despesas essenciais com valor. Marca categorias como essenciais (Definições) ou regista as despesas para calcular o objetivo.</Aviso>}
        {plano.rendimento > 0 && (
          <p className="suave pequeno">
            Capacidade de constituição: com o rendimento de {euro(plano.rendimento)}/mês e despesas obrigatórias de {euro(plano.rendimento - plano.capacidadeBruta)}/mês, sobram cerca de {euro(Math.max(0, plano.capacidadeBruta))}/mês.
            {r.falta > 0 && plano.capacidadeBruta > 0 && ` Ao ritmo máximo, o objetivo seria atingido em ${meses1(Math.ceil(r.falta / plano.capacidadeBruta))}.`} O salário serve só para avaliar esta capacidade; o objetivo baseia-se nas despesas.
          </p>
        )}
      </Cartao>

      <div className="grelha">
        <Cartao titulo="Meses de cobertura" subtitulo={`Sugestão da aplicação: ${sug.meses} meses`}>
          <LinhasResumo linhas={sug.fatores.map((x) => ['Fator', x] as [string, string])} />
          <div className="linha-campos">
            <CampoEscolha rotulo="Estabilidade profissional" valor={estado.perfil.estabilidade ?? 'estavel'} mudar={(estabilidade) => mudarPerfil({ estabilidade })} opcoes={[{ valor: 'estavel', nome: 'Estável (contrato sem termo)' }, { valor: 'moderada', nome: 'Moderada (a termo, recente)' }, { valor: 'instavel', nome: 'Instável (independente, precário)' }]} />
            <CampoEscolha rotulo="Regularidade dos rendimentos" valor={estado.perfil.regularidade ?? 'regular'} mudar={(regularidade) => mudarPerfil({ regularidade })} opcoes={[{ valor: 'regular', nome: 'Regulares' }, { valor: 'variavel', nome: 'Variáveis' }]} />
            <CampoNumero rotulo="Dependentes" sufixo="" min={0} max={20} valor={estado.perfil.dependentes ?? 0} mudar={(v) => mudarPerfil({ dependentes: Math.max(0, Math.round(v ?? 0)) })} />
          </div>
          <CampoCaixa rotulo="Usar a sugestão da aplicação" valor={!!f.usarSugestao} mudar={(usarSugestao) => mudar({ usarSugestao })} />
          {!f.usarSugestao && <Segmentos rotulo="Meses" valor={String(f.meses)} mudar={(v) => mudar({ meses: Number(v) })} opcoes={[3, 6, 9, 12].map((n) => ({ valor: String(n), nome: `${n} meses` }))} />}
        </Cartao>

        <Cartao titulo="Valor mínimo protegido" subtitulo="O objetivo efetivo é o maior entre este valor e o calculado.">
          <CampoNumero rotulo="Mínimo protegido" valor={minimoTexto} permitirVazio mudar={setMinimoTexto} dica="Vazio: usa só o valor calculado. Nunca é reduzido automaticamente." />
          <div className="acoes">
            <button type="button" className="primario" onClick={guardarMinimo} disabled={(minimoTexto ?? null) === (f.minimoProtegido ?? null)}>
              Guardar mínimo
            </button>
            <button type="button" onClick={() => setMinimoTexto(Math.ceil(r.recomendado))}>
              Usar o recomendado ({euro(Math.ceil(r.recomendado))})
            </button>
          </div>
          <CampoNumero rotulo="Reforço mensal planeado" valor={f.reforcoMensal} mudar={(v) => mudar({ reforcoMensal: v ?? 0 })} />
        </Cartao>
      </div>

      <FundoNasContas />
      <ProdutosParaFundo
        capital={r.capital}
        rendimentoAtual={estado.contas.reduce((soma, ct) => {
          const sd = saldoConta(estado, ct, hoje);
          const fe = fundoNaConta(estado, ct.id, sd);
          const j = jurosEstimados(ct, sd, estado.pressupostos.retencaoJuros);
          return j && sd > 0 ? soma + j.liquido * (Math.min(fe, j.base) / sd) : soma;
        }, 0)}
      />

      <Cartao
        titulo="Despesas essenciais"
        subtitulo={`${euro(r.essencial)} por mês`}
        acoes={<Segmentos rotulo="Modo" valor={modo} mudar={(m) => mudar({ modo: m })} opcoes={[{ valor: 'automatico', nome: 'Automático' }, { valor: 'manual', nome: 'Manual' }]} />}
      >
        {modo === 'automatico' ? (
          <>
            <p className="suave pequeno">Categorias marcadas como essenciais (habitação, alimentação, transportes, saúde, seguros, empréstimos…). Despesas anuais entram como média mensal. Usa-se o maior entre o plano (recorrentes) e a média real dos últimos meses.</p>
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="num">Plano</th>
                    <th className="num">Média real</th>
                    <th className="num">Considerado</th>
                  </tr>
                </thead>
                <tbody>
                  {essenciais.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.nome}
                        {l.viaRefeicao > 0 && <div className="mais-suave pequeno">{euro(l.viaRefeicao)} pagos com cartão-refeição</div>}
                      </td>
                      <td className="num">{euro(l.plano)}</td>
                      <td className="num">{plano.mesesHistorico ? euro(l.historico) : '—'}</td>
                      <td className="num">{euro(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {viaRefeicao > 0 && <Aviso tom="info">{euro(viaRefeicao)}/mês são pagos com cartão-refeição. Em desemprego esse benefício pode acabar, por isso a necessidade de alimentação continua incluída no fundo.</Aviso>}
          </>
        ) : (
          despesas.map((d) => (
            <CampoCaixa
              key={d.id}
              rotulo={`${d.descricao} · ${d.porDefinir ? 'valor por definir' : `${euro(equivalenteMensal(d))}/mês`}`}
              valor={f.essenciaisIds.includes(d.id)}
              mudar={(v) => mudar({ essenciaisIds: v ? [...f.essenciaisIds, d.id] : f.essenciaisIds.filter((x) => x !== d.id) })}
            />
          ))
        )}
        <CampoNumero rotulo="Alimentação e necessidades básicas (extra)" valor={f.necessidadesBasicas} mudar={(v) => mudar({ necessidadesBasicas: v ?? 0 })} dica="Valor mensal estimado, além das despesas registadas." />
      </Cartao>

      <Cartao titulo="Despesas extraordinárias" subtitulo="Valores únicos somados ao objetivo calculado (ex.: reparação do carro).">
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

      <Cartao titulo="Simulador de objetivos" subtitulo="Compara objetivos de 3, 6, 9 e 12 meses com o capital atual.">
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Cobertura</th>
                <th className="num">Calculado</th>
                <th className="num">Objetivo efetivo</th>
                <th className="num">Concretizado</th>
                <th className="num">Em falta</th>
                <th className="num">Tempo com reforço atual</th>
              </tr>
            </thead>
            <tbody>
              {[3, 6, 9, 12].map((n) => {
                const calc = objetivoCalculadoFundo(estado, n, hoje);
                const alvo = Math.max(calc, r.minimo);
                const falta = Math.max(0, alvo - r.capital);
                return (
                  <tr key={n} style={n === r.meses ? { fontWeight: 650 } : undefined}>
                    <td>
                      {n} meses{n === sug.meses ? ' (sugerido)' : ''}
                    </td>
                    <td className="num">{euro(calc)}</td>
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
          <CampoNumero rotulo="Despesas mensais a cobrir" valor={despesaUsada} mudar={setDespesaSim} dica="Por omissão, as despesas essenciais (inclui alimentação paga hoje com cartão-refeição)." />
        </div>
        <CampoCaixa rotulo={`Usar também as outras poupanças (${euro(atual.poupancas)})`} valor={incluirPoupancas} mudar={setIncluirPoupancas} />
        <div className="kpis">
          <Kpi rotulo="Capital usado" valor={euro(capitalSim)} />
          <Kpi rotulo="Défice mensal" valor={euro(sim.defice)} />
          <Kpi rotulo="O fundo dura" valor={Number.isFinite(sim.meses) ? meses1(sim.meses) : 'Sem défice'} classeValor={Number.isFinite(sim.meses) && sim.meses < r.meses ? 'negativo' : 'positivo'} />
        </div>
        {sim.serie.length > 1 && (
          <GraficoSeries tipo="area" altura="baixo" dados={sim.serie.map((p) => ({ ...p, rotulo: `Mês ${p.mes}` }))} x="rotulo" series={[{ chave: 'saldo', nome: 'Capital restante', cor: c.serie[5] }]} />
        )}
        <NotaSimulacao>Simulação simplificada: assume despesas constantes e não considera juros nem impostos.</NotaSimulacao>
      </Cartao>
    </>
  );
}

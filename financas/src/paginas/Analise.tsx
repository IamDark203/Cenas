import { useMemo, useState } from 'react';
import { CampoCaixa, CampoNumero, Segmentos } from '../componentes/campos';
import { GraficoSeries, useCores } from '../componentes/graficos';
import { Cartao, Kpi, NotaSimulacao } from '../componentes/ui';
import { mesesEntre, somarMesesMes, fimMes } from '../dominio/datas';
import { euro, mesCurto, pct, sinal } from '../dominio/formato';
import { primeiroMes, serieFluxos, somarFluxos } from '../dominio/fluxos';
import { resumoCarteira } from '../dominio/investimentos';
import { projetar } from '../dominio/planeamento';
import { composicao, seriePatrimonio } from '../dominio/saldos';
import type { Pressupostos } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

const HORIZONTES = [1, 3, 5, 10, 20];

export default function Analise() {
  const { estado, atualizar, hoje } = useLoja();
  const { atual, mesRef, estimativa } = useResumo();
  const c = useCores();

  const h = useMemo(() => {
    const inicio = primeiroMes(estado, mesRef);
    const meses = mesesEntre(somarMesesMes(mesRef, -11) > inicio ? somarMesesMes(mesRef, -11) : inicio, mesRef);
    const fluxos = somarFluxos(serieFluxos(estado, meses));
    const serie = seriePatrimonio(estado, meses, hoje);
    const antes = composicao(estado, fimMes(somarMesesMes(meses[0], -1)));
    const carteira = resumoCarteira(estado);
    return { meses, fluxos, serie, antes, carteira };
  }, [estado, mesRef, hoje]);

  const p = estado.pressupostos.projecao;
  const mudar = (x: Partial<Pressupostos['projecao']>) => atualizar((e) => ({ ...e, pressupostos: { ...e.pressupostos, projecao: { ...e.pressupostos.projecao, ...x } } }));
  const [baseTipo, setBaseTipo] = useState<'plano' | 'historico'>('plano');
  const [horizonte, setHorizonte] = useState('10');
  const receitaBase = baseTipo === 'plano' ? estimativa.receitas : h.fluxos.mediaReceitas;
  const despesaBase = baseTipo === 'plano' ? estimativa.despesas : h.fluxos.mediaDespesas;
  const liquidez = atual.patrimonio - atual.carteira;
  const proj = useMemo(
    () => projetar({ receitaMensal: receitaBase, despesaMensal: despesaBase, liquidez, investimentos: atual.carteira }, p, 20),
    [receitaBase, despesaBase, liquidez, atual.carteira, p],
  );
  const n = Number(horizonte);
  const poupancasAgora = atual.poupancas + atual.fundoEmergencia;
  const poupancasAntes = h.antes.poupancas + h.antes.fundoEmergencia;

  return (
    <>
      <Cartao titulo="Indicadores" subtitulo={`Últimos ${h.meses.length} mes(es): ${mesCurto(h.meses[0])} a ${mesCurto(mesRef)}`}>
        <div className="kpis">
          <Kpi rotulo="Taxa de poupança" valor={h.fluxos.receitas > 0 ? pct(h.fluxos.taxaPoupanca) : '—'} detalhe={`Plano mensal: ${pct(estimativa.taxaPoupanca)}`} />
          <Kpi rotulo="Receitas médias mensais" valor={euro(h.fluxos.mediaReceitas)} detalhe={`Plano: ${euro(estimativa.receitas)}`} />
          <Kpi rotulo="Despesas médias mensais" valor={euro(h.fluxos.mediaDespesas)} detalhe={`Plano: ${euro(estimativa.despesas)}`} />
          <Kpi rotulo="Património acumulado" valor={euro(atual.patrimonio)} />
          <Kpi rotulo="Crescimento das poupanças" valor={sinal(poupancasAgora - poupancasAntes)} detalhe="Poupanças + fundo, no período" />
          <Kpi rotulo="Evolução do fundo de emergência" valor={sinal(atual.fundoEmergencia - h.antes.fundoEmergencia)} detalhe={`Hoje: ${euro(atual.fundoEmergencia)}`} />
          <Kpi rotulo="Capital investido" valor={euro(h.carteira.investido)} />
          <Kpi rotulo="Rentabilidade da carteira" valor={h.carteira.investido > 0 ? pct(h.carteira.rentabilidade) : '—'} classeValor={h.carteira.rentabilidade >= 0 ? 'positivo' : 'negativo'} />
          <Kpi rotulo="Património investido" valor={atual.patrimonio > 0 ? pct(atual.carteira / atual.patrimonio) : '—'} />
        </div>
      </Cartao>

      <Cartao titulo="Composição do património por mês">
        <GraficoSeries
          tipo="barra"
          dados={h.serie.map((s) => ({ ...s, rotulo: mesCurto(s.mes) }))}
          x="rotulo"
          series={[
            { chave: 'disponivel', nome: 'Disponível', cor: c.serie[0], empilhar: 'p' },
            { chave: 'poupancas', nome: 'Poupanças', cor: c.serie[1], empilhar: 'p' },
            { chave: 'fundoEmergencia', nome: 'Fundo de emergência', cor: c.serie[5], empilhar: 'p' },
            { chave: 'carteira', nome: 'Investimentos', cor: c.serie[3], empilhar: 'p' },
          ]}
        />
      </Cartao>

      <Cartao titulo="Projeções" subtitulo="Testa alterações de rendimento, despesas e poupança.">
        <Segmentos rotulo="Base de cálculo" valor={baseTipo} mudar={setBaseTipo} opcoes={[{ valor: 'plano', nome: 'Plano mensal (recorrentes)' }, { valor: 'historico', nome: 'Média dos últimos meses' }]} />
        <p className="suave pequeno">
          Base: receitas {euro(receitaBase)}/mês e despesas {euro(despesaBase)}/mês, em dinheiro. Ponto de partida: {euro(atual.patrimonio)}.
        </p>
        <div className="linha-campos">
          <CampoNumero rotulo="Variação salarial anual" sufixo="%" valor={p.variacaoSalarial} mudar={(v) => mudar({ variacaoSalarial: v ?? 0 })} />
          <CampoNumero rotulo="Aumento anual das despesas" sufixo="%" valor={p.aumentoDespesas} mudar={(v) => mudar({ aumentoDespesas: v ?? 0 })} />
          <CampoNumero rotulo="Redução de rendimentos" sufixo="%" min={0} max={100} valor={p.reducaoRendimentos} mudar={(v) => mudar({ reducaoRendimentos: v ?? 0 })} />
        </div>
        <div className="linha-campos">
          <CampoCaixa rotulo="Definir a poupança mensal" valor={p.poupancaMensal != null} mudar={(v) => mudar({ poupancaMensal: v ? Math.max(0, Math.round(receitaBase - despesaBase)) : null })} dica="Por omissão: receitas − despesas." />
          {p.poupancaMensal != null && <CampoNumero rotulo="Poupança mensal" valor={p.poupancaMensal} mudar={(v) => mudar({ poupancaMensal: v ?? 0 })} />}
        </div>
        <div className="linha-campos">
          <CampoNumero rotulo="Parte da poupança investida" sufixo="%" min={0} max={100} valor={p.percentagemInvestida} mudar={(v) => mudar({ percentagemInvestida: v ?? 0 })} />
          <CampoNumero rotulo="Rentabilidade anual hipotética dos investimentos" sufixo="%" valor={p.rentabilidadeInvestimentos} mudar={(v) => mudar({ rentabilidadeInvestimentos: v ?? 0 })} />
          <CampoNumero rotulo="Remuneração anual da poupança" sufixo="%" valor={p.remuneracaoPoupanca} mudar={(v) => mudar({ remuneracaoPoupanca: v ?? 0 })} />
        </div>
        <Segmentos rotulo="Horizonte" valor={horizonte} mudar={setHorizonte} opcoes={HORIZONTES.map((x) => ({ valor: String(x), nome: `${x} ${x === 1 ? 'ano' : 'anos'}` }))} />
        <GraficoSeries
          tipo="area"
          altura="alto"
          dados={proj.slice(0, n + 1).map((x) => ({ ...x, rotulo: `Ano ${x.ano}` }))}
          x="rotulo"
          series={[
            { chave: 'liquidez', nome: 'Liquidez e poupanças', cor: c.serie[1], empilhar: 'p' },
            { chave: 'investimentos', nome: 'Investimentos', cor: c.serie[3], empilhar: 'p' },
          ]}
        />
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Horizonte</th>
                <th className="num">Receitas no ano</th>
                <th className="num">Despesas no ano</th>
                <th className="num">Poupança no ano</th>
                <th className="num">Investimentos</th>
                <th className="num">Património</th>
              </tr>
            </thead>
            <tbody>
              {HORIZONTES.map((a) => {
                const x = proj[a];
                return (
                  <tr key={a} style={a === n ? { fontWeight: 650 } : undefined}>
                    <td>
                      {a} {a === 1 ? 'ano' : 'anos'}
                    </td>
                    <td className="num">{euro(x.receitas)}</td>
                    <td className="num">{euro(x.despesas)}</td>
                    <td className={`num ${x.poupanca < 0 ? 'negativo' : ''}`}>{euro(x.poupanca)}</td>
                    <td className="num">{euro(x.investimentos)}</td>
                    <td className={`num ${x.patrimonio < 0 ? 'negativo' : ''}`}>{euro(x.patrimonio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <NotaSimulacao />
      </Cartao>
    </>
  );
}

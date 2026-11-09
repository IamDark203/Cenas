import { useMemo, useState } from 'react';
import { CampoEscolha, Segmentos } from '../componentes/campos';
import { GraficoDonut, GraficoSeries, useCores } from '../componentes/graficos';
import { Icone } from '../componentes/icones';
import { useInteracoes } from '../componentes/janelas';
import { Cartao, Kpi } from '../componentes/ui';
import { fimMes, mesDe, mesesEntre } from '../dominio/datas';
import { euro, mesCurto, mesLongo, pct, sinal } from '../dominio/formato';
import { primeiroMes } from '../dominio/fluxos';
import { relatorio, type TipoRelatorio } from '../dominio/relatorios';
import { composicao } from '../dominio/saldos';
import { useLoja } from '../estado/loja';
import { entregarFicheiro, linhasContas, linhasInvestimentos, linhasMovimentos, paraCsv } from '../exportar/ficheiros';
import { livroXlsx, type Celula } from '../exportar/xlsx';

export default function Relatorios() {
  const { estado, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const c = useCores();
  const mesAtual = mesDe(hoje);
  const meses = useMemo(() => mesesEntre(primeiroMes(estado, mesAtual), mesAtual).reverse(), [estado, mesAtual]);
  const anos = [...new Set(meses.map((m) => m.slice(0, 4)))];
  const [tipo, setTipo] = useState<TipoRelatorio>('mes');
  const [mes, setMes] = useState(mesAtual);
  const [ano, setAno] = useState(mesAtual.slice(0, 4));
  const [aGerar, setAGerar] = useState(false);
  const chave = tipo === 'mes' ? mes : ano;
  const r = useMemo(() => relatorio(estado, tipo, chave, hoje), [estado, tipo, chave, hoje]);
  const a = r.atual;
  const p = r.anterior;
  const nomePeriodo = tipo === 'mes' ? mesLongo(chave) : chave;
  const movsPeriodo = estado.movimentos.filter((m) => (tipo === 'mes' ? mesDe(m.data) === chave : m.data.startsWith(chave)));
  const evolucao = r.meses.map((m) => ({ rotulo: mesCurto(m), patrimonio: composicao(estado, fimMes(m) < hoje ? fimMes(m) : hoje).patrimonio }));
  const sufixoFicheiro = tipo === 'mes' ? chave : chave;

  const comparacao = (x: number, y: number, inverso = false) => {
    const d = x - y;
    if (Math.abs(d) < 0.005) return 'Igual ao período anterior';
    const bom = inverso ? d < 0 : d > 0;
    return <span className={bom ? 'positivo' : 'negativo'}>{`${sinal(d)} vs período anterior`}</span>;
  };

  const exportarCsv = async () => {
    const res = await entregarFicheiro(`movimentos-${sufixoFicheiro}.csv`, paraCsv(linhasMovimentos(estado, movsPeriodo)));
    if (res !== 'cancelado') avisar('CSV exportado.');
  };
  const exportarExcel = async () => {
    const resumo: Celula[][] = [
      ['Indicador', nomePeriodo, 'Período anterior'],
      ['Receitas (dinheiro)', { euro: a.receitas }, { euro: p.receitas }],
      ['Despesas (dinheiro)', { euro: a.despesas }, { euro: p.despesas }],
      ['Poupança líquida', { euro: a.poupanca }, { euro: p.poupanca }],
      ['Taxa de poupança (%)', Math.round(a.taxaPoupanca * 10000) / 100, Math.round(p.taxaPoupanca * 10000) / 100],
      ['Benefícios (cartão-refeição)', { euro: a.beneficios }, { euro: p.beneficios }],
      ['Investimentos realizados', { euro: a.investido }, { euro: p.investido }],
      ['Património no fim', { euro: a.patrimonioFim }, { euro: p.patrimonioFim }],
      ['Evolução do património', { euro: a.variacaoPatrimonio }, { euro: p.variacaoPatrimonio }],
      [],
      ['Despesas por categoria', 'Valor'],
      ...r.categorias.map((x): Celula[] => [x.nome, { euro: x.valor }]),
    ];
    const blob = livroXlsx([
      { nome: 'Resumo', linhas: resumo },
      { nome: 'Movimentos', linhas: linhasMovimentos(estado, movsPeriodo) },
      { nome: 'Contas', linhas: linhasContas(estado, hoje) },
      { nome: 'Investimentos', linhas: linhasInvestimentos(estado) },
    ]);
    const res = await entregarFicheiro(`relatorio-${sufixoFicheiro}.xlsx`, blob);
    if (res !== 'cancelado') avisar('Excel exportado.');
  };
  const exportarPdf = async () => {
    setAGerar(true);
    try {
      const { relatorioPdf } = await import('../exportar/pdf');
      const res = await entregarFicheiro(`relatorio-${sufixoFicheiro}.pdf`, await relatorioPdf(r, hoje));
      if (res !== 'cancelado') avisar('PDF gerado.');
    } catch {
      avisar('Não foi possível gerar o PDF.');
    } finally {
      setAGerar(false);
    }
  };

  return (
    <>
      <Cartao>
        <div className="cartao-cabeca">
          <Segmentos rotulo="Tipo de relatório" valor={tipo} mudar={setTipo} opcoes={[{ valor: 'mes', nome: 'Mensal' }, { valor: 'ano', nome: 'Anual' }]} />
          <div style={{ minWidth: 200 }}>
            {tipo === 'mes' ? (
              <CampoEscolha rotulo="Mês" valor={mes} mudar={setMes} opcoes={meses.map((m) => ({ valor: m, nome: mesLongo(m) }))} />
            ) : (
              <CampoEscolha rotulo="Ano" valor={ano} mudar={setAno} opcoes={anos.map((x) => ({ valor: x, nome: x }))} />
            )}
          </div>
        </div>
        <div className="acoes">
          <button type="button" onClick={exportarPdf} disabled={aGerar}>
            <Icone nome="exportar" /> {aGerar ? 'A gerar…' : 'PDF'}
          </button>
          <button type="button" onClick={exportarExcel}>
            <Icone nome="exportar" /> Excel
          </button>
          <button type="button" onClick={exportarCsv}>
            <Icone nome="exportar" /> CSV (movimentos)
          </button>
        </div>
      </Cartao>

      <div className="kpis">
        <Kpi rotulo="Receitas totais" valor={euro(a.receitas)} detalhe={comparacao(a.receitas, p.receitas)} />
        <Kpi rotulo="Despesas totais" valor={euro(a.despesas)} detalhe={comparacao(a.despesas, p.despesas, true)} />
        <Kpi rotulo="Poupança líquida" valor={euro(a.poupanca)} classeValor={a.poupanca < 0 ? 'negativo' : ''} detalhe={a.receitas > 0 ? `Taxa de poupança ${pct(a.taxaPoupanca)}` : undefined} />
        <Kpi rotulo="Investimentos realizados" valor={euro(a.investido)} detalhe={comparacao(a.investido, p.investido)} />
        <Kpi rotulo="Evolução do património" valor={sinal(a.variacaoPatrimonio)} classeValor={a.variacaoPatrimonio >= 0 ? 'positivo' : 'negativo'} detalhe={`De ${euro(a.patrimonioInicio)} para ${euro(a.patrimonioFim)}`} />
        <Kpi rotulo="Cartão-refeição" valor={euro(a.beneficios)} detalhe={`Recebido · ${euro(a.despesasRefeicao)} gastos`} />
      </div>

      <div className="grelha">
        <Cartao titulo="Despesas por categoria" subtitulo={nomePeriodo}>
          <GraficoDonut fatias={r.categorias.map((x) => ({ nome: x.nome, valor: x.valor }))} vazio="Sem despesas neste período." />
        </Cartao>
        {tipo === 'ano' ? (
          <Cartao titulo="Receitas e despesas por mês">
            <GraficoSeries
              tipo="barra"
              dados={a.fluxos.map((f) => ({ ...f, rotulo: mesCurto(f.mes) }))}
              x="rotulo"
              series={[
                { chave: 'receitas', nome: 'Receitas', cor: c.positivo },
                { chave: 'despesas', nome: 'Despesas', cor: c.negativo },
              ]}
            />
          </Cartao>
        ) : (
          <Cartao titulo="Comparação com o mês anterior">
            <GraficoSeries
              tipo="barra"
              dados={[
                { rotulo: 'Receitas', anterior: p.receitas, atual: a.receitas },
                { rotulo: 'Despesas', anterior: p.despesas, atual: a.despesas },
                { rotulo: 'Poupança', anterior: p.poupanca, atual: a.poupanca },
              ]}
              x="rotulo"
              series={[
                { chave: 'anterior', nome: 'Mês anterior', cor: c.serie[7] },
                { chave: 'atual', nome: nomePeriodo, cor: c.acento },
              ]}
            />
          </Cartao>
        )}
        {tipo === 'ano' && (
          <Cartao titulo="Evolução do património">
            <GraficoSeries dados={evolucao} x="rotulo" series={[{ chave: 'patrimonio', nome: 'Património', cor: c.acento }]} />
          </Cartao>
        )}
      </div>
    </>
  );
}

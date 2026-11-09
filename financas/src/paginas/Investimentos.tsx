import { useMemo, useState } from 'react';
import { CampoEscolha, CampoNumero } from '../componentes/campos';
import { FormAtivo, FormCotacao, FormOperacao, lerCaminho } from '../componentes/FormsInvestimento';
import { GraficoDonut, GraficoSeries, useCores } from '../componentes/graficos';
import { Icone } from '../componentes/icones';
import { Modal, useInteracoes } from '../componentes/janelas';
import { Aviso, Barra, Cartao, Etiqueta, Kpi, NotaSimulacao, Vazio } from '../componentes/ui';
import { data as fmtData, euro, numero, pct, sinal } from '../dominio/formato';
import { CATEGORIAS_ATIVO, NOMES_CATEGORIA_ATIVO, compararAlocacao, resumoCarteira } from '../dominio/investimentos';
import { simularDca } from '../dominio/planeamento';
import type { Ativo, CategoriaAtivo, Operacao } from '../dominio/tipos';
import { nomeConta } from '../estado/derivados';
import { useLoja } from '../estado/loja';

type Sep = 'carteira' | 'operacoes' | 'alocacao' | 'dca';

export default function Investimentos() {
  const [sep, setSep] = useState<Sep>('carteira');
  return (
    <>
      <div className="separadores" role="tablist">
        {(
          [
            ['carteira', 'Carteira'],
            ['operacoes', 'Compras e vendas'],
            ['alocacao', 'Alocação'],
            ['dca', 'Simulador DCA'],
          ] as [Sep, string][]
        ).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={sep === id} onClick={() => setSep(id)}>
            {nome}
          </button>
        ))}
      </div>
      {sep === 'carteira' && <Carteira />}
      {sep === 'operacoes' && <Operacoes />}
      {sep === 'alocacao' && <Alocacao />}
      {sep === 'dca' && <Dca />}
      <p className="nota-simulacao">
        Esta área serve apenas para acompanhar os teus investimentos. A aplicação não executa ordens de compra ou venda, não recomenda produtos e não presta aconselhamento financeiro.
      </p>
    </>
  );
}

function Carteira() {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const r = useMemo(() => resumoCarteira(estado), [estado]);
  const [novoAtivo, setNovoAtivo] = useState(false);
  const [novaOp, setNovaOp] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [aObter, setAObter] = useState(false);
  const fonte = estado.pressupostos.cotacoes;

  const obterCotacoes = async () => {
    setAObter(true);
    let ok = 0;
    const falhas: string[] = [];
    const novos: Record<string, number> = {};
    for (const a of estado.ativos.filter((x) => x.identificador)) {
      try {
        const resp = await fetch(fonte.url.replace('{id}', encodeURIComponent(a.identificador)));
        const v = Number(lerCaminho(await resp.json(), fonte.caminho));
        if (!resp.ok || !Number.isFinite(v) || v <= 0) throw new Error();
        novos[a.id] = v;
        ok++;
      } catch {
        falhas.push(a.nome);
      }
    }
    atualizar((e) => ({ ...e, ativos: e.ativos.map((a) => (novos[a.id] ? { ...a, precos: [...a.precos.filter((p) => p.data !== hoje), { data: hoje, preco: novos[a.id] }] } : a)) }));
    setAObter(false);
    avisar(falhas.length ? `${ok} cotação(ões) atualizada(s). Sem resposta válida: ${falhas.join(', ')}.` : `${ok} cotação(ões) atualizada(s).`);
  };

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Capital investido" valor={euro(r.investido)} detalhe="Custo das unidades detidas, com comissões" />
        <Kpi rotulo="Valor de mercado" valor={euro(r.valor)} />
        <Kpi rotulo="Ganho / perda latente" valor={sinal(r.ganhoLatente)} classeValor={r.ganhoLatente >= 0 ? 'positivo' : 'negativo'} detalhe={r.investido > 0 ? `${pct(r.rentabilidade)} de rentabilidade` : undefined} />
        <Kpi rotulo="Ganho realizado em vendas" valor={sinal(r.realizado)} detalhe={`Comissões pagas: ${euro(r.comissoes)}`} />
      </div>
      <div className="acoes">
        <button type="button" className="primario" onClick={() => setNovoAtivo(true)}>
          <Icone nome="adicionar" /> Ativo
        </button>
        <button type="button" onClick={() => setNovaOp(true)} disabled={!estado.ativos.length}>
          <Icone nome="adicionar" /> Compra ou venda
        </button>
        {fonte.url && (
          <button type="button" onClick={obterCotacoes} disabled={aObter}>
            {aObter ? 'A obter…' : 'Atualizar cotações'}
          </button>
        )}
      </div>
      <Cartao titulo="Posições" subtitulo="Sem cotação introduzida, o valor de mercado usa o preço médio de aquisição.">
        {r.linhas.length ? (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th className="num">Unidades</th>
                  <th className="num">Preço médio</th>
                  <th className="num">Investido</th>
                  <th className="num">Cotação</th>
                  <th className="num">Valor</th>
                  <th className="num">Ganho / perda</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas.map((l) => (
                  <tr key={l.ativo.id} className="clicavel" onClick={() => setDetalhe(l.ativo.id)}>
                    <td>
                      <strong>{l.ativo.nome}</strong>
                      <div className="mais-suave pequeno">
                        {NOMES_CATEGORIA_ATIVO[l.ativo.categoria]}
                        {l.ativo.identificador && ` · ${l.ativo.identificador}`}
                      </div>
                    </td>
                    <td className="num">{numero(l.posicao.quantidade)}</td>
                    <td className="num">{euro(l.posicao.precoMedio)}</td>
                    <td className="num">{euro(l.posicao.custo)}</td>
                    <td className="num">
                      {l.cotacao ? euro(l.cotacao.preco) : '—'}
                      <div className="mais-suave pequeno">{l.cotacao ? fmtData(l.cotacao.data) : 'sem cotação'}</div>
                    </td>
                    <td className="num">{euro(l.valor)}</td>
                    <td className={`num ${l.ganho >= 0 ? 'positivo' : 'negativo'}`}>
                      {sinal(l.ganho)}
                      <div className="pequeno">{pct(l.rentabilidade)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td />
                  <td className="num">{euro(r.investido)}</td>
                  <td />
                  <td className="num">{euro(r.valor)}</td>
                  <td className={`num ${r.ganhoLatente >= 0 ? 'positivo' : 'negativo'}`}>{sinal(r.ganhoLatente)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Vazio acao={<button type="button" className="primario" onClick={() => setNovoAtivo(true)}>Adicionar ativo</button>}>Ainda não registaste investimentos.</Vazio>
        )}
      </Cartao>
      {novoAtivo && <FormAtivo aoFechar={() => setNovoAtivo(false)} />}
      {novaOp && <FormOperacao aoFechar={() => setNovaOp(false)} />}
      {detalhe && <DetalheAtivo ativoId={detalhe} aoFechar={() => setDetalhe(null)} />}
    </>
  );
}

function DetalheAtivo({ ativoId, aoFechar }: { ativoId: string; aoFechar: () => void }) {
  const { estado } = useLoja();
  const ativo = estado.ativos.find((a) => a.id === ativoId);
  const [editar, setEditar] = useState(false);
  const [cotacao, setCotacao] = useState(false);
  const [op, setOp] = useState<Operacao | 'nova' | null>(null);
  if (!ativo) return null;
  const linha = resumoCarteira(estado).linhas.find((l) => l.ativo.id === ativoId);
  return (
    <Modal titulo={ativo.nome} largo aoFechar={aoFechar}>
      <div className="acoes">
        <Etiqueta tom="acento">{NOMES_CATEGORIA_ATIVO[ativo.categoria]}</Etiqueta>
        {ativo.identificador && <Etiqueta>{ativo.identificador}</Etiqueta>}
      </div>
      {linha && (
        <div className="kpis">
          <Kpi rotulo="Unidades" valor={numero(linha.posicao.quantidade)} />
          <Kpi rotulo="Preço médio" valor={euro(linha.posicao.precoMedio)} />
          <Kpi rotulo="Valor" valor={euro(linha.valor)} />
          <Kpi rotulo="Ganho / perda" valor={sinal(linha.ganho)} classeValor={linha.ganho >= 0 ? 'positivo' : 'negativo'} detalhe={pct(linha.rentabilidade)} />
        </div>
      )}
      <div className="acoes">
        <button type="button" className="primario" onClick={() => setOp('nova')}>
          Compra ou venda
        </button>
        <button type="button" onClick={() => setCotacao(true)}>
          Atualizar cotação
        </button>
        <button type="button" onClick={() => setEditar(true)}>
          Editar ativo
        </button>
      </div>
      <h3>Histórico de operações</h3>
      <TabelaOperacoes operacoes={estado.operacoes.filter((o) => o.ativoId === ativoId)} aoEscolher={setOp} />
      {ativo.precos.length > 1 && (
        <>
          <h3>Cotações registadas</h3>
          <GraficoSeries tipo="linha" altura="baixo" dados={ativo.precos.map((p) => ({ rotulo: fmtData(p.data), preco: p.preco }))} x="rotulo" series={[{ chave: 'preco', nome: 'Cotação' }]} />
        </>
      )}
      {editar && <FormAtivo inicial={ativo} aoFechar={() => setEditar(false)} />}
      {cotacao && <FormCotacao ativo={ativo} aoFechar={() => setCotacao(false)} />}
      {op && <FormOperacao inicial={op === 'nova' ? undefined : op} ativoId={ativoId} aoFechar={() => setOp(null)} />}
    </Modal>
  );
}

function TabelaOperacoes({ operacoes, aoEscolher }: { operacoes: Operacao[]; aoEscolher: (o: Operacao) => void }) {
  const { estado } = useLoja();
  const lista = [...operacoes].sort((a, b) => b.data.localeCompare(a.data));
  if (!lista.length) return <Vazio>Sem operações.</Vazio>;
  const nomeAtivo = (id: string) => estado.ativos.find((a: Ativo) => a.id === id)?.nome ?? '—';
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Ativo</th>
            <th>Tipo</th>
            <th className="num">Unidades</th>
            <th className="num">Preço</th>
            <th className="num">Comissões</th>
            <th className="num">Total</th>
            <th>Conta</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((o) => (
            <tr key={o.id} className="clicavel" onClick={() => aoEscolher(o)}>
              <td>{fmtData(o.data)}</td>
              <td>{nomeAtivo(o.ativoId)}</td>
              <td>
                <Etiqueta tom={o.tipo === 'compra' ? 'acento' : 'aviso'}>{o.tipo === 'compra' ? 'Compra' : 'Venda'}</Etiqueta>
              </td>
              <td className="num">{numero(o.quantidade)}</td>
              <td className="num">{euro(o.preco)}</td>
              <td className="num">{euro(o.comissao)}</td>
              <td className="num">{euro(o.quantidade * o.preco + (o.tipo === 'compra' ? o.comissao : -o.comissao))}</td>
              <td>{o.contaId ? nomeConta(estado, o.contaId) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Operacoes() {
  const { estado } = useLoja();
  const [op, setOp] = useState<Operacao | 'nova' | null>(null);
  return (
    <Cartao
      titulo="Compras e vendas"
      acoes={
        <button type="button" className="primario" onClick={() => setOp('nova')} disabled={!estado.ativos.length}>
          <Icone nome="adicionar" /> Operação
        </button>
      }
    >
      {!estado.ativos.length && <Aviso tom="info">Cria primeiro um ativo no separador Carteira.</Aviso>}
      <TabelaOperacoes operacoes={estado.operacoes} aoEscolher={setOp} />
      {op && <FormOperacao inicial={op === 'nova' ? undefined : op} aoFechar={() => setOp(null)} />}
    </Cartao>
  );
}

function Alocacao() {
  const { estado, atualizar } = useLoja();
  const c = useCores();
  const r = useMemo(() => resumoCarteira(estado), [estado]);
  const comp = compararAlocacao(estado, r);
  const soma = CATEGORIAS_ATIVO.reduce((s, k) => s + (estado.alocacaoAlvo[k] ?? 0), 0);
  const definida = soma > 0;
  return (
    <div className="grelha">
      <Cartao titulo="Alocação atual" subtitulo="Por valor de mercado">
        <GraficoDonut fatias={CATEGORIAS_ATIVO.map((k, i) => ({ nome: NOMES_CATEGORIA_ATIVO[k], valor: r.porCategoria[k], cor: c.serie[i] }))} vazio="Sem investimentos registados." />
      </Cartao>
      <Cartao titulo="Alocação pretendida" subtitulo="Definida por ti. A aplicação não sugere nenhuma distribuição.">
        {CATEGORIAS_ATIVO.map((k) => (
          <CampoNumero
            key={k}
            rotulo={NOMES_CATEGORIA_ATIVO[k]}
            sufixo="%"
            min={0}
            max={100}
            valor={estado.alocacaoAlvo[k] ?? 0}
            mudar={(v) => atualizar((e) => ({ ...e, alocacaoAlvo: { ...e.alocacaoAlvo, [k]: v ?? 0 } as Record<CategoriaAtivo, number> }))}
          />
        ))}
        {definida && Math.abs(soma - 100) > 0.01 ? <Aviso>A soma é {numero(soma)} %. Deve ser 100 %.</Aviso> : definida && <Aviso tom="positivo">Soma: 100 %.</Aviso>}
      </Cartao>
      {definida && (
        <Cartao titulo="Atual vs pretendida">
          {comp.map((l, i) => (
            <div className="linha-barra" key={l.categoria}>
              <div className="cabeca">
                <span>{NOMES_CATEGORIA_ATIVO[l.categoria]}</span>
                <span className="num suave">
                  {pct(l.atual)} vs {pct(l.alvo)} · {l.diferencaPp >= 0 ? '+' : ''}
                  {numero(Math.round(l.diferencaPp * 10) / 10)} p.p. ({sinal(l.diferencaValor)})
                </span>
              </div>
              <Barra fracao={l.atual} cor={c.serie[i]} />
              <Barra fracao={l.alvo} cor={c.serie[7]} />
            </div>
          ))}
          <p className="mais-suave pequeno">Barra de cima: atual. Barra de baixo: pretendida.</p>
        </Cartao>
      )}
    </div>
  );
}

function Dca() {
  const { estado, atualizar } = useLoja();
  const c = useCores();
  const p = estado.pressupostos.dca;
  const mudar = (x: Partial<typeof p>) => atualizar((e) => ({ ...e, pressupostos: { ...e.pressupostos, dca: { ...e.pressupostos.dca, ...x } } }));
  const cenarios = (['pessimista', 'intermedio', 'otimista'] as const).map((k) => ({ k, pontos: simularDca({ ...p, taxaAnual: p.taxas[k] }) }));
  const dados = cenarios[0].pontos.map((pt, i) => ({
    rotulo: `Ano ${pt.ano}`,
    investido: pt.investido,
    pessimista: cenarios[0].pontos[i].valor,
    intermedio: cenarios[1].pontos[i].valor,
    otimista: cenarios[2].pontos[i].valor,
  }));
  const final = dados.at(-1);
  const nomes = { pessimista: 'Cenário pessimista', intermedio: 'Cenário intermédio', otimista: 'Cenário otimista' };
  return (
    <>
      <Cartao titulo="Simulador de investimentos periódicos (DCA)" subtitulo="Investir um valor fixo com regularidade.">
        <div className="linha-campos">
          <CampoNumero rotulo="Capital inicial" valor={p.capitalInicial} mudar={(v) => mudar({ capitalInicial: v ?? 0 })} />
          <CampoNumero rotulo="Reforço por período" valor={p.reforco} mudar={(v) => mudar({ reforco: v ?? 0 })} />
          <CampoNumero rotulo="Horizonte" sufixo="anos" valor={p.anos} min={1} max={60} mudar={(v) => v && v >= 1 && v <= 60 && mudar({ anos: Math.round(v) })} />
          <CampoEscolha rotulo="Frequência" valor={p.frequencia} mudar={(frequencia) => mudar({ frequencia })} opcoes={[{ valor: 'mensal', nome: 'Mensal' }, { valor: 'trimestral', nome: 'Trimestral' }, { valor: 'anual', nome: 'Anual' }]} />
        </div>
        <div className="linha-campos">
          {(['pessimista', 'intermedio', 'otimista'] as const).map((k) => (
            <CampoNumero key={k} rotulo={`Rentabilidade anual hipotética · ${nomes[k].replace('Cenário ', '')}`} sufixo="%" valor={p.taxas[k]} mudar={(v) => mudar({ taxas: { ...p.taxas, [k]: v ?? 0 } })} />
          ))}
        </div>
        <NotaSimulacao />
      </Cartao>
      <Cartao titulo="Evolução simulada do capital">
        <GraficoSeries
          tipo="linha"
          altura="alto"
          dados={dados}
          x="rotulo"
          series={[
            { chave: 'investido', nome: 'Total investido', cor: c.serie[7], tracejado: true },
            { chave: 'pessimista', nome: nomes.pessimista, cor: c.serie[2] },
            { chave: 'intermedio', nome: nomes.intermedio, cor: c.serie[0] },
            { chave: 'otimista', nome: nomes.otimista, cor: c.serie[1] },
          ]}
        />
        {final && (
          <div className="kpis">
            <Kpi rotulo={`Total investido em ${p.anos} anos`} valor={euro(final.investido)} />
            {(['pessimista', 'intermedio', 'otimista'] as const).map((k) => (
              <Kpi key={k} rotulo={`${nomes[k]} (${numero(p.taxas[k])} %)`} valor={euro(final[k])} detalhe={`${sinal(final[k] - final.investido)} face ao investido`} />
            ))}
          </div>
        )}
        <NotaSimulacao>Simulação com rentabilidades constantes e hipotéticas, sem impostos, comissões nem inflação. Resultados reais podem ser muito diferentes, incluindo perdas.</NotaSimulacao>
      </Cartao>
    </>
  );
}

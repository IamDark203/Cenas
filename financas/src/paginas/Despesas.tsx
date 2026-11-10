import { useMemo, useState } from 'react';
import { CampoEscolha, CampoNumero, CampoTexto } from '../componentes/campos';
import { useInteracoes } from '../componentes/janelas';
import { FormMovimento } from '../componentes/FormMovimento';
import { FormRecorrente } from '../componentes/FormRecorrente';
import { GraficoSeries, useCores } from '../componentes/graficos';
import { Icone } from '../componentes/icones';
import { ListaMovimentos } from '../componentes/ListaMovimentos';
import { Aviso, Barra, Cartao, Etiqueta, Kpi, LinhasResumo, Vazio } from '../componentes/ui';
import { orcamentoLazer, resumoRefeicao } from '../dominio/orcamento';
import { diasNoMes, mesDe, mesesEntre, somarMesesMes } from '../dominio/datas';
import { data as fmtData, euro, euroRedondo, mesCurto, mesLongo, pct } from '../dominio/formato';
import { despesasPorCategoria, nomeCategoria, orcamentoMes, primeiroMes, serieFluxos } from '../dominio/fluxos';
import { NOMES_PERIODICIDADE, equivalenteMensal, ocorrenciasEntre, proximaOcorrencia } from '../dominio/recorrencias';
import type { MeioPagamento, Recorrente } from '../dominio/tipos';
import { NOMES_MEIO, nomeConta, useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

type Separador = 'movimentos' | 'recorrentes' | 'orcamento' | 'lazer' | 'calendario' | 'historico';
const SEPARADORES: [Separador, string][] = [
  ['movimentos', 'Movimentos'],
  ['recorrentes', 'Recorrentes'],
  ['orcamento', 'Orçamento'],
  ['lazer', 'Lazer'],
  ['calendario', 'Calendário'],
  ['historico', 'Histórico'],
];

export default function Despesas() {
  const [sep, setSep] = useState<Separador>('movimentos');
  return (
    <>
      <div className="separadores" role="tablist">
        {SEPARADORES.map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={sep === id} onClick={() => setSep(id)}>
            {nome}
          </button>
        ))}
      </div>
      {sep === 'movimentos' && <Movimentos />}
      {sep === 'recorrentes' && <Recorrentes />}
      {sep === 'orcamento' && <Orcamento />}
      {sep === 'lazer' && <Lazer />}
      {sep === 'calendario' && <Calendario />}
      {sep === 'historico' && <Historico />}
    </>
  );
}

function useMeses() {
  const { estado } = useLoja();
  const { mesRef } = useResumo();
  return useMemo(() => mesesEntre(primeiroMes(estado, mesRef), mesRef).reverse(), [estado, mesRef]);
}

function Movimentos() {
  const { estado } = useLoja();
  const { mesRef } = useResumo();
  const meses = useMeses();
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ mes: mesRef, categoria: '', meio: '', fixa: '', texto: '' });
  const lista = estado.movimentos.filter(
    (m) =>
      m.tipo === 'despesa' &&
      (f.mes === 'tudo' || mesDe(m.data) === f.mes) &&
      (!f.categoria || m.categoriaId === f.categoria) &&
      (!f.meio || m.meio === f.meio) &&
      (!f.fixa || (f.fixa === 'fixa') === m.fixa) &&
      (!f.texto || m.descricao.toLowerCase().includes(f.texto.toLowerCase())),
  );
  const total = lista.reduce((s, m) => s + m.valor, 0);
  return (
    <>
      <Cartao
        titulo="Despesas"
        subtitulo={`${lista.length} movimento(s) · ${euro(total)}`}
        acoes={
          <button type="button" className="primario" onClick={() => setNovo(true)}>
            <Icone nome="adicionar" /> Despesa
          </button>
        }
      >
        <div className="filtros">
          <CampoEscolha rotulo="Mês" valor={f.mes} mudar={(mes) => setF({ ...f, mes })} opcoes={[...meses.map((m) => ({ valor: m, nome: mesLongo(m) })), { valor: 'tudo', nome: 'Todos' }]} />
          <CampoEscolha rotulo="Categoria" valor={f.categoria} mudar={(categoria) => setF({ ...f, categoria })} opcoes={[{ valor: '', nome: 'Todas' }, ...estado.categorias.filter((c) => c.tipo === 'despesa').map((c) => ({ valor: c.id, nome: c.nome }))]} />
          <CampoEscolha rotulo="Meio de pagamento" valor={f.meio} mudar={(meio) => setF({ ...f, meio })} opcoes={[{ valor: '', nome: 'Todos' }, ...(Object.keys(NOMES_MEIO) as MeioPagamento[]).map((k) => ({ valor: k, nome: NOMES_MEIO[k] }))]} />
          <CampoEscolha rotulo="Fixa / variável" valor={f.fixa} mudar={(fixa) => setF({ ...f, fixa })} opcoes={[{ valor: '', nome: 'Todas' }, { valor: 'fixa', nome: 'Fixas' }, { valor: 'variavel', nome: 'Variáveis' }]} />
          <CampoTexto rotulo="Pesquisar" valor={f.texto} mudar={(texto) => setF({ ...f, texto })} exemplo="Descrição" />
        </div>
        <ListaMovimentos movimentos={lista} vazio="Sem despesas com estes filtros." />
      </Cartao>
      {novo && <FormMovimento tipoInicial="despesa" aoFechar={() => setNovo(false)} />}
    </>
  );
}

function Recorrentes() {
  const { estado, hoje } = useLoja();
  const [editar, setEditar] = useState<Recorrente | null>(null);
  const [novo, setNovo] = useState(false);
  const lista = estado.recorrentes.filter((r) => r.tipo !== 'receita');
  const totalMensal = lista.filter((r) => r.ativo && r.tipo === 'despesa' && !r.porDefinir).reduce((s, r) => s + equivalenteMensal(r), 0);
  return (
    <Cartao
      titulo="Despesas e transferências recorrentes"
      subtitulo={`${euro(totalMensal)} por mês em despesas recorrentes ativas`}
      acoes={
        <button type="button" className="primario" onClick={() => setNovo(true)}>
          <Icone nome="adicionar" /> Recorrente
        </button>
      }
    >
      {lista.length ? (
        <div className="lista">
          {lista.map((r) => {
            const prox = r.ativo ? proximaOcorrencia(r, hoje) : null;
            return (
              <div className="item clicavel" key={r.id} role="button" tabIndex={0} onClick={() => setEditar(r)} onKeyDown={(e) => e.key === 'Enter' && setEditar(r)}>
                <span className="avatar">
                  <Icone nome={r.tipo === 'transferencia' ? 'transferir' : r.meio === 'refeicao' ? 'refeicao' : 'repetir'} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="titulo">{r.descricao}</div>
                  <div className="sub">
                    <span>{r.tipo === 'transferencia' ? `${nomeConta(estado, r.contaId)} → ${nomeConta(estado, r.contaDestinoId)}` : nomeCategoria(estado, r.categoriaId)}</span>
                    <span>{NOMES_PERIODICIDADE[r.periodicidade]}</span>
                    {r.meio && <span>{NOMES_MEIO[r.meio]}</span>}
                    {prox && <span>Próximo: {fmtData(prox)}</span>}
                    {r.tipo === 'despesa' && <Etiqueta>{r.fixa ? 'Fixa' : 'Variável'}</Etiqueta>}
                    {!r.automatico && !r.porDefinir && <Etiqueta>Registo manual</Etiqueta>}
                    {r.porDefinir && <Etiqueta tom="aviso">Valor por definir</Etiqueta>}
                    {!r.ativo && <Etiqueta>Inativo</Etiqueta>}
                  </div>
                </div>
                <div className="montante">
                  {r.porDefinir ? '—' : euro(r.valor)}
                  {r.periodicidade !== 'mensal' && !r.porDefinir && <small>{euro(equivalenteMensal(r))}/mês</small>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Vazio>Sem movimentos recorrentes.</Vazio>
      )}
      {(novo || editar) && <FormRecorrente inicial={editar ?? undefined} aoFechar={() => (setNovo(false), setEditar(null))} />}
    </Cartao>
  );
}

function Orcamento() {
  const { estado, atualizar } = useLoja();
  const { mesRef } = useResumo();
  const meses = useMeses();
  const c = useCores();
  const [mes, setMes] = useState(mesRef);
  const linhas = orcamentoMes(estado, mes);
  const todas = estado.categorias.filter((x) => x.tipo === 'despesa');
  const totalOrc = todas.reduce((s, x) => s + (x.orcamento ?? 0), 0);
  const totalReal = linhas.reduce((s, l) => s + l.real, 0);
  const excedidas = linhas.filter((l) => l.excedido);
  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Orçamento previsto" valor={euro(totalOrc)} />
        <Kpi rotulo="Despesa real" valor={euro(totalReal)} classeValor={totalReal > totalOrc ? 'negativo' : ''} detalhe={totalOrc > 0 ? `${pct(totalReal / totalOrc)} do orçamento` : undefined} />
        <Kpi rotulo="Diferença" valor={euro(totalOrc - totalReal)} classeValor={totalOrc - totalReal < 0 ? 'negativo' : 'positivo'} />
      </div>
      {excedidas.length > 0 && <Aviso>Categorias acima do orçamento: {excedidas.map((l) => l.nome).join(', ')}.</Aviso>}
      <Cartao
        titulo="Orçamento por categoria"
        subtitulo="Inclui despesas pagas com cartão-refeição. Os orçamentos são mensais."
        acoes={
          <div style={{ minWidth: 180 }}>
            <CampoEscolha rotulo="Mês" valor={mes} mudar={setMes} opcoes={meses.map((m) => ({ valor: m, nome: mesLongo(m) }))} />
          </div>
        }
      >
        {todas.map((cat) => {
          const l = linhas.find((x) => x.categoriaId === cat.id);
          const real = l?.real ?? 0;
          const orc = cat.orcamento;
          const fr = orc ? real / orc : real > 0 ? 1 : 0;
          return (
            <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 12, alignItems: 'end' }}>
              <div className="linha-barra">
                <div className="cabeca">
                  <span>{cat.nome}</span>
                  <span className={`num ${l?.excedido ? 'negativo' : 'suave'}`}>
                    {euro(real)}
                    {orc != null ? ` de ${euroRedondo(orc)}` : ''}
                  </span>
                </div>
                <Barra fracao={fr} cor={l?.excedido ? c.negativo : fr > 0.85 ? 'var(--aviso)' : c.acento} />
              </div>
              <CampoNumero
                rotulo="Orçamento"
                valor={orc}
                permitirVazio
                mudar={(v) => atualizar((e) => ({ ...e, categorias: e.categorias.map((x) => (x.id === cat.id ? { ...x, orcamento: v } : x)) }))}
              />
            </div>
          );
        })}
      </Cartao>
    </>
  );
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function Calendario() {
  const { estado, hoje } = useLoja();
  const { mesRef } = useResumo();
  const [mes, setMes] = useState(mesRef);
  const [a, m] = mes.split('-').map(Number);
  const n = diasNoMes(a, m);
  const primeiroDiaSemana = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const ocorr = ocorrenciasEntre(estado, `${mes}-01`, `${mes}-${String(n).padStart(2, '0')}`);
  const pontuais = estado.movimentos.filter((x) => mesDe(x.data) === mes && !x.recorrenteId && (x.tipo === 'despesa' || x.tipo === 'receita'));
  const porDia = new Map<string, { nome: string; tipo: string; lancado: boolean }[]>();
  for (const o of ocorr) {
    if (o.recorrente.tipo === 'transferencia') continue;
    const l = porDia.get(o.data) ?? [];
    l.push({ nome: `${o.recorrente.descricao}${o.recorrente.porDefinir ? '' : ` ${euroRedondo(o.valor)}`}`, tipo: o.recorrente.tipo, lancado: o.lancada });
    porDia.set(o.data, l);
  }
  for (const x of pontuais) {
    const l = porDia.get(x.data) ?? [];
    l.push({ nome: `${x.descricao} ${euroRedondo(x.valor)}`, tipo: x.tipo, lancado: true });
    porDia.set(x.data, l);
  }
  const previstos = ocorr.filter((o) => !o.lancada && o.recorrente.tipo === 'despesa' && o.data >= hoje);
  return (
    <>
      <Cartao
        titulo={mesLongo(mes)}
        subtitulo="Pagamentos e recebimentos. Os já registados aparecem esbatidos."
        acoes={
          <>
            <button type="button" className="pequeno" onClick={() => setMes(somarMesesMes(mes, -1))} aria-label="Mês anterior">
              ‹
            </button>
            <button type="button" className="pequeno" onClick={() => setMes(mesDe(hoje))}>
              Hoje
            </button>
            <button type="button" className="pequeno" onClick={() => setMes(somarMesesMes(mes, 1))} aria-label="Mês seguinte">
              ›
            </button>
          </>
        }
      >
        <div className="calendario">
          {DIAS_SEMANA.map((d) => (
            <div className="dia-semana" key={d}>
              {d}
            </div>
          ))}
          {Array.from({ length: primeiroDiaSemana }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: células vazias
            <div className="dia fora" key={`v${i}`} />
          ))}
          {Array.from({ length: n }, (_, i) => {
            const dia = `${mes}-${String(i + 1).padStart(2, '0')}`;
            const ev = porDia.get(dia) ?? [];
            return (
              <div className={`dia${dia === hoje ? ' hoje' : ''}`} key={dia}>
                <span className="n">{i + 1}</span>
                {ev.slice(0, 3).map((e, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: eventos do dia
                  <span key={k} className={`evento ${e.tipo}${e.lancado ? ' lancado' : ''}`} title={e.nome}>
                    {e.nome}
                  </span>
                ))}
                {ev.length > 3 && <span className="mais-suave">+{ev.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </Cartao>
      <Cartao titulo="Pagamentos previstos neste mês" subtitulo={`${euro(previstos.reduce((s, o) => s + o.valor, 0))} por pagar`}>
        {previstos.length ? (
          <div className="lista">
            {previstos.map((o) => (
              <div className="item" key={`${o.recorrente.id}${o.data}`}>
                <span className="avatar">{o.data.slice(8)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="titulo">{o.recorrente.descricao}</div>
                  <div className="sub">{o.recorrente.automatico ? 'Registo automático na data' : 'Regista quando pagares'}</div>
                </div>
                <div className="montante">{o.recorrente.porDefinir ? 'Por definir' : euro(o.valor)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="suave pequeno">Nada previsto até ao fim do mês.</p>
        )}
      </Cartao>
    </>
  );
}

function Historico() {
  const { estado } = useLoja();
  const { mesRef } = useResumo();
  const c = useCores();
  const [n, setN] = useState(12);
  const meses = mesesEntre(somarMesesMes(mesRef, -(n - 1)), mesRef).filter((m) => m >= primeiroMes(estado, mesRef));
  const serie = serieFluxos(estado, meses).map((f) => ({ rotulo: mesCurto(f.mes), dinheiro: f.despesas, refeicao: f.despesasRefeicao, mes: f.mes }));
  const categorias = despesasPorCategoria(estado, meses);
  const total = categorias.reduce((s, x) => s + x.valor, 0);
  return (
    <>
      <Cartao
        titulo="Despesas por mês"
        acoes={<CampoEscolha rotulo="Período" valor={String(n)} mudar={(v) => setN(Number(v))} opcoes={[{ valor: '6', nome: '6 meses' }, { valor: '12', nome: '12 meses' }, { valor: '24', nome: '24 meses' }]} />}
      >
        <GraficoSeries
          tipo="barra"
          dados={serie}
          x="rotulo"
          series={[
            { chave: 'dinheiro', nome: 'Dinheiro', cor: c.negativo, empilhar: 'a' },
            { chave: 'refeicao', nome: 'Cartão-refeição', cor: c.serie[2], empilhar: 'a' },
          ]}
        />
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Dinheiro</th>
                <th className="num">Cartão-refeição</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((s) => (
                <tr key={s.mes}>
                  <td>{mesLongo(s.mes)}</td>
                  <td className="num">{euro(s.dinheiro)}</td>
                  <td className="num">{euro(s.refeicao)}</td>
                  <td className="num">{euro(s.dinheiro + s.refeicao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      <Cartao titulo="Onde gastas mais" subtitulo={`Categorias no período · total ${euro(total)}`}>
        {categorias.length ? (
          categorias.map((cat, i) => (
            <div className="linha-barra" key={cat.id}>
              <div className="cabeca">
                <span>
                  {i + 1}. {cat.nome}
                </span>
                <span className="num suave">
                  {euro(cat.valor)} · {pct(cat.valor / total)}
                </span>
              </div>
              <Barra fracao={cat.valor / categorias[0].valor} cor={c.serie[i % c.serie.length]} />
            </div>
          ))
        ) : (
          <p className="suave pequeno">Sem despesas no período.</p>
        )}
      </Cartao>
    </>
  );
}

function Lazer() {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const c = useCores();
  const l = orcamentoLazer(estado, hoje);
  const ref = resumoRefeicao(estado, hoje);
  const p = l.plano;
  const [pcts, setPcts] = useState<Record<string, number>>(() =>
    Object.fromEntries(l.linhas.map((x) => [x.categoria.id, l.distribuido > 0 ? Math.round(((x.orcamento ?? 0) / l.distribuido) * 1000) / 10 : Math.round(1000 / Math.max(1, l.linhas.length)) / 10])),
  );
  const soma = Object.values(pcts).reduce((s, v) => s + v, 0);
  const restaurantes = l.linhas.find((x) => /restaura/i.test(x.categoria.nome));
  const refeicaoParaRestaurantes = restaurantes && estado.refeicao.finalidadeIds.includes(restaurantes.categoria.id);
  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Orçamento mensal de lazer" valor={euro(l.total)} detalhe="O que sobra depois de despesas, compromissos, reforços e investimentos" />
        <Kpi rotulo="Já gasto este mês" valor={euro(l.gasto)} detalhe="Pago com dinheiro" />
        <Kpi rotulo="Restante" valor={euro(l.restante)} classeValor={l.restante < 0 ? 'negativo' : 'positivo'} />
        <Kpi rotulo="Utilizado" valor={pct(l.utilizacao)} />
      </div>
      <Barra grande fracao={l.utilizacao} cor={l.utilizacao > 1 ? c.negativo : l.utilizacao > 0.85 ? 'var(--aviso)' : c.acento} />
      {p.discricionario < 0 && <Aviso>As despesas, compromissos e reforços planeados já excedem o rendimento em {euro(-p.discricionario)}: não sobra orçamento para lazer.</Aviso>}
      {ref.contas.length > 0 && (
        <Aviso tom="info">
          Cartão-refeição (à parte): saldo de {euro(ref.saldo)}, {euro(Math.max(0, ref.restanteMes))} ainda por usar este mês
          {refeicaoParaRestaurantes ? ', que podem pagar restaurantes sem gastar o orçamento de lazer.' : '. Para o usares em restaurantes, marca “Restaurantes” na finalidade do cartão.'}
        </Aviso>
      )}
      <div className="grelha">
        <Cartao titulo="Como é calculado">
          <LinhasResumo
            linhas={[
              ['Rendimento líquido', euro(p.rendimento)],
              ['− Despesas essenciais', euro(-p.despesasEssenciais)],
              ['− Despesas fixas', euro(-p.despesasFixas)],
              ['− Compromissos financeiros', euro(-p.compromissos)],
              ['− Reforço do fundo de emergência', euro(-p.reforcoFundo)],
              ['− Reforços de objetivos', euro(-p.reforcoObjetivos)],
              ['− Investimentos programados', euro(-p.investimento)],
              ['− Outras poupanças planeadas', euro(-p.outrasPoupancas)],
              ['= Orçamento de lazer', euro(p.discricionario), 'total'],
            ]}
          />
        </Cartao>
        <Cartao titulo="Distribuição por categoria" subtitulo="Escolhe as percentagens e aplica ao orçamento das categorias.">
          {l.linhas.map((x) => (
            <div key={x.categoria.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 96px', gap: 10, alignItems: 'end' }}>
              <div className="linha-barra">
                <div className="cabeca">
                  <span>{x.categoria.nome}</span>
                  <span className="num suave">
                    {euro(x.gastoDinheiro)} de {euro((l.total * (pcts[x.categoria.id] ?? 0)) / 100)}
                    {x.gastoRefeicao > 0 && ` · ${euro(x.gastoRefeicao)} cartão`}
                  </span>
                </div>
                <Barra fracao={l.total > 0 && pcts[x.categoria.id] ? x.gastoDinheiro / ((l.total * pcts[x.categoria.id]) / 100) : 0} cor={c.serie[3]} />
              </div>
              <CampoNumero rotulo="%" sufixo="%" min={0} max={100} valor={pcts[x.categoria.id] ?? 0} mudar={(v) => setPcts({ ...pcts, [x.categoria.id]: v ?? 0 })} />
            </div>
          ))}
          <p className={`pequeno ${Math.abs(soma - 100) > 0.05 ? 'negativo' : 'suave'}`}>Soma: {pct(soma / 100)}</p>
          <button
            type="button"
            className="primario"
            disabled={Math.abs(soma - 100) > 0.05 || l.total <= 0}
            onClick={() => {
              atualizar((e) => ({ ...e, categorias: e.categorias.map((cat) => (pcts[cat.id] != null && cat.lazer ? { ...cat, orcamento: Math.round(l.total * pcts[cat.id]) / 100 } : cat)) }));
              avisar('Orçamentos das categorias de lazer atualizados.');
            }}
          >
            Aplicar ao orçamento
          </button>
        </Cartao>
      </div>
    </>
  );
}

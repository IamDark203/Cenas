import { useMemo, useState } from 'react';
import { CampoCaixa, CampoData, CampoEscolha, CampoNumero, Segmentos } from '../componentes/campos';
import { GraficoSeries, useCores } from '../componentes/graficos';
import { Modal } from '../componentes/janelas';
import { Aviso, Cartao, Etiqueta, Kpi, LinhasResumo, NotaSimulacao, Vazio } from '../componentes/ui';
import {
  liquidezImediata,
  NOMES_PERIODICIDADE_JUROS,
  NOMES_TIPO_PRODUTO,
  nivelAplicavel,
  rankingPersonalizado,
  simular,
  tanbMaxima,
  type BaseProdutos,
  type Produto,
} from '../dominio/bancos';
import { data as fmtData, euro, numero, pct } from '../dominio/formato';
import type { ConfigBancos } from '../dominio/tipos';
import { useLoja } from '../estado/loja';
import { useProdutos } from '../estado/produtos';

type Sep = 'produtos' | 'simulador' | 'comparar' | 'dados';
const nd = 'Não disponível';
const taxa = (v: number | null | undefined) => (v == null ? nd : `${numero(v)} %`);
const valor = (v: number | null | undefined, zero = '—') => (v == null ? nd : v === 0 ? zero : euro(v));
const ESTADO_VERIF = { verificada: ['Verificada', 'positivo'], parcial: ['Parcialmente verificada', 'aviso'], desatualizada: ['Desatualizada', 'negativo'] } as const;

export default function Comparador() {
  const [sep, setSep] = useState<Sep>('produtos');
  const { base, origem, erro } = useProdutos();
  const [ficha, setFicha] = useState<Produto | null>(null);
  return (
    <>
      <div className="separadores" role="tablist">
        {(
          [
            ['produtos', 'Produtos'],
            ['simulador', 'Simulador'],
            ['comparar', 'Comparação personalizada'],
            ['dados', 'Fontes e atualizações'],
          ] as [Sep, string][]
        ).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={sep === id} onClick={() => setSep(id)}>
            {nome}
          </button>
        ))}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {sep === 'produtos' && <Produtos base={base} abrir={setFicha} />}
      {sep === 'simulador' && <Simulador base={base} />}
      {sep === 'comparar' && <Comparar base={base} abrir={setFicha} />}
      {sep === 'dados' && <Dados base={base} origem={origem} />}
      <p className="nota-simulacao">
        Informação recolhida da documentação oficial de cada instituição, com fonte e data de verificação. Condições podem mudar: confirma sempre a FIN em vigor antes de contratar. A aplicação não recomenda nem contrata produtos.
      </p>
      {ficha && <Ficha produto={ficha} base={base} aoFechar={() => setFicha(null)} />}
    </>
  );
}

function useConfig() {
  const { estado, atualizar } = useLoja();
  const cfg = estado.bancos;
  const mudar = (x: Partial<ConfigBancos>) => atualizar((e) => ({ ...e, bancos: { ...e.bancos, ...x } }));
  return { cfg, mudar, imposto: estado.pressupostos.retencaoJuros };
}

function Requisitos({ base }: { base: BaseProdutos }) {
  const { cfg, mudar } = useConfig();
  return (
    <details>
      <summary className="suave pequeno" style={{ cursor: 'pointer' }}>
        Condições que consegues cumprir ({cfg.requisitosCumpridos.length}) e bancos onde já és cliente ({cfg.instituicoesCliente.length})
      </summary>
      <div className="grelha" style={{ marginTop: 10 }}>
        <div className="formulario" style={{ gap: 6 }}>
          {Object.entries(base.requisitos)
            .filter(([id]) => id !== 'conta-ordem-banco')
            .map(([id, texto]) => (
              <CampoCaixa key={id} rotulo={texto} valor={cfg.requisitosCumpridos.includes(id)} mudar={(v) => mudar({ requisitosCumpridos: v ? [...cfg.requisitosCumpridos, id] : cfg.requisitosCumpridos.filter((x) => x !== id) })} />
            ))}
        </div>
        <div className="formulario" style={{ gap: 6 }}>
          {base.instituicoes.map((i) => (
            <CampoCaixa key={i.id} rotulo={`Já sou cliente: ${i.nome}`} valor={cfg.instituicoesCliente.includes(i.id)} mudar={(v) => mudar({ instituicoesCliente: v ? [...cfg.instituicoesCliente, i.id] : cfg.instituicoesCliente.filter((x) => x !== i.id) })} />
          ))}
        </div>
      </div>
    </details>
  );
}

const nomeBanco = (base: BaseProdutos, id: string) => base.instituicoes.find((i) => i.id === id)?.nome ?? id;

type Filtro = 'sem-minimo' | 'sem-domiciliacao' | 'sem-adicionais' | 'reforcos' | 'mensal' | 'garantia' | 'sem-comissoes';
const FILTROS: [Filtro, string][] = [
  ['sem-minimo', 'Sem montante mínimo'],
  ['sem-domiciliacao', 'Sem domiciliação de ordenado'],
  ['sem-adicionais', 'Sem contratar produtos adicionais'],
  ['reforcos', 'Permite reforços'],
  ['mensal', 'Juros mensais'],
  ['garantia', 'Garantia de depósitos'],
  ['sem-comissoes', 'Sem comissões conhecidas'],
];

function Produtos({ base, abrir }: { base: BaseProdutos; abrir: (p: Produto) => void }) {
  const { cfg, imposto } = useConfig();
  const { hoje } = useLoja();
  const [grupo, setGrupo] = useState<'todos' | 'imediata' | 'prazo' | 'promo' | 'condicionado'>('todos');
  const [ordem, setOrdem] = useState<'tanb' | 'liquida' | 'custos' | 'liquidez'>('liquida');
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const capital = 5000;
  const linhas = useMemo(
    () =>
      base.produtos.map((p) => ({
        p,
        sim: simular(p, { capitalInicial: Math.max(capital, p.montantes.abertura ?? 0), reforcoMensal: 0, diaReforco: 1, reforcosExtra: [], meses: 12, dataAbertura: hoje, requisitosCumpridos: cfg.requisitosCumpridos, taxaImposto: imposto, incluirCustoContaOrdem: true, capitalizarOpcional: true }),
      })),
    [base, cfg.requisitosCumpridos, imposto, hoje],
  );
  const visiveis = linhas
    .filter(({ p }) => {
      if (grupo === 'imediata' && !liquidezImediata(p)) return false;
      if (grupo === 'prazo' && p.tipo !== 'deposito-prazo') return false;
      if (grupo === 'promo' && !p.promocao) return false;
      if (grupo === 'condicionado' && p.mobilizacao.perdaJuros === 'nenhuma') return false;
      for (const f of filtros) {
        if (f === 'sem-minimo' && (p.montantes.abertura ?? 0) > 1) return false;
        if (f === 'sem-domiciliacao' && p.niveis.every((n) => n.requisitos.includes('domiciliacao-ordenado'))) return false;
        if (f === 'sem-adicionais' && p.requisitosAcesso.some((r) => !['conta-ordem-banco', 'maior-idade'].includes(r))) return false;
        if (f === 'reforcos' && p.reforcos.permite !== true) return false;
        if (f === 'mensal' && p.juros.periodicidade !== 'mensal') return false;
        if (f === 'garantia' && !p.garantia) return false;
        if (f === 'sem-comissoes' && ((p.custos.manutencaoMensal ?? 1) > 0 || (p.custos.custoContaOrdemMensal ?? 0) > 0)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      ordem === 'tanb'
        ? tanbMaxima(b.p) - tanbMaxima(a.p)
        : ordem === 'liquida'
          ? b.sim.rentabilidadeLiquida - a.sim.rentabilidadeLiquida
          : ordem === 'custos'
            ? a.sim.custos - b.sim.custos
            : Number(liquidezImediata(b.p)) - Number(liquidezImediata(a.p)),
    );
  return (
    <Cartao titulo={`Produtos (${visiveis.length} de ${base.produtos.length})`} subtitulo={`Rentabilidade líquida estimada a 12 meses com ${euro(capital)} (ou o mínimo do produto) e as condições que indicaste.`}>
      <Segmentos
        rotulo="Tipo"
        valor={grupo}
        mudar={setGrupo}
        opcoes={[
          { valor: 'todos', nome: 'Todos' },
          { valor: 'imediata', nome: 'Mobilização imediata' },
          { valor: 'prazo', nome: 'Depósitos a prazo' },
          { valor: 'promo', nome: 'Promocionais' },
          { valor: 'condicionado', nome: 'Capital condicionado' },
        ]}
      />
      <div className="filtros">
        <CampoEscolha rotulo="Ordenar por" valor={ordem} mudar={setOrdem} opcoes={[{ valor: 'liquida', nome: 'Rentabilidade líquida' }, { valor: 'tanb', nome: 'TANB mais elevada' }, { valor: 'custos', nome: 'Menores custos' }, { valor: 'liquidez', nome: 'Maior liquidez' }]} />
      </div>
      <div className="acoes">
        {FILTROS.map(([id, nome]) => (
          <button key={id} type="button" className={`pequeno${filtros.includes(id) ? ' primario' : ''}`} onClick={() => setFiltros(filtros.includes(id) ? filtros.filter((x) => x !== id) : [...filtros, id])}>
            {nome}
          </button>
        ))}
      </div>
      <Requisitos base={base} />
      {visiveis.length ? (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Banco · Produto</th>
                <th className="num">TANB</th>
                <th className="num">TANL</th>
                <th className="num">Rent. líquida</th>
                <th className="num">Mínimo</th>
                <th className="num">Máx. remunerado</th>
                <th>Juros</th>
                <th>Liquidez</th>
                <th>Comissões</th>
                <th>Requisitos</th>
                <th>Atualização</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(({ p, sim }) => {
                const n = nivelAplicavel(p, cfg.requisitosCumpridos);
                const tanb = n ? n.escaloes.find((e) => e.tanb > 0)?.tanb ?? n.escaloes[0]?.tanb : null;
                const [ev, tom] = ESTADO_VERIF[p.verificacao.estado];
                return (
                  <tr key={p.id} className="clicavel" onClick={() => abrir(p)}>
                    <td>
                      <strong>{p.nome}</strong>
                      <div className="mais-suave pequeno">
                        {nomeBanco(base, p.instituicaoId)} · {NOMES_TIPO_PRODUTO[p.tipo]}
                      </div>
                      {p.promocao && <Etiqueta tom="aviso">Promoção: {numero(p.promocao.escaloes[0]?.tanb ?? 0)} % durante {p.promocao.meses ?? '?'} meses</Etiqueta>}
                    </td>
                    <td className="num">
                      {tanb == null ? (p.promocao ? 'Após promoção: n.d.' : nd) : `${numero(tanb)} %`}
                      {p.niveis.length > 1 && <div className="mais-suave pequeno">até {numero(tanbMaxima(p))} %</div>}
                    </td>
                    <td className="num">{taxa(n?.tanl)}</td>
                    <td className="num">{pct(sim.rentabilidadeLiquida)}</td>
                    <td className="num">{valor(p.montantes.abertura)}</td>
                    <td className="num">{p.montantes.maximoRemunerado == null ? 'Sem limite indicado' : euro(p.montantes.maximoRemunerado)}</td>
                    <td>{NOMES_PERIODICIDADE_JUROS[p.juros.periodicidade]}</td>
                    <td>
                      <Etiqueta tom={liquidezImediata(p) ? 'positivo' : 'aviso'}>{liquidezImediata(p) ? 'Imediata' : p.mobilizacao.perdaJuros === 'ate-30-dias' ? 'Perde até 30 dias de juros' : 'Perde juros'}</Etiqueta>
                    </td>
                    <td className="pequeno">{p.custos.manutencaoMensal == null ? nd : p.custos.manutencaoMensal + (p.custos.custoContaOrdemMensal ?? 0) > 0 ? `${euro(p.custos.manutencaoMensal + (p.custos.custoContaOrdemMensal ?? 0))}/mês` : 'Sem comissões'}</td>
                    <td className="pequeno">{p.requisitosAcesso.map((r) => base.requisitos[r] ?? r).join('; ') || '—'}</td>
                    <td>
                      <Etiqueta tom={tom}>{ev}</Etiqueta>
                      <div className="mais-suave pequeno">{fmtData(p.verificacao.ultima)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Vazio>Nenhum produto cumpre os filtros escolhidos.</Vazio>
      )}
    </Cartao>
  );
}

function Ficha({ produto: p, base, aoFechar }: { produto: Produto; base: BaseProdutos; aoFechar: () => void }) {
  const inst = base.instituicoes.find((i) => i.id === p.instituicaoId);
  const [ev, tom] = ESTADO_VERIF[p.verificacao.estado];
  return (
    <Modal titulo={`${p.nome} · ${inst?.nome ?? ''}`} largo aoFechar={aoFechar}>
      <div className="acoes">
        <Etiqueta tom="acento">{NOMES_TIPO_PRODUTO[p.tipo]}</Etiqueta>
        <Etiqueta tom={tom}>{ev} a {fmtData(p.verificacao.ultima)}</Etiqueta>
        <Etiqueta>{p.estado === 'comercializado' ? 'Comercializado' : p.estado}</Etiqueta>
      </div>
      <p className="suave">{p.descricao}</p>
      <div className="grelha">
        <Cartao titulo="Taxas">
          {p.promocao && <Aviso>Taxa promocional (não permanente): {p.promocao.descricao}</Aviso>}
          {p.niveis.map((n) => (
            <div key={n.nome} className="formulario" style={{ gap: 4 }}>
              <strong>{n.nome}</strong>
              {n.escaloes.map((e) => (
                <span key={`${e.de}`} className="num">
                  {e.ate == null ? `A partir de ${euro(e.de)}` : `${euro(e.de)} a ${euro(e.ate)}`}: TANB {numero(e.tanb)} %
                </span>
              ))}
              {n.tanl != null && <span className="suave pequeno">TANL indicada: {numero(n.tanl)} %</span>}
              {n.descricao && <span className="suave pequeno">{n.descricao}</span>}
            </div>
          ))}
          {!p.niveis.length && !p.promocao && <p>{nd}</p>}
          <LinhasResumo linhas={[['Regime', p.regimeTaxa ?? nd], ['TAEL', taxa(p.tael)]]} />
        </Cartao>
        <Cartao titulo="Montantes e reforços">
          <LinhasResumo
            linhas={[
              ['Mínimo de abertura', valor(p.montantes.abertura, 'Sem mínimo')],
              ['Mínimo de permanência', valor(p.montantes.permanencia, 'Sem mínimo')],
              ['Máximo permitido', p.montantes.maximo == null ? 'Não indicado' : euro(p.montantes.maximo)],
              ['Máximo remunerado', p.montantes.maximoRemunerado == null ? 'Não indicado' : euro(p.montantes.maximoRemunerado)],
              ['Reforços', p.reforcos.permite == null ? nd : p.reforcos.permite ? 'Permitidos' : 'Não permitidos'],
              ['Reforço mínimo', valor(p.reforcos.minimo)],
            ]}
          />
          {p.reforcos.descricao && <p className="suave pequeno">{p.reforcos.descricao}</p>}
          {p.prazo && <p className="pequeno">Prazo: {p.prazo.meses ? `${p.prazo.meses} meses` : `${p.prazo.dias} dias`} · renovação {p.prazo.renovacao === 'unica' ? `única (TANB ${numero(p.prazo.tanbRenovacao ?? 0)} %)` : p.prazo.renovacao === 'automatica' ? 'automática' : 'sem renovação'}</p>}
        </Cartao>
        <Cartao titulo="Juros">
          <LinhasResumo
            linhas={[
              ['Base de cálculo', p.juros.baseDias ? `Atual/${p.juros.baseDias}` : nd],
              ['Periodicidade de pagamento', NOMES_PERIODICIDADE_JUROS[p.juros.periodicidade]],
              ['Data de pagamento', p.juros.regraData ?? nd],
              ['Capitalização', p.juros.capitaliza == null ? nd : p.juros.capitaliza === 'opcional' ? 'Opcional' : p.juros.capitaliza ? 'Sim' : 'Não (pagos noutra conta)'],
              ['Juros creditados em', p.juros.destino ?? nd],
            ]}
          />
          {p.juros.calculo && <p className="suave pequeno">{p.juros.calculo}</p>}
        </Cartao>
        <Cartao titulo="Movimentação">
          <Etiqueta tom={liquidezImediata(p) ? 'positivo' : 'aviso'}>{liquidezImediata(p) ? 'Mobilização imediata sem penalização' : 'Mobilização com perda de juros'}</Etiqueta>
          <p className="suave pequeno">{p.mobilizacao.descricao}</p>
          <LinhasResumo linhas={[['Pré-aviso', p.mobilizacao.preAvisoDias == null ? nd : p.mobilizacao.preAvisoDias ? `${p.mobilizacao.preAvisoDias} dias` : 'Não']]} />
        </Cartao>
        <Cartao titulo="Custos e comissões">
          <LinhasResumo
            linhas={[
              ['Abertura', valor(p.custos.abertura, 'Sem custo')],
              ['Manutenção (mensal)', valor(p.custos.manutencaoMensal, 'Sem custo')],
              ['Encerramento', valor(p.custos.encerramento, 'Sem custo')],
              ['Conta à ordem obrigatória', p.custos.contaOrdemObrigatoria == null ? nd : p.custos.contaOrdemObrigatoria ? 'Sim' : 'Não'],
              ['Custo da conta à ordem (mensal)', valor(p.custos.custoContaOrdemMensal, 'Sem custo')],
            ]}
          />
          {p.custos.notas && <p className="suave pequeno">{p.custos.notas}</p>}
        </Cartao>
        <Cartao titulo="Elegibilidade, fiscalidade e garantia">
          <p className="pequeno">{p.publicoAlvo ?? nd}</p>
          <p className="pequeno">Requisitos: {p.requisitosAcesso.map((r) => base.requisitos[r] ?? r).join('; ') || 'Nenhum indicado'}</p>
          <p className="pequeno suave">Fiscalidade: {p.fiscal ?? nd}</p>
          {p.garantia ? (
            <LinhasResumo
              linhas={[
                ['Sistema', p.garantia.sistema],
                ['Limite', p.garantia.limite ? euro(p.garantia.limite) : nd],
                ['Entidade', p.garantia.entidade],
                ['País', p.garantia.pais],
              ]}
            />
          ) : (
            <p>{nd}</p>
          )}
          {p.garantia?.notas && <p className="pequeno" style={{ color: 'var(--aviso)' }}>{p.garantia.notas}</p>}
        </Cartao>
      </div>
      <Cartao titulo="Fontes e rastreabilidade">
        {p.fontes.map((f) => (
          <p key={f.url} className="pequeno">
            {f.tipo}: <a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a>
            {f.vigorDesde && ` · em vigor desde ${fmtData(f.vigorDesde)}`}
          </p>
        ))}
        <LinhasResumo
          linhas={[
            ['Última verificação', fmtData(p.verificacao.ultima)],
            ['Próxima verificação prevista', fmtData(p.verificacao.proxima)],
            ['Estado da informação', ev],
          ]}
        />
        {p.verificacao.notas && <p className="suave pequeno">{p.verificacao.notas}</p>}
        {p.historico.length > 0 && (
          <>
            <h3>Histórico de condições</h3>
            {p.historico.map((h) => (
              <p key={h.data + h.descricao} className="pequeno">
                {fmtData(h.data)}: {h.descricao}
              </p>
            ))}
          </>
        )}
      </Cartao>
    </Modal>
  );
}

function Simulador({ base }: { base: BaseProdutos }) {
  const { cfg, imposto } = useConfig();
  const { hoje } = useLoja();
  const c = useCores();
  const [id, setId] = useState(base.produtos[0]?.id ?? '');
  const [capital, setCapital] = useState<number | null>(5000);
  const [reforco, setReforco] = useState<number | null>(100);
  const [dia, setDia] = useState<number | null>(1);
  const [meses, setMeses] = useState<number | null>(12);
  const [abertura, setAbertura] = useState(hoje);
  const [extra, setExtra] = useState<{ data: string; valor: number | null }>({ data: hoje, valor: null });
  const [extras, setExtras] = useState<{ data: string; valor: number }[]>([]);
  const [contaOrdem, setContaOrdem] = useState(true);
  const [capitalizar, setCapitalizar] = useState(true);
  const p = base.produtos.find((x) => x.id === id);
  const prm = (r: number, m: number) => ({
    capitalInicial: capital ?? 0,
    reforcoMensal: r,
    diaReforco: Math.min(28, Math.max(1, Math.round(dia ?? 1))),
    reforcosExtra: extras,
    meses: m,
    dataAbertura: abertura,
    requisitosCumpridos: cfg.requisitosCumpridos,
    taxaImposto: imposto,
    incluirCustoContaOrdem: contaOrdem,
    capitalizarOpcional: capitalizar,
  });
  const m = Math.min(120, Math.max(1, Math.round(meses ?? 12)));
  const r = p ? simular(p, prm(reforco ?? 0, m)) : null;
  const comparacao = p
    ? [0, reforco ?? 0, (reforco ?? 0) * 2].filter((v, i, l) => l.indexOf(v) === i).map((rf) => ({ rf, porHorizonte: [6, 12, 24].map((h) => simular(p, prm(rf, h))) }))
    : [];
  return (
    <>
      <Cartao titulo="Simulador de rentabilidade e reforços" subtitulo="Usa as regras do produto escolhido: escalões, limites, promoções, base de dias, datas de pagamento, capitalização, comissões e impostos.">
        <CampoEscolha rotulo="Produto" valor={id} mudar={setId} opcoes={base.produtos.map((x) => ({ valor: x.id, nome: `${nomeBanco(base, x.instituicaoId)} · ${x.nome}` }))} />
        <div className="linha-campos">
          <CampoNumero rotulo="Capital inicial" valor={capital} mudar={setCapital} />
          <CampoNumero rotulo="Reforço mensal" valor={reforco} mudar={setReforco} />
          <CampoNumero rotulo="Dia do reforço" sufixo="" min={1} max={28} valor={dia} mudar={setDia} />
          <CampoNumero rotulo="Prazo de permanência" sufixo="meses" min={1} max={120} valor={meses} mudar={setMeses} />
          <CampoData rotulo="Data de abertura" valor={abertura} mudar={(d) => d && setAbertura(d)} />
        </div>
        <div className="linha-campos">
          <CampoData rotulo="Reforço adicional: data" valor={extra.data} mudar={(d) => d && setExtra({ ...extra, data: d })} />
          <CampoNumero rotulo="Valor" valor={extra.valor} permitirVazio mudar={(v) => setExtra({ ...extra, valor: v })} />
          <button type="button" style={{ alignSelf: 'end' }} disabled={!extra.valor || extra.valor <= 0} onClick={() => (setExtras([...extras, { data: extra.data, valor: extra.valor ?? 0 }]), setExtra({ ...extra, valor: null }))}>
            Adicionar reforço
          </button>
        </div>
        {extras.length > 0 && (
          <div className="acoes">
            {extras.map((x, i) => (
              <button key={`${x.data}${i}`} type="button" className="pequeno" onClick={() => setExtras(extras.filter((_, k) => k !== i))}>
                {fmtData(x.data)}: {euro(x.valor)} ✕
              </button>
            ))}
          </div>
        )}
        <div className="linha-campos">
          <CampoCaixa rotulo="Incluir custo da conta à ordem obrigatória" valor={contaOrdem} mudar={setContaOrdem} />
          {p?.juros.capitaliza === 'opcional' && <CampoCaixa rotulo="Capitalizar os juros" valor={capitalizar} mudar={setCapitalizar} />}
        </div>
        <Requisitos base={base} />
      </Cartao>
      {r && p && (
        <>
          <div className="kpis">
            <Kpi rotulo="Capital depositado" valor={euro(r.capitalInicial + r.totalReforcos)} detalhe={`Inicial ${euro(r.capitalInicial)} + reforços ${euro(r.totalReforcos)}`} />
            <Kpi rotulo="Juros brutos" valor={euro(r.jurosBrutos)} />
            <Kpi rotulo="Impostos sobre juros" valor={euro(r.imposto)} detalhe={`${numero(imposto)} %`} />
            <Kpi rotulo="Comissões" valor={euro(r.custos)} />
            <Kpi rotulo="Juros líquidos" valor={euro(r.jurosLiquidos)} />
            <Kpi rotulo="Ganho líquido" valor={euro(r.ganhoLiquido)} classeValor={r.ganhoLiquido >= 0 ? 'positivo' : 'negativo'} detalhe={`Rentabilidade líquida efetiva ${pct(r.rentabilidadeLiquida)}/ano`} />
            <Kpi rotulo="Capital final estimado" valor={euro(r.capitalFinal)} detalhe="No produto + juros pagos noutra conta − comissões" />
            {r.jurosPerdidos > 0 && <Kpi rotulo="Juros perdidos ao levantar" valor={euro(r.jurosPerdidos)} classeValor="negativo" />}
          </div>
          {r.avisos.map((a) => (
            <Aviso key={a}>{a}</Aviso>
          ))}
          <Cartao titulo="Evolução mensal">
            <GraficoSeries
              tipo="barra"
              dados={r.serie.map((s) => ({ rotulo: s.mes === 0 ? 'Início' : `Mês ${s.mes}`, inicial: r.capitalInicial, reforcos: s.depositado - r.capitalInicial, juros: s.jurosLiquidos }))}
              x="rotulo"
              series={[
                { chave: 'inicial', nome: 'Capital inicial', cor: c.serie[0], empilhar: 'c' },
                { chave: 'reforcos', nome: 'Reforços', cor: c.serie[5], empilhar: 'c' },
                { chave: 'juros', nome: 'Juros líquidos acumulados', cor: c.serie[1], empilhar: 'c' },
              ]}
            />
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="num">Depositado</th>
                    <th className="num">Saldo no produto</th>
                    <th className="num">Juros brutos acum.</th>
                    <th className="num">Impostos acum.</th>
                    <th className="num">Juros líquidos acum.</th>
                    <th className="num">Comissões acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {r.serie.map((s) => (
                    <tr key={s.mes}>
                      <td>{s.mes === 0 ? 'Abertura' : fmtData(s.data)}</td>
                      <td className="num">{euro(s.depositado)}</td>
                      <td className="num">{euro(s.saldo)}</td>
                      <td className="num">{euro(s.jurosBrutos)}</td>
                      <td className="num">{euro(s.imposto)}</td>
                      <td className="num">{euro(s.jurosLiquidos)}</td>
                      <td className="num">{euro(s.custos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
          <Cartao titulo="Comparar reforços e horizontes" subtitulo="Capital final estimado (ganho líquido).">
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reforço mensal</th>
                    <th className="num">6 meses</th>
                    <th className="num">12 meses</th>
                    <th className="num">24 meses</th>
                  </tr>
                </thead>
                <tbody>
                  {comparacao.map((l) => (
                    <tr key={l.rf}>
                      <td>{euro(l.rf)}</td>
                      {l.porHorizonte.map((x, i) => (
                        <td key={i} className="num">
                          {euro(x.capitalFinal)}
                          <div className="mais-suave pequeno">{euro(x.ganhoLiquido)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
          <Cartao titulo="Pressupostos desta estimativa">
            {r.pressupostos.map((x) => (
              <p key={x} className="pequeno suave">
                • {x}
              </p>
            ))}
            <NotaSimulacao>Estimativa com as condições publicadas à data de verificação ({fmtData(p.verificacao.ultima)}). Valores reais podem diferir.</NotaSimulacao>
          </Cartao>
        </>
      )}
    </>
  );
}

const PERGUNTAS: { id: string; texto: string; aplicar: Partial<{ capital: number; reforco: number; meses: number; liquidez: ConfigBancos['liquidez']; semComissoes: boolean; semDomiciliacao: boolean }> }[] = [
  { id: 'q5000', texto: 'Qual me rende mais com 5.000 €?', aplicar: { capital: 5000, reforco: 0, meses: 12 } },
  { id: 'q200', texto: 'Mais vantajosa para reforços de 200 €/mês?', aplicar: { reforco: 200, meses: 12 } },
  { id: 'qsemdom', texto: 'Melhor sem domiciliação de ordenado?', aplicar: { semDomiciliacao: true } },
  { id: 'qcustos', texto: 'Qual tem menos custos?', aplicar: { semComissoes: true } },
  { id: 'qliq', texto: 'Levantar sem penalizações?', aplicar: { liquidez: 'imediata' } },
  { id: 'qfundo', texto: 'Mais adequada ao fundo de emergência?', aplicar: { liquidez: 'imediata', semComissoes: false } },
  { id: 'q12', texto: 'Mais capital líquido ao fim de 12 meses?', aplicar: { meses: 12, liquidez: 'indiferente' } },
];

function Comparar({ base, abrir }: { base: BaseProdutos; abrir: (p: Produto) => void }) {
  const { cfg, mudar, imposto } = useConfig();
  const { hoje } = useLoja();
  const [capital, setCapital] = useState<number | null>(5000);
  const [reforco, setReforco] = useState<number | null>(0);
  const [meses, setMeses] = useState<number | null>(12);
  const [semDomiciliacao, setSemDomiciliacao] = useState(false);
  const cumpridos = semDomiciliacao ? cfg.requisitosCumpridos.filter((r) => r !== 'domiciliacao-ordenado') : cfg.requisitosCumpridos;
  const ranking = rankingPersonalizado(
    base.produtos,
    { capital: capital ?? 0, reforcoMensal: reforco ?? 0, meses: Math.max(1, Math.round(meses ?? 12)), requisitosCumpridos: cumpridos, instituicoesCliente: cfg.instituicoesCliente, liquidez: cfg.liquidez, semComissoes: cfg.semComissoes, taxaImposto: imposto, incluirCustoContaOrdem: cfg.incluirContaOrdem },
    hoje,
  );
  const elegiveis = ranking.filter((l) => !l.excluido);
  return (
    <>
      <Cartao titulo="A tua situação" subtitulo="O ranking simula cada produto com estes valores. A TANB mais alta não é necessariamente a melhor opção.">
        <div className="acoes">
          {PERGUNTAS.map((q) => (
            <button
              key={q.id}
              type="button"
              className="pequeno"
              onClick={() => {
                if (q.aplicar.capital != null) setCapital(q.aplicar.capital);
                if (q.aplicar.reforco != null) setReforco(q.aplicar.reforco);
                if (q.aplicar.meses != null) setMeses(q.aplicar.meses);
                setSemDomiciliacao(!!q.aplicar.semDomiciliacao);
                mudar({ ...(q.aplicar.liquidez ? { liquidez: q.aplicar.liquidez } : {}), ...(q.aplicar.semComissoes != null ? { semComissoes: q.aplicar.semComissoes } : {}) });
              }}
            >
              {q.texto}
            </button>
          ))}
        </div>
        <div className="linha-campos">
          <CampoNumero rotulo="Capital disponível" valor={capital} mudar={setCapital} />
          <CampoNumero rotulo="Reforço mensal" valor={reforco} mudar={setReforco} />
          <CampoNumero rotulo="Prazo de permanência" sufixo="meses" min={1} max={120} valor={meses} mudar={setMeses} />
          <CampoEscolha rotulo="Necessidade de liquidez" valor={cfg.liquidez} mudar={(liquidez) => mudar({ liquidez })} opcoes={[{ valor: 'imediata', nome: 'Imediata, sem perder juros' }, { valor: 'curta', nome: 'Posso esperar pelo vencimento' }, { valor: 'indiferente', nome: 'Indiferente' }]} />
        </div>
        <div className="linha-campos">
          <CampoCaixa rotulo="Só produtos sem comissões conhecidas" valor={cfg.semComissoes} mudar={(semComissoes) => mudar({ semComissoes })} />
          <CampoCaixa rotulo="Incluir custos da conta à ordem obrigatória" valor={cfg.incluirContaOrdem} mudar={(incluirContaOrdem) => mudar({ incluirContaOrdem })} />
          <CampoCaixa rotulo="Sem domiciliar o ordenado" valor={semDomiciliacao} mudar={setSemDomiciliacao} />
        </div>
        <Requisitos base={base} />
      </Cartao>
      <Cartao titulo={`Ranking personalizado (${elegiveis.length} elegíveis)`}>
        <div className="lista">
          {ranking.map((l, i) => {
            const r = l.resultado;
            return (
              <div className="item clicavel" key={r.produto.id} role="button" tabIndex={0} onClick={() => abrir(r.produto)} onKeyDown={(e) => e.key === 'Enter' && abrir(r.produto)} style={l.excluido ? { opacity: 0.55 } : undefined}>
                <span className="avatar">{l.excluido ? '—' : i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="titulo">
                    {r.produto.nome} · {nomeBanco(base, r.produto.instituicaoId)}
                  </div>
                  <div className="sub">{l.excluido ? <span className="negativo">{l.excluido}</span> : l.fatores.map((f) => <span key={f}>{f}</span>)}</div>
                </div>
                <div className="montante">
                  {euro(r.capitalFinal)}
                  <small>
                    ganho líquido {euro(r.ganhoLiquido)}
                    {r.jurosPerdidos > 0 ? ` · perde ${euro(r.jurosPerdidos)} se levantar` : ''}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
        <NotaSimulacao>Classificação por capital líquido final estimado (juros − impostos − comissões), depois de excluir produtos que não cumprem a tua situação. Fatores explicados em cada linha.</NotaSimulacao>
      </Cartao>
    </>
  );
}

function Dados({ base, origem }: { base: BaseProdutos; origem: 'incluida' | 'servidor' }) {
  const { estado, atualizar } = useLoja();
  const { aAtualizar, atualizarAgora } = useProdutos();
  const alt = estado.bancos.alteracoes;
  return (
    <>
      <Cartao
        titulo="Atualização dos dados"
        acoes={
          <button type="button" className="primario" disabled={aAtualizar} onClick={atualizarAgora}>
            {aAtualizar ? 'A verificar…' : 'Verificar atualizações'}
          </button>
        }
      >
        <LinhasResumo
          linhas={[
            ['Base de dados gerada a', fmtData(base.geradoEm)],
            ['Origem dos dados apresentados', origem === 'servidor' ? 'Versão publicada no site' : 'Cópia incluída na aplicação'],
            ['Última consulta neste dispositivo', fmtData(estado.bancos.ultimaConsulta)],
            ['Produtos', String(base.produtos.length)],
          ]}
        />
        <p className="suave pequeno">
          Um processo automático semanal volta a descarregar a documentação oficial de cada produto (FIN e páginas oficiais), deteta alterações nos documentos, guarda o histórico e marca como “desatualizada” a informação que precisa de nova validação. Informação confirmada nunca é substituída por dados incompletos.
        </p>
      </Cartao>
      <Cartao titulo="Cobertura por instituição">
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Instituição</th>
                <th>País / garantia</th>
                <th>Cobertura</th>
                <th className="num">Produtos</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              {base.instituicoes.map((i) => (
                <tr key={i.id}>
                  <td>
                    <a href={i.site} target="_blank" rel="noreferrer">
                      {i.nome}
                    </a>
                    <div className="mais-suave pequeno">{i.entidade}</div>
                  </td>
                  <td>{i.pais}</td>
                  <td>
                    <Etiqueta tom={i.cobertura === 'verificada' ? 'positivo' : i.cobertura === 'parcial' ? 'aviso' : 'negativo'}>{i.cobertura === 'verificada' ? 'Recolha automática' : i.cobertura === 'parcial' ? 'Incompleta' : 'Sem dados'}</Etiqueta>
                  </td>
                  <td className="num">{base.produtos.filter((p) => p.instituicaoId === i.id).length}</td>
                  <td className="pequeno suave">{i.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      <Cartao titulo={`Alterações detetadas (${alt.length})`} acoes={alt.length > 0 && <button type="button" className="pequeno" onClick={() => atualizar((e) => ({ ...e, bancos: { ...e.bancos, alteracoes: [] } }))}>Limpar</button>}>
        {alt.length ? (
          alt.map((a) => (
            <Aviso key={a.id} tom={a.impacto != null && a.impacto < 0 ? 'aviso' : 'info'}>
              <strong>{a.texto}</strong>
              <div className="pequeno">
                {fmtData(a.data)}
                {a.impacto != null && ` · impacto estimado na remuneração anual líquida: ${a.impacto >= 0 ? '+' : ''}${euro(a.impacto)}`}
              </div>
            </Aviso>
          ))
        ) : (
          <Vazio>Sem alterações desde a primeira consulta. As alterações de taxas, campanhas, comissões, limites ou condições aparecem aqui e nos Alertas.</Vazio>
        )}
      </Cartao>
    </>
  );
}

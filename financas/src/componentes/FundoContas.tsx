import { useState } from 'react';
import { alocacoesConta, fundoNaConta, reforcarFundo, validarAlteracao } from '../dominio/alocacoes';
import { euro, numero } from '../dominio/formato';
import { jurosEstimados, NOMES_TIPO_CONTA, saldoConta } from '../dominio/saldos';
import { adequadoFundo, simular } from '../dominio/bancos';
import { useLoja } from '../estado/loja';
import { useProdutos } from '../estado/produtos';
import { CampoEscolha, CampoNumero } from './campos';
import { Cartao, Etiqueta, NotaSimulacao } from './ui';

const LIQUIDEZ: Record<string, string> = {
  ordem: 'Imediata',
  poupanca: 'Normalmente imediata (confirma as condições)',
  prazo: 'Condicionada ao prazo',
  outra: 'Depende do produto',
};

/** Fundo de emergência por conta: saldo, parcela alocada, rendimento e liquidez de cada parcela. */
export function FundoNasContas() {
  const { estado, atualizar, hoje } = useLoja();
  const [editar, setEditar] = useState<{ contaId: string; valor: number | null } | null>(null);
  const ret = estado.pressupostos.retencaoJuros;
  const contas = estado.contas.filter((c) => !c.arquivada && ['ordem', 'poupanca', 'prazo', 'outra'].includes(c.tipo));
  const linhas = contas.map((c) => {
    const saldo = saldoConta(estado, c, hoje);
    const fe = fundoNaConta(estado, c.id, saldo);
    const aloc = estado.alocacoes.filter((a) => a.contaId === c.id && a.tipo === 'fundo').reduce((s, a) => s + a.valor, 0);
    const livre = alocacoesConta(estado, c.id, saldo).naoAtribuido;
    // Rendimento da parcela: parte do fundo dentro do capital remunerado × TANL.
    const j = jurosEstimados(c, saldo, ret);
    const rendimento = j && saldo > 0 ? j.liquido * (Math.min(fe, j.base) / Math.max(saldo, 0.01)) : 0;
    return { c, saldo, fe, aloc, livre, rendimento, tanl: j?.tanl ?? null };
  });
  const total = linhas.reduce((s, l) => s + l.fe, 0);
  const atual = editar ? linhas.find((l) => l.c.id === editar.contaId) : undefined;
  const erro = editar && atual ? validarAlteracao(atual.livre, atual.aloc, editar.valor ?? 0) : null;

  return (
    <Cartao titulo="Onde está o fundo" subtitulo={`${euro(total)} alocados ao fundo. O saldo bancário de cada conta não muda.`}>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th className="num">Saldo bancário</th>
              <th className="num">Alocado ao fundo</th>
              <th className="num">Não atribuído</th>
              <th className="num">Rendimento anual da parcela</th>
              <th>Liquidez</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.c.id}>
                <td>
                  <strong>{l.c.nome}</strong>
                  <div className="mais-suave pequeno">
                    {l.c.instituicao || NOMES_TIPO_CONTA[l.c.tipo]}
                    {l.tanl != null && ` · TANL ${numero(Math.round(l.tanl * 1000) / 1000)} %`}
                  </div>
                </td>
                <td className="num">{euro(l.saldo)}</td>
                <td className="num">{euro(l.fe)}</td>
                <td className={`num ${l.livre < 0 ? 'negativo' : ''}`}>{euro(l.livre)}</td>
                <td className="num">{l.fe > 0 ? `${euro(l.rendimento)} líquidos` : '—'}</td>
                <td>
                  <Etiqueta tom={l.c.tipo === 'prazo' ? 'aviso' : undefined}>{LIQUIDEZ[l.c.tipo]}</Etiqueta>
                </td>
                <td>
                  <button type="button" className="pequeno" onClick={() => setEditar({ contaId: l.c.id, valor: l.aloc })}>
                    Ajustar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editar && atual && (
        <div className="formulario cartao">
          <CampoNumero
            rotulo={`Valor do fundo em ${atual.c.nome}`}
            valor={editar.valor}
            mudar={(valor) => setEditar({ ...editar, valor })}
            dica={`Máximo: ${euro(atual.aloc + Math.max(0, atual.livre))} (saldo ${euro(atual.saldo)} menos outras alocações).`}
          />
          {erro && <p className="negativo pequeno">{erro}</p>}
          {atual.c.tipo === 'prazo' && <p className="pequeno" style={{ color: 'var(--aviso)' }}>Depósitos a prazo podem ter penalizações por mobilização antecipada: confirma se o dinheiro fica acessível numa emergência.</p>}
          <div className="acoes">
            <button type="button" onClick={() => setEditar(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="primario"
              disabled={!!erro}
              onClick={() => {
                atualizar((e) => reforcarFundo(e, atual.c.id, (editar.valor ?? 0) - atual.aloc, hoje, 'Ajuste manual'));
                setEditar(null);
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </Cartao>
  );
}

/** Módulo 15: produtos adequados para guardar o fundo e comparação com o rendimento atual. */
export function ProdutosParaFundo({ capital, rendimentoAtual }: { capital: number; rendimentoAtual: number }) {
  const { estado, hoje } = useLoja();
  const { base } = useProdutos();
  const [divisao, setDivisao] = useState<{ id: string; valor: number | null }[]>([]);
  // Se a taxa registada numa conta tua corresponde à taxa bonificada do produto ligado, as condições dessa taxa já são cumpridas.
  const inferidos = new Set(estado.bancos.requisitosCumpridos);
  const atuais = new Set<string>();
  for (const c of estado.contas) {
    const p = base.produtos.find((x) => x.id === c.produtoId);
    if (!p) continue;
    if (fundoNaConta(estado, c.id, saldoConta(estado, c, hoje)) > 0) atuais.add(p.id);
    for (const n of p.niveis) if (n.requisitos.length && c.tanb != null && n.escaloes.some((e) => e.tanb === c.tanb)) n.requisitos.forEach((r) => inferidos.add(r));
  }
  const cumpridos = [...inferidos];
  const semCondicoes = cumpridos.length === estado.bancos.requisitosCumpridos.length && !estado.bancos.requisitosCumpridos.length;
  const prm = (v: number) => ({ capitalInicial: v, reforcoMensal: 0, diaReforco: 1, reforcosExtra: [], meses: 12, dataAbertura: hoje, requisitosCumpridos: cumpridos, taxaImposto: estado.pressupostos.retencaoJuros, incluirCustoContaOrdem: estado.bancos.incluirContaOrdem, capitalizarOpcional: true });
  const nomeBanco = (id: string) => base.instituicoes.find((i) => i.id === id)?.nome ?? id;
  const linhas = base.produtos
    .map((p) => ({ p, a: adequadoFundo(p), r: simular(p, prm(capital)) }))
    .sort((x, y) => Number(y.a.adequado) - Number(x.a.adequado) || y.r.ganhoLiquido - x.r.ganhoLiquido);
  const adequados = linhas.filter((l) => l.a.adequado && l.r.elegivel);
  const somaDivisao = divisao.reduce((s, d) => s + (d.valor ?? 0), 0);
  const ganhoDivisao = divisao.reduce((s, d) => {
    const p = base.produtos.find((x) => x.id === d.id);
    return p && d.valor ? s + simular(p, prm(d.valor)).ganhoLiquido : s;
  }, 0);
  if (capital <= 0) return null;
  return (
    <Cartao titulo="Onde guardar o fundo" subtitulo={`Produtos da base com mobilização imediata e sem penalizações, simulados com ${euro(capital)} durante 12 meses e as condições que indicaste no comparador.`}>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Ganho líquido (12 meses)</th>
              <th className="num">vs. atual</th>
              <th>Liquidez e condições</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ p, a, r }) => (
              <tr key={p.id} style={a.adequado && r.elegivel ? undefined : { opacity: 0.55 }}>
                <td>
                  <strong>{p.nome}</strong> {atuais.has(p.id) && <Etiqueta tom="acento">Conta atual</Etiqueta>}
                  <div className="mais-suave pequeno">{nomeBanco(p.instituicaoId)} · garantia {p.garantia?.pais ?? 'n.d.'}</div>
                </td>
                <td className="num">{euro(r.ganhoLiquido)}</td>
                <td className={`num ${r.ganhoLiquido - rendimentoAtual >= 0 ? 'positivo' : 'negativo'}`}>{r.ganhoLiquido - rendimentoAtual >= 0 ? '+' : ''}{euro(r.ganhoLiquido - rendimentoAtual)}</td>
                <td className="pequeno">
                  {a.adequado ? <Etiqueta tom="positivo">Mobilização imediata</Etiqueta> : <Etiqueta tom="negativo">Não adequado: {a.motivos.join('; ')}</Etiqueta>}
                  {!r.elegivel && <div className="negativo">Condições de acesso não indicadas como cumpridas</div>}
                  {p.montantes.maximoRemunerado != null && capital > p.montantes.maximoRemunerado && <div>Só remunera até {euro(p.montantes.maximoRemunerado)}</div>}
                  {p.promocao && <div>Inclui taxa promocional temporária</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {semCondicoes && <p className="pequeno" style={{ color: 'var(--aviso)' }}>As taxas bonificadas (ex.: com domiciliação do ordenado) só entram quando indicas no Comparador bancário as condições que cumpres. Até lá usa-se a taxa base.</p>}
      {cumpridos.length > estado.bancos.requisitosCumpridos.length && <p className="suave pequeno">Considerado que cumpres as condições da taxa que tens registada na tua conta.</p>}
      <p className="suave pequeno">Rendimento atual estimado do fundo: {euro(rendimentoAtual)} líquidos por ano. Depósitos a prazo com perda de juros não são indicados para dinheiro que tem de estar disponível de imediato.</p>
      <details>
        <summary className="suave pequeno" style={{ cursor: 'pointer' }}>Simular a divisão do fundo por vários produtos</summary>
        <div className="formulario" style={{ marginTop: 8 }}>
          {divisao.map((d, i) => (
            <div key={i} className="linha-campos">
              <CampoEscolha rotulo="Produto" valor={d.id} mudar={(id) => setDivisao(divisao.map((x, k) => (k === i ? { ...x, id } : x)))} opcoes={adequados.map((l) => ({ valor: l.p.id, nome: `${nomeBanco(l.p.instituicaoId)} · ${l.p.nome}` }))} />
              <CampoNumero rotulo="Valor" valor={d.valor} mudar={(valor) => setDivisao(divisao.map((x, k) => (k === i ? { ...x, valor } : x)))} />
            </div>
          ))}
          <div className="acoes">
            <button type="button" className="pequeno" disabled={!adequados.length || divisao.length >= 3} onClick={() => setDivisao([...divisao, { id: adequados[0].p.id, valor: Math.max(0, capital - somaDivisao) }])}>
              Adicionar parcela
            </button>
          </div>
          {divisao.length > 0 && (
            <p className={`pequeno ${Math.abs(somaDivisao - capital) > 0.5 ? 'negativo' : ''}`}>
              Total dividido: {euro(somaDivisao)} de {euro(capital)} · ganho líquido estimado a 12 meses: <strong>{euro(ganhoDivisao)}</strong> ({ganhoDivisao - rendimentoAtual >= 0 ? '+' : ''}
              {euro(ganhoDivisao - rendimentoAtual)} face ao atual). Todas as parcelas escolhidas permitem mobilização imediata.
            </p>
          )}
        </div>
      </details>
      <NotaSimulacao>Estimativas com as condições publicadas e verificadas na data indicada em cada produto. Não é uma recomendação: confirma as condições junto da instituição.</NotaSimulacao>
    </Cartao>
  );
}

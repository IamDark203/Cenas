import { useState } from 'react';
import { CampoArea, CampoCaixa, CampoData, CampoEscolha, CampoNumero, CampoTexto } from '../componentes/campos';
import { GraficoDonut, useCores } from '../componentes/graficos';
import { Icone } from '../componentes/icones';
import { Modal, useInteracoes } from '../componentes/janelas';
import { Aviso, Barra, Cartao, Etiqueta, Kpi, LinhasResumo, Vazio } from '../componentes/ui';
import { data as fmtData, euro, pct } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { resumoObjetivo, valorAtualObjetivo } from '../dominio/planeamento';
import type { Contribuicao, Objetivo } from '../dominio/tipos';
import { nomeConta, opcoesContas, useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { irPara } from '../navegacao';

const SUGESTOES = ['Compra de automóvel', 'Manutenção automóvel', 'Férias', 'Equipamento fotográfico', 'Compra de casa', 'Formação'];

export default function Objetivos() {
  const { estado, hoje } = useLoja();
  const { atual } = useResumo();
  const c = useCores();
  const [editar, setEditar] = useState<Objetivo | null>(null);
  const [novo, setNovo] = useState<string | null>(null);
  const [contribuir, setContribuir] = useState<Objetivo | null>(null);
  const [historico, setHistorico] = useState<Objetivo | null>(null);
  const totalAlvo = estado.objetivos.reduce((s, o) => s + o.valorAlvo, 0);
  const totalReunido = estado.objetivos.reduce((s, o) => s + valorAtualObjetivo(o), 0);
  const semObjetivo = Math.max(0, atual.poupancas - totalReunido);

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Objetivos ativos" valor={String(estado.objetivos.length)} />
        <Kpi rotulo="Reunido" valor={euro(totalReunido)} detalhe={totalAlvo > 0 ? `${pct(totalReunido / totalAlvo)} do total` : undefined} />
        <Kpi rotulo="Em falta" valor={euro(Math.max(0, totalAlvo - totalReunido))} />
        <Kpi rotulo="Reforços mensais" valor={euro(estado.objetivos.reduce((s, o) => s + o.reforcoMensal, 0))} />
      </div>
      {totalReunido > atual.poupancas + 0.005 && (
        <Aviso>O valor reunido nos objetivos ({euro(totalReunido)}) é superior ao total das poupanças fora do fundo de emergência ({euro(atual.poupancas)}). Confirma os saldos das contas.</Aviso>
      )}

      <div className="grelha">
        <Cartao titulo="Distribuição das poupanças" subtitulo="Os objetivos são reservas dentro das tuas contas.">
          <GraficoDonut
            fatias={[
              ...estado.objetivos.map((o) => ({ nome: o.nome, valor: valorAtualObjetivo(o) })),
              { nome: 'Poupança sem objetivo', valor: semObjetivo, cor: c.serie[7] },
              { nome: 'Fundo de emergência', valor: atual.fundoEmergencia, cor: c.serie[5] },
            ]}
          />
          <button type="button" className="pequeno" onClick={() => irPara('fundo')} style={{ justifySelf: 'start' }}>
            O fundo de emergência tem a sua própria secção
          </button>
        </Cartao>
        <Cartao titulo="Novo objetivo" subtitulo="Podes ter vários em simultâneo.">
          <div className="acoes">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" className="pequeno" onClick={() => setNovo(s)}>
                {s}
              </button>
            ))}
            <button type="button" className="pequeno primario" onClick={() => setNovo('')}>
              <Icone nome="adicionar" /> Outro
            </button>
          </div>
        </Cartao>
      </div>

      {estado.objetivos.length ? (
        <div className="grelha-3">
          {estado.objetivos.map((o) => {
            const r = resumoObjetivo(o, hoje);
            return (
              <Cartao
                key={o.id}
                titulo={o.nome}
                subtitulo={o.dataLimite ? `Até ${fmtData(o.dataLimite)}` : 'Sem data limite'}
                acoes={
                  <button type="button" className="fantasma icone" aria-label={`Editar ${o.nome}`} onClick={() => setEditar(o)}>
                    <Icone nome="editar" />
                  </button>
                }
              >
                <div className="cartao-cabeca">
                  <span className="num" style={{ fontSize: '1.35rem', fontWeight: 680 }}>
                    {euro(r.atual)}
                  </span>
                  <span className="suave num">de {euro(o.valorAlvo)}</span>
                </div>
                <Barra grande fracao={r.progresso} cor={r.atingido ? c.positivo : c.acento} />
                <div className="acoes">
                  <Etiqueta tom={r.atingido ? 'positivo' : r.noRitmo ? 'acento' : 'aviso'}>{r.atingido ? 'Atingido' : r.noRitmo ? 'No ritmo' : 'Abaixo do ritmo'}</Etiqueta>
                  <Etiqueta>{pct(r.progresso)}</Etiqueta>
                  {o.contaId && <Etiqueta>{nomeConta(estado, o.contaId)}</Etiqueta>}
                </div>
                <LinhasResumo
                  linhas={[
                    ['Em falta', euro(r.falta)],
                    ['Reforço mensal definido', euro(o.reforcoMensal)],
                    ['Reforço necessário até à data', r.reforcoNecessario == null ? '—' : `${euro(r.reforcoNecessario)}/mês`],
                    ['Com o reforço atual', r.mesesComReforco == null ? '—' : r.mesesComReforco === 0 ? 'Atingido' : `${r.mesesComReforco} meses`],
                  ]}
                />
                <div className="acoes">
                  <button type="button" className="pequeno primario" onClick={() => setContribuir(o)}>
                    Registar contribuição
                  </button>
                  <button type="button" className="pequeno" onClick={() => setHistorico(o)}>
                    Histórico ({o.contribuicoes.length})
                  </button>
                </div>
              </Cartao>
            );
          })}
        </div>
      ) : (
        <Vazio>Ainda não tens objetivos de poupança.</Vazio>
      )}

      {(novo != null || editar) && <FormObjetivo inicial={editar ?? undefined} nome={novo ?? ''} aoFechar={() => (setNovo(null), setEditar(null))} />}
      {contribuir && <FormContribuicao objetivo={contribuir} aoFechar={() => setContribuir(null)} />}
      {historico && <Historico objetivoId={historico.id} aoFechar={() => setHistorico(null)} />}
    </>
  );
}

function FormObjetivo({ inicial, nome, aoFechar }: { inicial?: Objetivo; nome: string; aoFechar: () => void }) {
  const { estado, atualizar } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const [o, setO] = useState<Objetivo>(() => inicial ?? { id: novoId(), nome, valorAlvo: 0, dataLimite: null, contaId: null, reforcoMensal: 0, valorInicial: 0, contribuicoes: [], notas: '' });
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Objetivo>) => setO((x) => ({ ...x, ...p }));
  const guardar = () => {
    if (!o.nome.trim()) return setErro('Indica um nome.');
    if (!(o.valorAlvo > 0)) return setErro('Indica o valor pretendido.');
    atualizar((e) => ({ ...e, objetivos: e.objetivos.some((x) => x.id === o.id) ? e.objetivos.map((x) => (x.id === o.id ? o : x)) : [...e.objetivos, o] }));
    avisar(inicial ? 'Objetivo atualizado.' : 'Objetivo criado.');
    aoFechar();
  };
  const apagar = async () => {
    if (!(await confirmar(`Apagar o objetivo "${o.nome}" e o seu histórico de contribuições? O dinheiro nas contas não é alterado.`, { botao: 'Apagar', perigo: true }))) return;
    atualizar((e) => ({ ...e, objetivos: e.objetivos.filter((x) => x.id !== o.id) }));
    aoFechar();
  };
  return (
    <Modal
      titulo={inicial ? 'Editar objetivo' : 'Novo objetivo'}
      aoFechar={aoFechar}
      rodape={
        <>
          {inicial && (
            <button type="button" className="perigo esquerda" onClick={apagar}>
              Apagar
            </button>
          )}
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="primario" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <form className="formulario" onSubmit={(e) => (e.preventDefault(), guardar())}>
        <CampoTexto rotulo="Nome" valor={o.nome} mudar={(n) => mudar({ nome: n })} obrigatorio />
        <div className="linha-campos">
          <CampoNumero rotulo="Valor pretendido" valor={o.valorAlvo} mudar={(v) => mudar({ valorAlvo: v ?? 0 })} />
          <CampoData rotulo="Data limite (opcional)" valor={o.dataLimite} mudar={(dataLimite) => mudar({ dataLimite })} />
        </div>
        <div className="linha-campos">
          <CampoNumero rotulo="Reforço mensal" valor={o.reforcoMensal} mudar={(v) => mudar({ reforcoMensal: v ?? 0 })} />
          <CampoNumero rotulo="Valor já reunido" valor={o.valorInicial} mudar={(v) => mudar({ valorInicial: v ?? 0 })} dica="Antes das contribuições registadas aqui." />
        </div>
        <CampoEscolha rotulo="Conta ou reserva associada" valor={o.contaId ?? ''} mudar={(v) => mudar({ contaId: v || null })} opcoes={[{ valor: '', nome: 'Nenhuma' }, ...opcoesContas(estado)]} />
        <CampoArea rotulo="Notas" valor={o.notas} mudar={(notas) => mudar({ notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function FormContribuicao({ objetivo, aoFechar }: { objetivo: Objetivo; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const [contr, setContr] = useState<Contribuicao>({ id: novoId(), data: hoje, valor: objetivo.reforcoMensal || 0, notas: '' });
  const origens = opcoesContas(estado).filter((x) => x.valor !== objetivo.contaId);
  const [transferir, setTransferir] = useState(false);
  const [origem, setOrigem] = useState(origens[0]?.valor ?? '');
  const guardar = () => {
    if (!contr.valor) return;
    atualizar((e) => ({
      ...e,
      objetivos: e.objetivos.map((x) => (x.id === objetivo.id ? { ...x, contribuicoes: [...x.contribuicoes, contr] } : x)),
      movimentos:
        transferir && objetivo.contaId && origem && contr.valor > 0
          ? [...e.movimentos, { id: novoId(), tipo: 'transferencia', data: contr.data, valor: contr.valor, descricao: `Reforço: ${objetivo.nome}`, contaId: origem, contaDestinoId: objetivo.contaId, categoriaId: null, meio: null, fixa: false, recorrenteId: null, valorBruto: null, notas: '' }]
          : e.movimentos,
    }));
    avisar('Contribuição registada.');
    aoFechar();
  };
  return (
    <Modal
      titulo={`Contribuição · ${objetivo.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="primario" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div className="formulario">
        <div className="linha-campos">
          <CampoNumero rotulo="Valor" valor={contr.valor} mudar={(v) => setContr({ ...contr, valor: v ?? 0 })} dica="Usa um valor negativo para registar um levantamento." />
          <CampoData rotulo="Data" valor={contr.data} mudar={(d) => d && setContr({ ...contr, data: d })} />
        </div>
        {objetivo.contaId && (
          <>
            <CampoCaixa rotulo={`Registar também uma transferência para ${nomeConta(estado, objetivo.contaId)}`} valor={transferir} mudar={setTransferir} dica="Deixa desligado se o dinheiro já está nessa conta." />
            {transferir && <CampoEscolha rotulo="Da conta" valor={origem} mudar={setOrigem} opcoes={origens} />}
          </>
        )}
        <CampoArea rotulo="Notas" valor={contr.notas} mudar={(notas) => setContr({ ...contr, notas })} />
      </div>
    </Modal>
  );
}

function Historico({ objetivoId, aoFechar }: { objetivoId: string; aoFechar: () => void }) {
  const { estado, atualizar } = useLoja();
  const o = estado.objetivos.find((x) => x.id === objetivoId);
  if (!o) return null;
  const lista = [...o.contribuicoes].sort((a, b) => b.data.localeCompare(a.data));
  return (
    <Modal titulo={`Histórico · ${o.nome}`} aoFechar={aoFechar}>
      <p className="suave pequeno">Valor inicial: {euro(o.valorInicial)}</p>
      {lista.length ? (
        <div className="lista">
          {lista.map((x) => (
            <div className="item" key={x.id}>
              <span className="avatar">{fmtData(x.data).slice(0, 5)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="titulo">{x.valor >= 0 ? 'Contribuição' : 'Levantamento'}</div>
                <div className="sub">
                  {fmtData(x.data)}
                  {x.notas && ` · ${x.notas}`}
                </div>
              </div>
              <div className="acoes">
                <span className={`montante ${x.valor >= 0 ? 'positivo' : 'negativo'}`}>{euro(x.valor)}</span>
                <button
                  type="button"
                  className="fantasma icone"
                  aria-label="Remover"
                  onClick={() => atualizar((e) => ({ ...e, objetivos: e.objetivos.map((y) => (y.id === o.id ? { ...y, contribuicoes: y.contribuicoes.filter((z) => z.id !== x.id) } : y)) }))}
                >
                  <Icone nome="lixo" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Vazio>Sem contribuições registadas.</Vazio>
      )}
    </Modal>
  );
}

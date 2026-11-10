import { useState } from 'react';
import { alocacoesConta, definirAlocacao, NOMES_TIPO_ALOCACAO, registarJuros, validarAlteracao } from '../dominio/alocacoes';
import { euro } from '../dominio/formato';
import { saldoConta } from '../dominio/saldos';
import type { Conta, TipoAlocacao } from '../dominio/tipos';
import { useLoja } from '../estado/loja';
import { CampoData, CampoEscolha, CampoNumero, CampoTexto } from './campos';
import { useCores } from './graficos';
import { Icone } from './icones';
import { Modal, useInteracoes } from './janelas';
import { Aviso, Etiqueta } from './ui';

const NOMES_POLITICA = {
  'nao-atribuido': 'Para o capital não atribuído',
  proporcional: 'Repartidos pelas alocações',
  destino: 'Para um objetivo específico',
};

/** Resumo das alocações de uma conta: barra empilhada + linhas. */
export function ResumoAlocacoes({ conta, saldo }: { conta: Conta; saldo: number }) {
  const { estado } = useLoja();
  const c = useCores();
  const a = alocacoesConta(estado, conta.id, saldo);
  if (!a.itens.length) return <p className="mais-suave pequeno">Sem alocações: todo o saldo está por atribuir.</p>;
  const total = Math.max(saldo, a.alocado, 0.01);
  const cor = (t: string, i: number) => (t === 'fundo' ? c.serie[5] : t === 'objetivo' ? c.serie[1] : c.serie[(i + 2) % 8]);
  return (
    <div className="formulario" style={{ gap: 8 }}>
      <div className="barra grande" style={{ display: 'flex' }} aria-hidden="true">
        {a.itens.map((i, k) => (
          <span key={i.id} style={{ width: `${(i.valor / total) * 100}%`, background: cor(i.tipo, k), borderRadius: 0 }} />
        ))}
      </div>
      <div className="resumo-linhas">
        {a.itens.map((i, k) => (
          <div key={i.id}>
            <span className="suave" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="ponto" style={{ background: cor(i.tipo, k) }} />
              {i.nome}
            </span>
            <span>{euro(i.valor)}</span>
          </div>
        ))}
        <div className="total">
          <span className="suave">Não atribuído</span>
          <span className={a.naoAtribuido < 0 ? 'negativo' : ''}>{euro(a.naoAtribuido)}</span>
        </div>
      </div>
      {a.excesso > 0.005 && <Aviso>As alocações excedem o saldo em {euro(a.excesso)}. Reduz uma alocação ou atualiza o saldo.</Aviso>}
    </div>
  );
}

/** Criar, alterar e remover alocações de uma conta. Nunca deixa a soma ultrapassar o saldo. */
export function GerirAlocacoes({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar, confirmar } = useInteracoes();
  const saldo = saldoConta(estado, conta, hoje);
  const a = alocacoesConta(estado, conta.id, saldo);
  const manuais = estado.alocacoes.filter((x) => x.contaId === conta.id);
  const [editar, setEditar] = useState<{ id?: string; nome: string; tipo: TipoAlocacao; valor: number | null; atual: number } | null>(null);
  const erro = editar ? validarAlteracao(a.naoAtribuido, editar.atual, editar.valor ?? 0) : null;

  const guardar = () => {
    if (!editar || erro || !editar.nome.trim()) return;
    atualizar((e) => definirAlocacao(e, { id: editar.id, contaId: conta.id, nome: editar.nome.trim(), tipo: editar.tipo, valor: editar.valor ?? 0 }, hoje, editar.id ? 'Alteração manual' : 'Criada'));
    avisar('Alocação guardada. O saldo bancário não mudou.');
    setEditar(null);
  };

  return (
    <Modal titulo={`Alocações · ${conta.nome}`} aoFechar={aoFechar}>
      <p className="suave pequeno">
        As alocações dividem o saldo de {euro(saldo)} por finalidades. Não movem dinheiro nem criam património.
      </p>
      <ResumoAlocacoes conta={conta} saldo={saldo} />
      {editar ? (
        <div className="formulario cartao">
          <div className="linha-campos">
            <CampoTexto rotulo="Nome" valor={editar.nome} mudar={(nome) => setEditar({ ...editar, nome })} />
            <CampoEscolha rotulo="Finalidade" valor={editar.tipo} mudar={(tipo) => setEditar({ ...editar, tipo, nome: editar.nome || NOMES_TIPO_ALOCACAO[tipo] })} opcoes={(Object.keys(NOMES_TIPO_ALOCACAO) as TipoAlocacao[]).map((t) => ({ valor: t, nome: NOMES_TIPO_ALOCACAO[t] }))} />
          </div>
          <CampoNumero rotulo="Valor alocado" valor={editar.valor} mudar={(valor) => setEditar({ ...editar, valor })} dica={`Máximo: ${euro(editar.atual + Math.max(0, a.naoAtribuido))}`} />
          {erro && <p className="negativo pequeno">{erro}</p>}
          <div className="acoes">
            <button type="button" onClick={() => setEditar(null)}>
              Cancelar
            </button>
            <button type="button" className="primario" disabled={!!erro || !editar.nome.trim()} onClick={guardar}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lista">
            {manuais.map((x) => (
              <div className="item" key={x.id}>
                <span className="avatar">
                  <Icone nome={x.tipo === 'fundo' ? 'fundo' : 'objetivos'} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="titulo">{x.nome}</div>
                  <div className="sub">
                    <Etiqueta>{NOMES_TIPO_ALOCACAO[x.tipo]}</Etiqueta>
                  </div>
                </div>
                <div className="acoes">
                  <span className="montante">{euro(x.valor)}</span>
                  <button type="button" className="pequeno" onClick={() => setEditar({ id: x.id, nome: x.nome, tipo: x.tipo, valor: x.valor, atual: x.valor })}>
                    Alterar
                  </button>
                  <button
                    type="button"
                    className="pequeno perigo"
                    onClick={async () => {
                      if (!(await confirmar(`Remover a alocação "${x.nome}"? O valor volta ao capital não atribuído.`, { botao: 'Remover', perigo: true }))) return;
                      atualizar((e) => ({ ...e, alocacoes: e.alocacoes.filter((y) => y.id !== x.id) }));
                    }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
          {a.itens.some((i) => i.origem === 'objetivo') && <p className="mais-suave pequeno">As reservas dos objetivos de poupança alteram-se na secção Objetivos.</p>}
          <button type="button" className="primario" disabled={a.naoAtribuido <= 0} onClick={() => setEditar({ nome: NOMES_TIPO_ALOCACAO.fundo, tipo: 'fundo', valor: Math.max(0, a.naoAtribuido), atual: 0 })}>
            <Icone nome="adicionar" /> Nova alocação
          </button>
          {a.naoAtribuido <= 0 && <p className="mais-suave pequeno">Não há capital por atribuir. Para alocar mais, o saldo da conta tem de aumentar.</p>}
        </>
      )}
    </Modal>
  );
}

/** Registar juros recebidos, aplicando a política de juros da conta. */
export function RegistarJuros({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const { atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hoje);
  const politica = conta.politicaJuros ?? 'nao-atribuido';
  const guardar = () => {
    if (!valor || valor <= 0) return;
    atualizar((e) => registarJuros(e, conta, valor, data, saldoConta(e, conta, data)));
    avisar('Juros registados.');
    aoFechar();
  };
  return (
    <Modal
      titulo={`Juros recebidos · ${conta.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="primario" onClick={guardar} disabled={!valor || valor <= 0}>
            Registar
          </button>
        </>
      }
    >
      <div className="formulario">
        <div className="linha-campos">
          <CampoNumero rotulo="Juros creditados (líquidos)" valor={valor} mudar={setValor} dica="O valor que entrou na conta, depois de impostos." />
          <CampoData rotulo="Data" valor={data} mudar={(d) => d && setData(d)} />
        </div>
        <Aviso tom="info">
          Política desta conta: <strong>{NOMES_POLITICA[politica]}</strong>. Muda-a em “Editar conta”. Os juros entram como receita e aumentam o saldo.
        </Aviso>
      </div>
    </Modal>
  );
}

export { NOMES_POLITICA };

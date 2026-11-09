import { useState } from 'react';
import { somarDias } from '../dominio/datas';
import { euro } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { NOMES_PERIODICIDADE, valorRecorrente } from '../dominio/recorrencias';
import type { MeioPagamento, Periodicidade, Recorrente } from '../dominio/tipos';
import { NOMES_MEIO, opcoesCategorias, opcoesContas } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { CampoArea, CampoCaixa, CampoData, CampoEscolha, CampoNumero, CampoTexto, Segmentos } from './campos';
import { Modal, useInteracoes } from './janelas';
import { Aviso } from './ui';

export function FormRecorrente({
  inicial,
  tipoInicial = 'despesa',
  aoFechar,
}: {
  inicial?: Recorrente;
  tipoInicial?: Recorrente['tipo'];
  aoFechar: () => void;
}) {
  const { estado, atualizar, hoje } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const contas = opcoesContas(estado);
  const [r, setR] = useState<Recorrente>(
    () =>
      inicial ?? {
        id: novoId(),
        tipo: tipoInicial,
        descricao: '',
        valor: 0,
        porDia: null,
        valorBruto: null,
        liquidoConfirmado: true,
        porDefinir: false,
        categoriaId: opcoesCategorias(estado, tipoInicial === 'receita' ? 'receita' : 'despesa')[0]?.valor ?? null,
        contaId: contas[0]?.valor ?? '',
        contaDestinoId: contas[1]?.valor ?? null,
        meio: tipoInicial === 'despesa' ? 'debito' : null,
        fixa: true,
        periodicidade: 'mensal',
        inicio: hoje,
        fim: null,
        automatico: true,
        ativo: true,
        geradoAte: null,
        notas: '',
      },
  );
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Recorrente>) => setR((x) => ({ ...x, ...p }));
  const ehReceita = r.tipo === 'receita';

  const guardar = () => {
    if (!r.descricao.trim()) return setErro('Indica uma descrição.');
    if (!r.contaId) return setErro('Escolhe uma conta.');
    if (r.tipo === 'transferencia' && r.contaDestinoId === r.contaId) return setErro('Escolhe duas contas diferentes.');
    if (!r.porDefinir && !(valorRecorrente(r) > 0)) return setErro('Indica o valor ou marca-o como "por definir".');
    const final: Recorrente = {
      ...r,
      descricao: r.descricao.trim(),
      valor: valorRecorrente(r),
      // Ocorrências anteriores a hoje não são lançadas (evita criar histórico em duplicado).
      geradoAte:
        !inicial || r.inicio !== inicial.inicio ? (r.inicio < hoje ? somarDias(hoje, -1) : null) : r.geradoAte,
      automatico: r.porDefinir ? false : r.automatico,
    };
    atualizar((e) => ({
      ...e,
      recorrentes: e.recorrentes.some((x) => x.id === final.id)
        ? e.recorrentes.map((x) => (x.id === final.id ? final : x))
        : [...e.recorrentes, final],
    }));
    avisar(inicial ? 'Alterações guardadas. Aplicam-se às próximas ocorrências.' : 'Movimento recorrente criado.');
    aoFechar();
  };

  const apagar = async () => {
    if (!(await confirmar(`Apagar "${r.descricao}"? Os movimentos já registados mantêm-se no histórico.`, { botao: 'Apagar', perigo: true })))
      return;
    atualizar((e) => ({
      ...e,
      recorrentes: e.recorrentes.filter((x) => x.id !== r.id),
      fundo: { ...e.fundo, essenciaisIds: e.fundo.essenciaisIds.filter((id) => id !== r.id) },
    }));
    avisar('Movimento recorrente apagado.');
    aoFechar();
  };

  return (
    <Modal
      titulo={inicial ? `Editar ${ehReceita ? 'rendimento' : r.tipo === 'despesa' ? 'despesa recorrente' : 'transferência recorrente'}` : 'Novo movimento recorrente'}
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
        {!inicial && (
          <Segmentos
            rotulo="Tipo"
            valor={r.tipo}
            mudar={(tipo) =>
              mudar({
                tipo,
                categoriaId: tipo === 'transferencia' ? null : opcoesCategorias(estado, tipo === 'receita' ? 'receita' : 'despesa')[0]?.valor ?? null,
                meio: tipo === 'despesa' ? 'debito' : null,
              })
            }
            opcoes={[
              { valor: 'despesa', nome: 'Despesa' },
              { valor: 'receita', nome: 'Rendimento' },
              { valor: 'transferencia', nome: 'Transferência' },
            ]}
          />
        )}
        <CampoTexto rotulo="Descrição" valor={r.descricao} mudar={(descricao) => mudar({ descricao })} obrigatorio />
        {ehReceita && (
          <CampoCaixa
            rotulo="Calculado por dia de trabalho"
            valor={!!r.porDia}
            mudar={(v) => mudar({ porDia: v ? { valorDia: r.valor || 0, dias: 22 } : null })}
            dica="Ex.: subsídio de alimentação (valor diário × dias de trabalho no mês)."
          />
        )}
        {r.porDia ? (
          <div className="linha-campos">
            <CampoNumero rotulo="Valor por dia" valor={r.porDia.valorDia} mudar={(v) => mudar({ porDia: { dias: r.porDia?.dias ?? 22, valorDia: v ?? 0 } })} />
            <CampoNumero rotulo="Dias por mês" sufixo="dias" valor={r.porDia.dias} mudar={(v) => mudar({ porDia: { valorDia: r.porDia?.valorDia ?? 0, dias: v ?? 0 } })} dica={`Total: ${euro(valorRecorrente(r))}`} />
          </div>
        ) : (
          <div className="linha-campos">
            <CampoNumero rotulo={ehReceita ? 'Valor líquido' : 'Valor'} valor={r.valor} mudar={(v) => mudar({ valor: v ?? 0, liquidoConfirmado: true })} />
            {ehReceita && <CampoNumero rotulo="Valor bruto (opcional)" valor={r.valorBruto} permitirVazio mudar={(valorBruto) => mudar({ valorBruto })} />}
          </div>
        )}
        {ehReceita && r.valorBruto != null && !r.liquidoConfirmado && (
          <Aviso>
            O valor líquido ainda não foi confirmado: os cálculos usam {euro(r.valor)}. A aplicação não calcula IRS nem Segurança Social. Indica o valor que recebes de facto.
            <div className="acoes" style={{ marginTop: 8 }}>
              <button type="button" className="pequeno" onClick={() => mudar({ liquidoConfirmado: true })}>
                O valor indicado é o líquido
              </button>
            </div>
          </Aviso>
        )}
        <CampoCaixa rotulo="Valor ainda por definir" valor={r.porDefinir} mudar={(porDefinir) => mudar({ porDefinir })} dica="Fica de fora dos totais e não é lançado automaticamente." />
        <div className="linha-campos">
          {r.tipo !== 'transferencia' && (
            <CampoEscolha rotulo="Categoria" valor={r.categoriaId ?? ''} mudar={(categoriaId) => mudar({ categoriaId })} opcoes={opcoesCategorias(estado, ehReceita ? 'receita' : 'despesa')} />
          )}
          <CampoEscolha rotulo={ehReceita ? 'Conta de destino' : r.tipo === 'transferencia' ? 'Da conta' : 'Conta / cartão'} valor={r.contaId} mudar={(contaId) => mudar({ contaId })} opcoes={contas} />
          {r.tipo === 'transferencia' && (
            <CampoEscolha rotulo="Para a conta" valor={r.contaDestinoId ?? ''} mudar={(contaDestinoId) => mudar({ contaDestinoId })} opcoes={contas} />
          )}
          {r.tipo === 'despesa' && (
            <CampoEscolha rotulo="Meio de pagamento" valor={r.meio ?? 'debito'} mudar={(meio) => mudar({ meio })} opcoes={(Object.keys(NOMES_MEIO) as MeioPagamento[]).map((k) => ({ valor: k, nome: NOMES_MEIO[k] }))} />
          )}
        </div>
        <div className="linha-campos">
          <CampoEscolha rotulo="Periodicidade" valor={r.periodicidade} mudar={(periodicidade) => mudar({ periodicidade })} opcoes={(Object.keys(NOMES_PERIODICIDADE) as Periodicidade[]).map((p) => ({ valor: p, nome: NOMES_PERIODICIDADE[p] }))} />
          <CampoData rotulo={r.periodicidade === 'unica' ? 'Data' : 'Primeira data'} valor={r.inicio} mudar={(d) => d && mudar({ inicio: d })} dica="Define o dia (e o mês) das ocorrências. Datas anteriores a hoje não são lançadas." />
          {r.periodicidade !== 'unica' && <CampoData rotulo="Termina em (opcional)" valor={r.fim} mudar={(fim) => mudar({ fim })} />}
        </div>
        <div className="linha-campos">
          {r.tipo === 'despesa' && (
            <CampoEscolha rotulo="Tipo de despesa" valor={r.fixa ? 'fixa' : 'variavel'} mudar={(v) => mudar({ fixa: v === 'fixa' })} opcoes={[{ valor: 'fixa', nome: 'Fixa' }, { valor: 'variavel', nome: 'Variável' }]} />
          )}
          <CampoCaixa rotulo="Registar automaticamente" valor={r.automatico && !r.porDefinir} mudar={(automatico) => mudar({ automatico })} dica="Cria o movimento na data. Desliga para despesas variáveis que preferes registar à mão." />
          <CampoCaixa rotulo="Ativo" valor={r.ativo} mudar={(ativo) => mudar({ ativo })} />
        </div>
        <CampoArea rotulo="Notas" valor={r.notas} mudar={(notas) => mudar({ notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

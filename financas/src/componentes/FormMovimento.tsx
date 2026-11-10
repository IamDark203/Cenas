import { useState } from 'react';
import { novoId } from '../dominio/ids';
import { NOMES_PERIODICIDADE } from '../dominio/recorrencias';
import type { MeioPagamento, Movimento, Periodicidade, Recorrente, TipoMovimento } from '../dominio/tipos';
import { NOMES_MEIO, opcoesCategorias, opcoesContas } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { CampoArea, CampoCaixa, CampoData, CampoEscolha, CampoNumero, CampoTexto, Segmentos } from './campos';
import { Modal, useInteracoes } from './janelas';
import { Aviso } from './ui';

const TIPOS: { valor: TipoMovimento; nome: string }[] = [
  { valor: 'despesa', nome: 'Despesa' },
  { valor: 'receita', nome: 'Receita' },
  { valor: 'transferencia', nome: 'Transferência' },
];

export function FormMovimento({
  inicial,
  tipoInicial = 'despesa',
  meioInicial,
  aoFechar,
}: {
  inicial?: Movimento;
  tipoInicial?: TipoMovimento;
  meioInicial?: MeioPagamento;
  aoFechar: () => void;
}) {
  const { estado, atualizar, hoje } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const contas = opcoesContas(estado);
  const refeicao = opcoesContas(estado, ['refeicao']);
  const [m, setM] = useState<Movimento>(
    () =>
      inicial ?? {
        id: novoId(),
        tipo: tipoInicial,
        data: hoje,
        valor: 0,
        descricao: '',
        contaId: meioInicial === 'refeicao' && refeicao[0] ? refeicao[0].valor : contas[0]?.valor ?? '',
        contaDestinoId: contas[1]?.valor ?? null,
        categoriaId:
          meioInicial === 'refeicao' && estado.refeicao.finalidadeIds[0]
            ? estado.refeicao.finalidadeIds[0]
            : opcoesCategorias(estado, tipoInicial === 'receita' ? 'receita' : 'despesa')[0]?.valor ?? null,
        meio: tipoInicial === 'despesa' ? meioInicial ?? 'cartao' : null,
        fixa: false,
        recorrenteId: null,
        valorBruto: null,
        notas: '',
      },
  );
  const [repetir, setRepetir] = useState(false);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal');
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Movimento>) => setM((x) => ({ ...x, ...p }));

  const mudarTipo = (tipo: TipoMovimento) =>
    mudar({
      tipo,
      categoriaId: tipo === 'transferencia' ? null : opcoesCategorias(estado, tipo === 'receita' ? 'receita' : 'despesa')[0]?.valor ?? null,
      meio: tipo === 'despesa' ? 'cartao' : null,
    });

  const mudarMeio = (meio: MeioPagamento) => {
    const contaRefeicao = refeicao[0]?.valor;
    const ehRefeicao = estado.contas.find((c) => c.id === m.contaId)?.tipo === 'refeicao';
    const alimentacao = estado.categorias.find((c) => c.tipo === 'despesa' && /^alimenta/i.test(c.nome))?.id;
    if (meio === 'refeicao' && contaRefeicao) mudar({ meio, contaId: contaRefeicao, ...(alimentacao ? { categoriaId: alimentacao } : {}) });
    else if (meio !== 'refeicao' && ehRefeicao) mudar({ meio, contaId: opcoesContas(estado, ['ordem'])[0]?.valor ?? contas[0]?.valor });
    else mudar({ meio });
  };

  const guardar = () => {
    if (!m.descricao.trim()) return setErro('Indica uma descrição.');
    if (m.tipo !== 'ajuste' && !(m.valor > 0)) return setErro('O valor tem de ser maior que zero.');
    if (!m.contaId) return setErro('Escolhe uma conta.');
    if (m.tipo === 'transferencia' && (!m.contaDestinoId || m.contaDestinoId === m.contaId))
      return setErro('Escolhe duas contas diferentes.');
    const final: Movimento = { ...m, descricao: m.descricao.trim(), contaDestinoId: m.tipo === 'transferencia' ? m.contaDestinoId : null };
    atualizar((e) => {
      const existe = e.movimentos.some((x) => x.id === final.id);
      let recorrentes = e.recorrentes;
      let mov = final;
      if (!existe && repetir && final.tipo !== 'ajuste') {
        const r: Recorrente = {
          id: novoId(),
          tipo: final.tipo as Recorrente['tipo'],
          descricao: final.descricao,
          valor: final.valor,
          porDia: null,
          valorBruto: final.valorBruto,
          liquidoConfirmado: true,
          porDefinir: false,
          categoriaId: final.categoriaId,
          contaId: final.contaId,
          contaDestinoId: final.contaDestinoId,
          meio: final.meio,
          fixa: final.fixa,
          periodicidade,
          inicio: final.data,
          fim: null,
          automatico: true,
          ativo: true,
          geradoAte: final.data,
          notas: final.notas,
        };
        recorrentes = [...recorrentes, r];
        mov = { ...final, recorrenteId: r.id };
      }
      return {
        ...e,
        recorrentes,
        movimentos: existe ? e.movimentos.map((x) => (x.id === mov.id ? mov : x)) : [...e.movimentos, mov],
      };
    });
    avisar(inicial ? 'Movimento atualizado.' : 'Movimento registado.');
    aoFechar();
  };

  const apagar = async () => {
    if (!(await confirmar(`Apagar "${m.descricao}"?`, { botao: 'Apagar', perigo: true }))) return;
    atualizar((e) => ({ ...e, movimentos: e.movimentos.filter((x) => x.id !== m.id) }));
    avisar('Movimento apagado.');
    aoFechar();
  };

  const contasDespesa = m.meio === 'refeicao' ? refeicao : contas.filter((c) => !refeicao.some((r) => r.valor === c.valor));
  const titulo = inicial ? 'Editar movimento' : 'Novo movimento';

  return (
    <Modal
      titulo={titulo}
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
        {!inicial && <Segmentos rotulo="Tipo de movimento" valor={m.tipo} mudar={mudarTipo} opcoes={TIPOS} />}
        {m.tipo === 'ajuste' && <Aviso tom="info">Correção de saldo: não conta como receita nem despesa.</Aviso>}
        {m.tipo === 'transferencia' && <Aviso tom="info">Transferência entre contas próprias: não conta como receita nem despesa.</Aviso>}
        <CampoTexto rotulo="Descrição" valor={m.descricao} mudar={(descricao) => mudar({ descricao })} obrigatorio exemplo={m.tipo === 'despesa' ? 'Ex.: Supermercado' : m.tipo === 'receita' ? 'Ex.: Salário de novembro' : 'Ex.: Reforço da poupança'} />
        <div className="linha-campos">
          <CampoNumero rotulo={m.tipo === 'ajuste' ? 'Diferença (+/−)' : m.tipo === 'receita' ? 'Valor líquido recebido' : 'Valor'} valor={m.valor} mudar={(v) => mudar({ valor: v ?? 0 })} obrigatorio />
          <CampoData rotulo="Data" valor={m.data} mudar={(d) => d && mudar({ data: d })} obrigatorio />
        </div>
        {m.tipo === 'despesa' && (
          <>
            <div className="linha-campos">
              <CampoEscolha rotulo="Categoria" valor={m.categoriaId ?? ''} mudar={(categoriaId) => mudar({ categoriaId })} opcoes={opcoesCategorias(estado, 'despesa')} />
              <CampoEscolha rotulo="Meio de pagamento" valor={m.meio ?? 'cartao'} mudar={mudarMeio} opcoes={(Object.keys(NOMES_MEIO) as MeioPagamento[]).map((k) => ({ valor: k, nome: NOMES_MEIO[k] }))} />
            </div>
            <div className="linha-campos">
              <CampoEscolha rotulo={m.meio === 'refeicao' ? 'Cartão-refeição' : 'Conta debitada'} valor={m.contaId} mudar={(contaId) => mudar({ contaId })} opcoes={contasDespesa.length ? contasDespesa : contas} />
              <CampoEscolha rotulo="Tipo de despesa" valor={m.fixa ? 'fixa' : 'variavel'} mudar={(v) => mudar({ fixa: v === 'fixa' })} opcoes={[{ valor: 'variavel', nome: 'Variável' }, { valor: 'fixa', nome: 'Fixa' }]} />
            </div>
          </>
        )}
        {m.tipo === 'receita' && (
          <>
            <div className="linha-campos">
              <CampoEscolha rotulo="Categoria" valor={m.categoriaId ?? ''} mudar={(categoriaId) => mudar({ categoriaId })} opcoes={opcoesCategorias(estado, 'receita')} />
              <CampoEscolha rotulo="Conta de destino" valor={m.contaId} mudar={(contaId) => mudar({ contaId })} opcoes={contas} />
            </div>
            <CampoNumero rotulo="Valor bruto (opcional)" valor={m.valorBruto} permitirVazio mudar={(valorBruto) => mudar({ valorBruto })} dica="Só para registo. Os cálculos usam o valor líquido." />
          </>
        )}
        {m.tipo === 'transferencia' && (
          <div className="linha-campos">
            <CampoEscolha rotulo="Da conta" valor={m.contaId} mudar={(contaId) => mudar({ contaId })} opcoes={contas} />
            <CampoEscolha rotulo="Para a conta" valor={m.contaDestinoId ?? ''} mudar={(contaDestinoId) => mudar({ contaDestinoId })} opcoes={contas} />
          </div>
        )}
        {m.tipo === 'ajuste' && <CampoEscolha rotulo="Conta" valor={m.contaId} mudar={(contaId) => mudar({ contaId })} opcoes={contas} />}
        {!inicial && m.tipo !== 'ajuste' && (
          <div className="linha-campos">
            <CampoCaixa rotulo="Repetir automaticamente" valor={repetir} mudar={setRepetir} dica="Cria um movimento recorrente a partir desta data." />
            {repetir && (
              <CampoEscolha rotulo="Periodicidade" valor={periodicidade} mudar={setPeriodicidade} opcoes={(Object.keys(NOMES_PERIODICIDADE) as Periodicidade[]).filter((p) => p !== 'unica').map((p) => ({ valor: p, nome: NOMES_PERIODICIDADE[p] }))} />
            )}
          </div>
        )}
        {inicial?.recorrenteId && <p className="mais-suave pequeno">Gerado por um movimento recorrente. Alterar aqui não muda as próximas ocorrências.</p>}
        <CampoArea rotulo="Observações" valor={m.notas} mudar={(notas) => mudar({ notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

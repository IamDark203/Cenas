import { useState } from 'react';
import { euro } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { CATEGORIAS_ATIVO, NOMES_CATEGORIA_ATIVO, posicao } from '../dominio/investimentos';
import type { Ativo, Operacao } from '../dominio/tipos';
import { opcoesContas } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { CampoArea, CampoData, CampoEscolha, CampoNumero, CampoTexto, Segmentos } from './campos';
import { Modal, useInteracoes } from './janelas';

function Rodape({ aoFechar, guardar, apagar }: { aoFechar: () => void; guardar: () => void; apagar?: () => void }) {
  return (
    <>
      {apagar && (
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
  );
}

export function FormAtivo({ inicial, aoFechar }: { inicial?: Ativo; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const [a, setA] = useState<Ativo>(() => inicial ?? { id: novoId(), nome: '', identificador: '', categoria: 'etf-acoes', precos: [], notas: '' });
  const [precoInicial, setPrecoInicial] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const guardar = () => {
    if (!a.nome.trim()) return setErro('Indica o nome do ativo.');
    const final = { ...a, nome: a.nome.trim(), identificador: a.identificador.trim(), precos: precoInicial ? [...a.precos, { data: hoje, preco: precoInicial }] : a.precos };
    atualizar((e) => ({ ...e, ativos: e.ativos.some((x) => x.id === final.id) ? e.ativos.map((x) => (x.id === final.id ? final : x)) : [...e.ativos, final] }));
    avisar(inicial ? 'Ativo atualizado.' : 'Ativo criado. Regista agora as compras.');
    aoFechar();
  };
  const apagar = async () => {
    const n = estado.operacoes.filter((o) => o.ativoId === a.id).length;
    if (!(await confirmar(`Apagar "${a.nome}"${n ? ` e as suas ${n} operações` : ''}?`, { botao: 'Apagar', perigo: true }))) return;
    atualizar((e) => ({ ...e, ativos: e.ativos.filter((x) => x.id !== a.id), operacoes: e.operacoes.filter((o) => o.ativoId !== a.id) }));
    aoFechar();
  };
  return (
    <Modal titulo={inicial ? 'Editar ativo' : 'Novo ativo'} aoFechar={aoFechar} rodape={<Rodape aoFechar={aoFechar} guardar={guardar} apagar={inicial ? apagar : undefined} />}>
      <form className="formulario" onSubmit={(e) => (e.preventDefault(), guardar())}>
        <CampoTexto rotulo="Nome do ativo" valor={a.nome} mudar={(nome) => setA({ ...a, nome })} obrigatorio />
        <div className="linha-campos">
          <CampoTexto rotulo="Identificador (ticker ou ISIN)" valor={a.identificador} mudar={(identificador) => setA({ ...a, identificador })} dica="Usado para obter cotações, se configurares uma fonte." />
          <CampoEscolha rotulo="Categoria" valor={a.categoria} mudar={(categoria) => setA({ ...a, categoria })} opcoes={CATEGORIAS_ATIVO.map((c) => ({ valor: c, nome: NOMES_CATEGORIA_ATIVO[c] }))} />
        </div>
        {!inicial && <CampoNumero rotulo="Cotação atual (opcional)" valor={precoInicial} permitirVazio mudar={setPrecoInicial} dica="Preço por unidade hoje." />}
        <CampoArea rotulo="Notas" valor={a.notas} mudar={(notas) => setA({ ...a, notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function FormOperacao({ inicial, ativoId, aoFechar }: { inicial?: Operacao; ativoId?: string; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const [o, setO] = useState<Operacao>(
    () => inicial ?? { id: novoId(), ativoId: ativoId ?? estado.ativos[0]?.id ?? '', tipo: 'compra', data: hoje, quantidade: 0, preco: 0, comissao: 0, contaId: null, notas: '' },
  );
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Operacao>) => setO((x) => ({ ...x, ...p }));
  const total = o.quantidade * o.preco + (o.tipo === 'compra' ? o.comissao : -o.comissao);
  const guardar = () => {
    if (!o.ativoId) return setErro('Cria primeiro um ativo.');
    if (!(o.quantidade > 0) || !(o.preco > 0)) return setErro('Indica a quantidade e o preço por unidade.');
    if (o.tipo === 'venda') {
      const ops = estado.operacoes.filter((x) => x.id !== o.id);
      const disponivel = posicao(o.ativoId, ops, o.data).quantidade;
      if (o.quantidade > disponivel + 1e-9) return setErro(`Só tens ${disponivel} unidades nessa data.`);
    }
    atualizar((e) => ({ ...e, operacoes: e.operacoes.some((x) => x.id === o.id) ? e.operacoes.map((x) => (x.id === o.id ? o : x)) : [...e.operacoes, o] }));
    avisar(inicial ? 'Operação atualizada.' : 'Operação registada.');
    aoFechar();
  };
  const apagar = async () => {
    if (!(await confirmar('Apagar esta operação?', { botao: 'Apagar', perigo: true }))) return;
    atualizar((e) => ({ ...e, operacoes: e.operacoes.filter((x) => x.id !== o.id) }));
    aoFechar();
  };
  return (
    <Modal titulo={inicial ? 'Editar operação' : 'Registar operação'} aoFechar={aoFechar} rodape={<Rodape aoFechar={aoFechar} guardar={guardar} apagar={inicial ? apagar : undefined} />}>
      <form className="formulario" onSubmit={(e) => (e.preventDefault(), guardar())}>
        <Segmentos rotulo="Tipo" valor={o.tipo} mudar={(tipo) => mudar({ tipo })} opcoes={[{ valor: 'compra', nome: 'Compra' }, { valor: 'venda', nome: 'Venda' }]} />
        <CampoEscolha rotulo="Ativo" valor={o.ativoId} mudar={(v) => mudar({ ativoId: v })} opcoes={estado.ativos.map((a) => ({ valor: a.id, nome: a.nome }))} />
        <div className="linha-campos">
          <CampoNumero rotulo="Quantidade" sufixo="un." valor={o.quantidade} mudar={(v) => mudar({ quantidade: v ?? 0 })} />
          <CampoNumero rotulo="Preço por unidade" valor={o.preco} mudar={(v) => mudar({ preco: v ?? 0 })} />
        </div>
        <div className="linha-campos">
          <CampoNumero rotulo="Comissões" valor={o.comissao} mudar={(v) => mudar({ comissao: v ?? 0 })} />
          <CampoData rotulo="Data" valor={o.data} mudar={(d) => d && mudar({ data: d })} />
        </div>
        <CampoEscolha
          rotulo={o.tipo === 'compra' ? 'Pago a partir da conta' : 'Recebido na conta'}
          valor={o.contaId ?? ''}
          mudar={(v) => mudar({ contaId: v || null })}
          opcoes={[{ valor: '', nome: 'Não mexer nas contas' }, ...opcoesContas(estado, ['ordem', 'poupanca', 'investimento', 'outra'])]}
          dica="Se escolheres uma conta, o saldo dela é ajustado (sem contar como despesa ou receita)."
        />
        <p className="suave pequeno">
          Total da operação: <strong className="num">{euro(total)}</strong>
        </p>
        <CampoArea rotulo="Notas" valor={o.notas} mudar={(notas) => mudar({ notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function FormCotacao({ ativo, aoFechar }: { ativo: Ativo; aoFechar: () => void }) {
  const { atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const [preco, setPreco] = useState<number | null>(ativo.precos.at(-1)?.preco ?? null);
  const [data, setData] = useState(hoje);
  const guardar = () => {
    if (!preco || preco <= 0) return;
    atualizar((e) => ({
      ...e,
      ativos: e.ativos.map((x) => (x.id === ativo.id ? { ...x, precos: [...x.precos.filter((p) => p.data !== data), { data, preco }].sort((a, b) => a.data.localeCompare(b.data)) } : x)),
    }));
    avisar('Cotação atualizada.');
    aoFechar();
  };
  return (
    <Modal titulo={`Cotação · ${ativo.nome}`} aoFechar={aoFechar} rodape={<Rodape aoFechar={aoFechar} guardar={guardar} />}>
      <div className="linha-campos">
        <CampoNumero rotulo="Preço por unidade" valor={preco} mudar={setPreco} />
        <CampoData rotulo="Data" valor={data} mudar={(d) => d && setData(d)} />
      </div>
    </Modal>
  );
}

/** Lê um valor de um objeto JSON por um caminho como "chart.result.0.meta.regularMarketPrice". */
export function lerCaminho(obj: unknown, caminho: string): unknown {
  return caminho
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

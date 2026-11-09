import { useState } from 'react';
import { CampoArea, CampoCaixa, CampoData, CampoEscolha, CampoNumero, CampoTexto } from '../componentes/campos';
import { FormMovimento } from '../componentes/FormMovimento';
import { Icone } from '../componentes/icones';
import { Modal, useInteracoes } from '../componentes/janelas';
import { ListaMovimentos } from '../componentes/ListaMovimentos';
import { Aviso, Cartao, Etiqueta, Kpi, LinhasResumo, Vazio } from '../componentes/ui';
import { data as fmtData, euro, numero } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { NOMES_TIPO_CONTA, jurosEstimados, saldoConta } from '../dominio/saldos';
import type { Conta, PeriodicidadeJuros, TipoConta } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

const NOMES_JUROS: Record<PeriodicidadeJuros, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  maturidade: 'No fim do prazo',
};

export default function Contas() {
  const { estado, hoje } = useLoja();
  const { atual } = useResumo();
  const [editar, setEditar] = useState<Conta | null>(null);
  const [nova, setNova] = useState(false);
  const [historico, setHistorico] = useState<Conta | null>(null);
  const [corrigir, setCorrigir] = useState<Conta | null>(null);
  const [transferir, setTransferir] = useState(false);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const ret = estado.pressupostos.retencaoJuros;
  const juros = atual.porConta.reduce((s, p) => s + (jurosEstimados(p.conta, p.saldo, ret)?.liquido ?? 0), 0);
  const visiveis = atual.porConta.filter((p) => verArquivadas || !p.conta.arquivada);
  const transferencias = estado.movimentos.filter((m) => m.tipo === 'transferencia');

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Património financeiro" valor={euro(atual.patrimonio)} detalhe="Contas + valor de mercado dos investimentos" />
        <Kpi rotulo="Saldo das contas bancárias" valor={euro(atual.bancario)} />
        <Kpi rotulo="Juros anuais estimados" valor={euro(juros)} detalhe={`Líquidos, com retenção de ${numero(ret)} % quando não indicas a TANL`} />
      </div>
      <div className="acoes">
        <button type="button" className="primario" onClick={() => setNova(true)}>
          <Icone nome="adicionar" /> Conta
        </button>
        <button type="button" onClick={() => setTransferir(true)}>
          <Icone nome="transferir" /> Transferência
        </button>
        {estado.contas.some((c) => c.arquivada) && (
          <button type="button" className="fantasma" onClick={() => setVerArquivadas(!verArquivadas)}>
            {verArquivadas ? 'Esconder arquivadas' : 'Mostrar arquivadas'}
          </button>
        )}
      </div>

      <div className="grelha-3">
        {visiveis.map(({ conta, saldo }) => {
          const j = jurosEstimados(conta, saldo, ret);
          return (
            <Cartao
              key={conta.id}
              titulo={conta.nome}
              subtitulo={conta.instituicao || 'Instituição por indicar'}
              acoes={
                <button type="button" className="fantasma icone" aria-label={`Editar ${conta.nome}`} onClick={() => setEditar(conta)}>
                  <Icone nome="editar" />
                </button>
              }
            >
              <div className="acoes">
                <Etiqueta tom="acento">{NOMES_TIPO_CONTA[conta.tipo]}</Etiqueta>
                {conta.fundoEmergencia && <Etiqueta tom="positivo">Fundo de emergência</Etiqueta>}
                {conta.tipo === 'refeicao' && <Etiqueta tom="aviso">Benefício não convertível</Etiqueta>}
                {conta.arquivada && <Etiqueta>Arquivada</Etiqueta>}
              </div>
              <div className="kpi" style={{ border: 0, boxShadow: 'none', padding: 0 }}>
                <div className="rotulo">Saldo atual</div>
                <div className={`valor ${saldo < 0 ? 'negativo' : ''}`} style={{ fontSize: '1.6rem' }}>
                  {euro(saldo)}
                </div>
              </div>
              {(conta.tanb != null || conta.limiteRemunerado != null) && (
                <LinhasResumo
                  linhas={[
                    ['TANB', conta.tanb != null ? `${numero(conta.tanb)} %` : '—'],
                    ['TANL', j ? `${numero(Math.round(j.tanl * 1000) / 1000)} %${conta.tanl == null ? ' (calculada)' : ''}` : '—'],
                    ['Capital remunerado até', conta.limiteRemunerado != null ? euro(conta.limiteRemunerado) : 'Sem limite'],
                    ['Pagamento de juros', conta.periodicidadeJuros ? NOMES_JUROS[conta.periodicidadeJuros] : 'Por indicar'],
                    ['Juros anuais estimados', j ? `${euro(j.liquido)} líquidos` : '—'],
                  ]}
                />
              )}
              {conta.condicoes && <p className="pequeno suave">Condições: {conta.condicoes}</p>}
              {conta.notas && <p className="pequeno mais-suave">{conta.notas}</p>}
              <div className="acoes">
                <button type="button" className="pequeno" onClick={() => setHistorico(conta)}>
                  Movimentos
                </button>
                <button type="button" className="pequeno" onClick={() => setCorrigir(conta)}>
                  Atualizar saldo
                </button>
              </div>
            </Cartao>
          );
        })}
      </div>
      {!visiveis.length && <Vazio>Ainda não tens contas.</Vazio>}

      <Cartao titulo="Transferências entre contas próprias" subtitulo="Não contam como receitas nem despesas e não alteram o património.">
        <ListaMovimentos movimentos={transferencias} limite={20} vazio="Sem transferências registadas." />
      </Cartao>

      {(nova || editar) && <FormConta inicial={editar ?? undefined} aoFechar={() => (setNova(false), setEditar(null))} />}
      {historico && (
        <Modal titulo={`Movimentos · ${historico.nome}`} largo aoFechar={() => setHistorico(null)}>
          <p className="suave pequeno">
            Saldo inicial de {euro(historico.saldoInicial)} a {fmtData(historico.dataSaldoInicial)}. Saldo hoje: {euro(saldoConta(estado, historico, hoje))}.
          </p>
          <ListaMovimentos
            contaId={historico.id}
            movimentos={estado.movimentos.filter((m) => m.contaId === historico.id || m.contaDestinoId === historico.id)}
            vazio="Sem movimentos nesta conta."
          />
        </Modal>
      )}
      {corrigir && <CorrigirSaldo conta={corrigir} aoFechar={() => setCorrigir(null)} />}
      {transferir && <FormMovimento tipoInicial="transferencia" aoFechar={() => setTransferir(false)} />}
    </>
  );
}

function CorrigirSaldo({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { avisar } = useInteracoes();
  const [data, setData] = useState(hoje);
  const atual = saldoConta(estado, conta, data);
  const [novo, setNovo] = useState<number | null>(atual);
  const dif = (novo ?? 0) - atual;
  const guardar = () => {
    if (novo == null || Math.abs(dif) < 0.005) return aoFechar();
    atualizar((e) => ({
      ...e,
      movimentos: [
        ...e.movimentos,
        { id: novoId(), tipo: 'ajuste', data, valor: Math.round(dif * 100) / 100, descricao: 'Atualização de saldo', contaId: conta.id, contaDestinoId: null, categoriaId: null, meio: null, fixa: false, recorrenteId: null, valorBruto: null, notas: '' },
      ],
    }));
    avisar('Saldo atualizado.');
    aoFechar();
  };
  return (
    <Modal
      titulo={`Atualizar saldo · ${conta.nome}`}
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
        <p className="suave">Saldo calculado pela aplicação: {euro(atual)}. Indica o saldo real (por exemplo, o que vês no banco).</p>
        <div className="linha-campos">
          <CampoNumero rotulo="Saldo real" valor={novo} mudar={setNovo} />
          <CampoData rotulo="Data" valor={data} mudar={(d) => d && setData(d)} />
        </div>
        {Math.abs(dif) >= 0.005 && (
          <Aviso tom="info">
            Vai ser registada uma correção de {dif > 0 ? '+' : ''}
            {euro(dif)}. As correções não contam como receitas nem despesas.
          </Aviso>
        )}
      </div>
    </Modal>
  );
}

function FormConta({ inicial, aoFechar }: { inicial?: Conta; aoFechar: () => void }) {
  const { estado, atualizar, hoje } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const [c, setC] = useState<Conta>(
    () =>
      inicial ?? {
        id: novoId(),
        nome: '',
        instituicao: '',
        tipo: 'ordem',
        saldoInicial: 0,
        dataSaldoInicial: hoje,
        tanb: null,
        tanl: null,
        limiteRemunerado: null,
        periodicidadeJuros: null,
        condicoes: '',
        fundoEmergencia: false,
        arquivada: false,
        notas: '',
      },
  );
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Conta>) => setC((x) => ({ ...x, ...p }));
  const usada = estado.movimentos.some((m) => m.contaId === c.id || m.contaDestinoId === c.id) || estado.recorrentes.some((r) => r.contaId === c.id || r.contaDestinoId === c.id) || estado.operacoes.some((o) => o.contaId === c.id);
  const remunerada = ['poupanca', 'prazo', 'ordem', 'outra', 'investimento'].includes(c.tipo);

  const guardar = () => {
    if (!c.nome.trim()) return setErro('Indica um nome.');
    const final = { ...c, nome: c.nome.trim(), instituicao: c.instituicao.trim() };
    atualizar((e) => ({ ...e, contas: e.contas.some((x) => x.id === final.id) ? e.contas.map((x) => (x.id === final.id ? final : x)) : [...e.contas, final] }));
    avisar(inicial ? 'Conta atualizada.' : 'Conta criada.');
    aoFechar();
  };
  const apagar = async () => {
    if (usada) {
      if (!(await confirmar('Esta conta tem movimentos associados. Arquivar? Fica escondida mas o histórico mantém-se.', { botao: 'Arquivar' }))) return;
      atualizar((e) => ({ ...e, contas: e.contas.map((x) => (x.id === c.id ? { ...x, arquivada: true } : x)) }));
    } else {
      if (!(await confirmar(`Apagar a conta "${c.nome}"?`, { botao: 'Apagar', perigo: true }))) return;
      atualizar((e) => ({ ...e, contas: e.contas.filter((x) => x.id !== c.id) }));
    }
    aoFechar();
  };

  return (
    <Modal
      titulo={inicial ? 'Editar conta' : 'Nova conta'}
      aoFechar={aoFechar}
      rodape={
        <>
          {inicial && (
            <button type="button" className="perigo esquerda" onClick={apagar}>
              {usada ? 'Arquivar' : 'Apagar'}
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
        <div className="linha-campos">
          <CampoTexto rotulo="Nome" valor={c.nome} mudar={(nome) => mudar({ nome })} obrigatorio exemplo="Ex.: Conta Poupança" />
          <CampoTexto rotulo="Instituição" valor={c.instituicao} mudar={(instituicao) => mudar({ instituicao })} exemplo="Ex.: Banco CTT" />
        </div>
        <CampoEscolha rotulo="Tipo de conta" valor={c.tipo} mudar={(tipo) => mudar({ tipo })} opcoes={(Object.keys(NOMES_TIPO_CONTA) as TipoConta[]).map((t) => ({ valor: t, nome: NOMES_TIPO_CONTA[t] }))} />
        <div className="linha-campos">
          <CampoNumero rotulo="Saldo inicial" valor={c.saldoInicial} mudar={(v) => mudar({ saldoInicial: v ?? 0 })} dica="Saldo na data ao lado. Depois disso o saldo é calculado pelos movimentos." />
          <CampoData rotulo="Data do saldo" valor={c.dataSaldoInicial} mudar={(d) => d && mudar({ dataSaldoInicial: d })} />
        </div>
        {remunerada && c.tipo !== 'refeicao' && (
          <>
            <div className="linha-campos">
              <CampoNumero rotulo="TANB" sufixo="%" valor={c.tanb} permitirVazio mudar={(tanb) => mudar({ tanb })} />
              <CampoNumero rotulo="TANL" sufixo="%" valor={c.tanl} permitirVazio mudar={(tanl) => mudar({ tanl })} dica="Vazia: calculada com a retenção definida nas Definições." />
            </div>
            <div className="linha-campos">
              <CampoNumero rotulo="Capital máximo remunerado" valor={c.limiteRemunerado} permitirVazio mudar={(limiteRemunerado) => mudar({ limiteRemunerado })} />
              <CampoEscolha
                rotulo="Pagamento de juros"
                valor={c.periodicidadeJuros ?? ''}
                mudar={(v) => mudar({ periodicidadeJuros: (v || null) as PeriodicidadeJuros | null })}
                opcoes={[{ valor: '', nome: 'Por indicar' }, ...(Object.keys(NOMES_JUROS) as PeriodicidadeJuros[]).map((k) => ({ valor: k, nome: NOMES_JUROS[k] }))]}
              />
            </div>
            <CampoArea rotulo="Condições para a remuneração" valor={c.condicoes} mudar={(condicoes) => mudar({ condicoes })} />
          </>
        )}
        <CampoCaixa rotulo="Faz parte do fundo de emergência" valor={c.fundoEmergencia} mudar={(fundoEmergencia) => mudar({ fundoEmergencia })} dica="O saldo desta conta conta para o fundo de emergência e não para o dinheiro disponível." />
        {inicial && <CampoCaixa rotulo="Arquivada" valor={c.arquivada} mudar={(arquivada) => mudar({ arquivada })} />}
        <CampoArea rotulo="Notas" valor={c.notas} mudar={(notas) => mudar({ notas })} />
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

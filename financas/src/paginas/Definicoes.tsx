import { useRef, useState } from 'react';
import { CampoCaixa, CampoEscolha, CampoNumero, CampoTexto, Segmentos } from '../componentes/campos';
import { Icone } from '../componentes/icones';
import { Modal, useInteracoes } from '../componentes/janelas';
import { Aviso, Cartao } from '../componentes/ui';
import { estadoInicial, estadoVazio } from '../dominio/dadosIniciais';
import { mesDe } from '../dominio/datas';
import { novoId } from '../dominio/ids';
import { normalizarEstado } from '../dominio/normalizar';
import type { Categoria, Perfil } from '../dominio/tipos';
import { criptoDisponivel } from '../estado/cripto';
import { useLoja } from '../estado/loja';
import { entregarFicheiro, linhasContas, linhasInvestimentos, linhasMovimentos, paraCsv } from '../exportar/ficheiros';
import { livroXlsx } from '../exportar/xlsx';

export default function Definicoes() {
  const { estado, atualizar, substituir, hoje, protegido, bloquear, erroGravacao } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  const p = estado.perfil;
  const mudarPerfil = (x: Partial<Perfil>) => atualizar((e) => ({ ...e, perfil: { ...e.perfil, ...x } }));
  const [palavra, setPalavra] = useState<null | 'definir'>(null);
  const ficheiro = useRef<HTMLInputElement>(null);

  const exportarJson = async () => {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const r = await entregarFicheiro(`capital-copia-${hoje}.json`, blob);
    if (r !== 'cancelado') avisar('Cópia de segurança exportada.');
  };
  const importar = async (f: File) => {
    try {
      const novo = normalizarEstado(JSON.parse(await f.text()));
      if (!(await confirmar('Substituir todos os dados atuais pelos da cópia de segurança?', { botao: 'Substituir', perigo: true }))) return;
      substituir(novo);
      avisar('Dados importados.');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Ficheiro inválido.');
    }
  };

  return (
    <>
      {erroGravacao && <Aviso>Não foi possível guardar neste dispositivo (espaço cheio ou navegação privada). Exporta uma cópia de segurança.</Aviso>}
      <div className="grelha">
        <Cartao titulo="Perfil">
          <CampoTexto rotulo="Nome" valor={p.nome} mudar={(nome) => mudarPerfil({ nome })} />
          <CampoTexto rotulo="Residência" valor={p.residencia} mudar={(residencia) => mudarPerfil({ residencia })} />
          <div className="linha-campos">
            <label className="campo">
              <span>Mês de referência do orçamento</span>
              <input type="month" value={p.mesReferencia ?? ''} onChange={(e) => mudarPerfil({ mesReferencia: e.target.value || null })} />
              <span className="dica">Vazio: usa sempre o mês atual ({mesDe(hoje)}).</span>
            </label>
            <CampoEscolha rotulo="Moeda" valor="EUR" mudar={() => undefined} opcoes={[{ valor: 'EUR', nome: 'Euro (€)' }]} dica="Formatos de número e data de Portugal." />
          </div>
          <p className="mais-suave pequeno">O salário e os subsídios editam-se em Receitas (valor bruto e líquido).</p>
        </Cartao>

        <Cartao titulo="Aparência">
          <Segmentos rotulo="Tema" valor={p.tema} mudar={(tema) => mudarPerfil({ tema })} opcoes={[{ valor: 'sistema', nome: 'Automático' }, { valor: 'claro', nome: 'Claro' }, { valor: 'escuro', nome: 'Escuro' }]} />
          <CampoCaixa rotulo="Incluir o cartão-refeição no património" valor={p.incluirRefeicaoPatrimonio} mudar={(incluirRefeicaoPatrimonio) => mudarPerfil({ incluirRefeicaoPatrimonio })} dica="Nunca conta como dinheiro disponível." />
        </Cartao>

        <Cartao titulo="Pressupostos de cálculo">
          <CampoNumero rotulo="Retenção na fonte sobre juros" sufixo="%" min={0} max={100} valor={estado.pressupostos.retencaoJuros} mudar={(v) => atualizar((e) => ({ ...e, pressupostos: { ...e.pressupostos, retencaoJuros: v ?? 0 } }))} dica="Usada para calcular a TANL quando não a indicas na conta. Confirma a taxa em vigor." />
          <p className="mais-suave pequeno">Os pressupostos dos simuladores e projeções editam-se em cada simulador.</p>
        </Cartao>

        <Cartao titulo="Fonte de cotações (opcional)" subtitulo="Para atualizar o valor dos investimentos automaticamente.">
          <CampoTexto tipo="url" max={500} rotulo="Endereço" valor={estado.pressupostos.cotacoes.url} mudar={(url) => atualizar((e) => ({ ...e, pressupostos: { ...e.pressupostos, cotacoes: { ...e.pressupostos.cotacoes, url } } }))} exemplo="https://exemplo.com/cotacao/{id}" dica="Usa {id} no lugar do identificador do ativo. A fonte tem de devolver JSON e permitir pedidos do browser." />
          <CampoTexto rotulo="Caminho do preço no JSON" valor={estado.pressupostos.cotacoes.caminho} mudar={(caminho) => atualizar((e) => ({ ...e, pressupostos: { ...e.pressupostos, cotacoes: { ...e.pressupostos.cotacoes, caminho } } }))} exemplo="ex.: data.price" />
          <p className="mais-suave pequeno">Só são feitos pedidos quando tocas em “Atualizar cotações”. Apenas o identificador do ativo é enviado.</p>
        </Cartao>
      </div>

      <div className="grelha">
        <Categorias tipo="despesa" />
        <Categorias tipo="receita" />
      </div>

      <div className="grelha">
        <Cartao titulo="Segurança" subtitulo="Os dados ficam só neste dispositivo. A aplicação não precisa de acesso às tuas contas bancárias.">
          {protegido ? (
            <Aviso tom="positivo">Protegido com palavra-passe: os dados estão cifrados (AES-256) e a app bloqueia após 5 minutos em segundo plano.</Aviso>
          ) : (
            <Aviso tom="info">Sem palavra-passe: qualquer pessoa com acesso a este dispositivo pode abrir a aplicação.</Aviso>
          )}
          <div className="acoes">
            <button type="button" className={protegido ? '' : 'primario'} onClick={() => setPalavra('definir')} disabled={!criptoDisponivel()}>
              <Icone nome="cadeado" /> {protegido ? 'Alterar palavra-passe' : 'Definir palavra-passe'}
            </button>
            {protegido && (
              <>
                <button type="button" onClick={bloquear}>
                  Bloquear agora
                </button>
                <RemoverPalavraPasse />
              </>
            )}
          </div>
        </Cartao>

        <Cartao titulo="Dados e cópias de segurança">
          <div className="acoes">
            <button type="button" className="primario" onClick={exportarJson}>
              <Icone nome="exportar" /> Cópia de segurança
            </button>
            <button type="button" onClick={() => ficheiro.current?.click()}>
              <Icone nome="importar" /> Importar cópia
            </button>
            <input ref={ficheiro} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && importar(e.target.files[0]), (e.target.value = ''))} />
          </div>
          <div className="acoes">
            <button
              type="button"
              onClick={async () => {
                const blob = livroXlsx([
                  { nome: 'Movimentos', linhas: linhasMovimentos(estado, estado.movimentos) },
                  { nome: 'Contas', linhas: linhasContas(estado, hoje) },
                  { nome: 'Investimentos', linhas: linhasInvestimentos(estado) },
                ]);
                if ((await entregarFicheiro(`capital-${hoje}.xlsx`, blob)) !== 'cancelado') avisar('Excel exportado.');
              }}
            >
              Exportar tudo (Excel)
            </button>
            <button type="button" onClick={async () => (await entregarFicheiro(`movimentos-${hoje}.csv`, paraCsv(linhasMovimentos(estado, estado.movimentos)))) !== 'cancelado' && avisar('CSV exportado.')}>
              Movimentos (CSV)
            </button>
          </div>
          <p className="mais-suave pequeno">A cópia de segurança (JSON) é a única forma de recuperar os dados noutro dispositivo. Guarda-a num local seguro: não está cifrada.</p>
          <div className="acoes">
            <button type="button" className="perigo" onClick={async () => (await confirmar('Repor os dados iniciais? Perdes todos os registos atuais.', { botao: 'Repor', perigo: true })) && substituir(estadoInicial(hoje))}>
              Repor dados iniciais
            </button>
            <button type="button" className="perigo" onClick={async () => (await confirmar('Apagar todos os dados e começar do zero?', { botao: 'Apagar tudo', perigo: true })) && substituir(estadoVazio(hoje))}>
              Apagar tudo
            </button>
          </div>
        </Cartao>
      </div>
      <p className="nota-simulacao">
        Esta aplicação ajuda-te a organizar e compreender as tuas finanças. Não toma decisões por ti, não recomenda produtos financeiros e não presta aconselhamento financeiro.
      </p>
      {palavra && <DefinirPalavraPasse aoFechar={() => setPalavra(null)} />}
    </>
  );
}

function Categorias({ tipo }: { tipo: 'receita' | 'despesa' }) {
  const { estado, atualizar } = useLoja();
  const { confirmar } = useInteracoes();
  const [nova, setNova] = useState('');
  const lista = estado.categorias.filter((c) => c.tipo === tipo);
  const renomear = (c: Categoria, nome: string) => atualizar((e) => ({ ...e, categorias: e.categorias.map((x) => (x.id === c.id ? { ...x, nome } : x)) }));
  const apagar = async (c: Categoria) => {
    const usos = estado.movimentos.filter((m) => m.categoriaId === c.id).length + estado.recorrentes.filter((r) => r.categoriaId === c.id).length;
    const destino = lista.find((x) => x.id !== c.id && /^outr/i.test(x.nome)) ?? lista.find((x) => x.id !== c.id);
    if (!destino) return;
    if (!(await confirmar(usos ? `Apagar "${c.nome}"? ${usos} registo(s) passam para "${destino.nome}".` : `Apagar "${c.nome}"?`, { botao: 'Apagar', perigo: true }))) return;
    atualizar((e) => ({
      ...e,
      categorias: e.categorias.filter((x) => x.id !== c.id),
      movimentos: e.movimentos.map((m) => (m.categoriaId === c.id ? { ...m, categoriaId: destino.id } : m)),
      recorrentes: e.recorrentes.map((r) => (r.categoriaId === c.id ? { ...r, categoriaId: destino.id } : r)),
    }));
  };
  return (
    <Cartao titulo={tipo === 'despesa' ? 'Categorias de despesa' : 'Categorias de receita'}>
      {lista.map((c) => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
          <CampoTexto rotulo="" valor={c.nome} mudar={(n) => renomear(c, n)} max={60} />
          <button type="button" className="fantasma icone perigo" aria-label={`Apagar ${c.nome}`} onClick={() => apagar(c)} disabled={lista.length <= 1}>
            <Icone nome="lixo" />
          </button>
        </div>
      ))}
      <form
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!nova.trim()) return;
          atualizar((x) => ({ ...x, categorias: [...x.categorias, { id: novoId(), nome: nova.trim(), tipo, orcamento: null }] }));
          setNova('');
        }}
      >
        <CampoTexto rotulo="Nova categoria" valor={nova} mudar={setNova} max={60} />
        <button type="submit" disabled={!nova.trim()}>
          Adicionar
        </button>
      </form>
    </Cartao>
  );
}

function DefinirPalavraPasse({ aoFechar }: { aoFechar: () => void }) {
  const { definirPalavraPasse } = useLoja();
  const { avisar } = useInteracoes();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const erro = a.length > 0 && a.length < 8 ? 'Usa pelo menos 8 caracteres.' : b && a !== b ? 'As palavras-passe não coincidem.' : '';
  return (
    <Modal
      titulo="Palavra-passe"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!!erro || a.length < 8 || a !== b || aGuardar}
            onClick={async () => {
              setAGuardar(true);
              await definirPalavraPasse(a);
              avisar('Dados cifrados com a nova palavra-passe.');
              aoFechar();
            }}
          >
            {aGuardar ? 'A cifrar…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="formulario">
        <Aviso>Se esqueceres a palavra-passe, não é possível recuperar os dados. Exporta uma cópia de segurança antes.</Aviso>
        <CampoTexto tipo="password" rotulo="Nova palavra-passe" valor={a} mudar={setA} max={200} />
        <CampoTexto tipo="password" rotulo="Repetir" valor={b} mudar={setB} max={200} />
        {erro && <p className="negativo pequeno">{erro}</p>}
      </div>
    </Modal>
  );
}

function RemoverPalavraPasse() {
  const { definirPalavraPasse } = useLoja();
  const { confirmar, avisar } = useInteracoes();
  return (
    <button
      type="button"
      className="perigo"
      onClick={async () => {
        if (!(await confirmar('Remover a palavra-passe? Os dados deixam de estar cifrados neste dispositivo.', { botao: 'Remover', perigo: true }))) return;
        await definirPalavraPasse(null);
        avisar('Palavra-passe removida.');
      }}
    >
      Remover palavra-passe
    </button>
  );
}

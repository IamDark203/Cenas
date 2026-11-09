import { useEffect, useState, type ComponentType } from 'react';
import { FormMovimento } from './componentes/FormMovimento';
import { Icone, type NomeIcone } from './componentes/icones';
import { Modal } from './componentes/janelas';
import { useResumo } from './estado/derivados';
import { useLoja } from './estado/loja';
import { irPara, type IdSeccao } from './navegacao';
import { Bloqueio } from './paginas/Bloqueio';
import Alertas from './paginas/Alertas';
import Alocacao from './paginas/Alocacao';
import Analise from './paginas/Analise';
import Contas from './paginas/Contas';
import Definicoes from './paginas/Definicoes';
import Despesas from './paginas/Despesas';
import Fundo from './paginas/Fundo';
import Investimentos from './paginas/Investimentos';
import Objetivos from './paginas/Objetivos';
import Painel from './paginas/Painel';
import Receitas from './paginas/Receitas';
import Relatorios from './paginas/Relatorios';

interface Seccao {
  id: IdSeccao;
  nome: string;
  curto?: string;
  icone: NomeIcone;
  grupo: string;
  Pagina: ComponentType;
}

export const SECCOES: Seccao[] = [
  { id: 'painel', nome: 'Painel', icone: 'painel', grupo: 'Visão geral', Pagina: Painel },
  { id: 'receitas', nome: 'Receitas', icone: 'receitas', grupo: 'Fluxos', Pagina: Receitas },
  { id: 'despesas', nome: 'Despesas e orçamento', curto: 'Despesas', icone: 'despesas', grupo: 'Fluxos', Pagina: Despesas },
  { id: 'contas', nome: 'Contas e património', curto: 'Contas', icone: 'contas', grupo: 'Património', Pagina: Contas },
  { id: 'fundo', nome: 'Fundo de emergência', curto: 'Emergência', icone: 'fundo', grupo: 'Património', Pagina: Fundo },
  { id: 'objetivos', nome: 'Objetivos de poupança', curto: 'Objetivos', icone: 'objetivos', grupo: 'Património', Pagina: Objetivos },
  { id: 'investimentos', nome: 'Investimentos', curto: 'Investir', icone: 'investimentos', grupo: 'Património', Pagina: Investimentos },
  { id: 'alocacao', nome: 'Simulador de alocação', curto: 'Alocação', icone: 'alocacao', grupo: 'Planeamento', Pagina: Alocacao },
  { id: 'analise', nome: 'Análise e projeções', curto: 'Análise', icone: 'analise', grupo: 'Planeamento', Pagina: Analise },
  { id: 'relatorios', nome: 'Relatórios', icone: 'relatorios', grupo: 'Planeamento', Pagina: Relatorios },
  { id: 'alertas', nome: 'Alertas', icone: 'alertas', grupo: 'Conta', Pagina: Alertas },
  { id: 'definicoes', nome: 'Definições', icone: 'definicoes', grupo: 'Conta', Pagina: Definicoes },
];

const NAV_INFERIOR: IdSeccao[] = ['painel', 'despesas', 'contas', 'investimentos'];

function lerHash(): IdSeccao {
  const h = window.location.hash.replace('#', '') as IdSeccao;
  return SECCOES.some((s) => s.id === h) ? h : 'painel';
}

export function App() {
  const { situacao, estado } = useLoja();
  const [atual, setAtual] = useState<IdSeccao>(lerHash);
  const [mais, setMais] = useState(false);
  const [novo, setNovo] = useState(false);
  const [rolado, setRolado] = useState(false);

  useEffect(() => {
    const aoMudar = () => {
      setAtual(lerHash());
      setMais(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', aoMudar);
    const rolar = () => setRolado(window.scrollY > 4);
    window.addEventListener('scroll', rolar, { passive: true });
    return () => {
      window.removeEventListener('hashchange', aoMudar);
      window.removeEventListener('scroll', rolar);
    };
  }, []);

  useEffect(() => {
    const t = estado.perfil.tema;
    if (t === 'sistema') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [estado.perfil.tema]);

  if (situacao === 'a-carregar') return null;
  if (situacao === 'bloqueado') return <Bloqueio />;

  const seccao = SECCOES.find((s) => s.id === atual) ?? SECCOES[0];
  const Pagina = seccao.Pagina;
  let grupoAnterior = '';

  return (
    <div className="app">
      <nav className="lateral" aria-label="Secções">
        <div className="marca">
          <span className="logo">€</span> Capital
        </div>
        {SECCOES.map((s) => {
          const cabeca = s.grupo !== grupoAnterior ? <div className="grupo">{s.grupo}</div> : null;
          grupoAnterior = s.grupo;
          return (
            <div key={s.id}>
              {cabeca}
              <button type="button" aria-current={s.id === atual ? 'page' : undefined} onClick={() => irPara(s.id)}>
                <Icone nome={s.icone} />
                {s.nome}
                {s.id === 'alertas' && <ContadorAlertas />}
              </button>
            </div>
          );
        })}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button type="button" className="primario" style={{ justifyContent: 'center', color: 'var(--acento-texto)' }} onClick={() => setNovo(true)}>
            <Icone nome="adicionar" /> Novo movimento
          </button>
        </div>
      </nav>

      <div className="principal">
        <header className={`topo${rolado ? ' com-sombra' : ''}`}>
          <h1>{seccao.nome}</h1>
          {atual !== 'alertas' && (
            <button type="button" className="fantasma icone" aria-label="Alertas" onClick={() => irPara('alertas')} style={{ position: 'relative' }}>
              <Icone nome="alertas" />
              <ContadorAlertas flutuante />
            </button>
          )}
        </header>
        <main className="conteudo" key={atual}>
          <Pagina />
        </main>
      </div>

      <button type="button" className="fab" aria-label="Novo movimento" onClick={() => setNovo(true)}>
        <Icone nome="adicionar" />
      </button>

      <nav className="inferior" aria-label="Navegação principal">
        {NAV_INFERIOR.map((id) => {
          const s = SECCOES.find((x) => x.id === id) as Seccao;
          return (
            <button key={id} type="button" aria-current={id === atual ? 'page' : undefined} onClick={() => irPara(id)}>
              <Icone nome={s.icone} />
              {s.curto ?? s.nome}
            </button>
          );
        })}
        <button type="button" aria-current={!NAV_INFERIOR.includes(atual) ? 'page' : undefined} onClick={() => setMais(true)}>
          <span className="icone-wrap">
            <Icone nome="mais" />
          </span>
          Mais
        </button>
      </nav>

      {mais && (
        <Modal titulo="Secções" aoFechar={() => setMais(false)}>
          <div className="mais-grelha">
            {SECCOES.filter((s) => !NAV_INFERIOR.includes(s.id)).map((s) => (
              <button key={s.id} type="button" onClick={() => irPara(s.id)}>
                <Icone nome={s.icone} />
                {s.curto ?? s.nome}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {novo && <FormMovimento aoFechar={() => setNovo(false)} />}
    </div>
  );
}

function ContadorAlertas({ flutuante }: { flutuante?: boolean }) {
  const { alertas } = useResumo();
  const n = alertas.filter((a) => a.nivel !== 'sucesso').length;
  if (!n) return null;
  return (
    <span
      className="contador"
      style={
        flutuante
          ? { position: 'absolute', top: 2, right: 0, background: 'var(--negativo)', color: '#fff', borderRadius: 99, fontSize: '0.65rem', minWidth: 16, height: 16, display: 'grid', placeItems: 'center', padding: '0 4px' }
          : undefined
      }
    >
      {n}
    </span>
  );
}

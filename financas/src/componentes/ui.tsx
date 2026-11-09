import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './icones';

export function Cartao({
  titulo,
  acoes,
  children,
  subtitulo,
  className,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`cartao${className ? ` ${className}` : ''}`}>
      {(titulo || acoes) && (
        <div className="cartao-cabeca">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {subtitulo && <p className="suave pequeno">{subtitulo}</p>}
          </div>
          {acoes && <div className="acoes">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  cor,
  destaque,
  classeValor,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: string;
  destaque?: boolean;
  classeValor?: string;
}) {
  return (
    <div className={`kpi${destaque ? ' destaque' : ''}`}>
      <div className="rotulo">
        {cor && <span className="ponto" style={{ background: cor }} />}
        {rotulo}
      </div>
      <div className={`valor${classeValor ? ` ${classeValor}` : ''}`}>{valor}</div>
      {detalhe && <div className="detalhe">{detalhe}</div>}
    </div>
  );
}

export function Barra({ fracao, cor, grande }: { fracao: number; cor?: string; grande?: boolean }) {
  const w = Math.max(0, Math.min(1, Number.isFinite(fracao) ? fracao : 0)) * 100;
  return (
    <div
      className={`barra${grande ? ' grande' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(w)}
    >
      <span style={{ width: `${w}%`, background: cor }} />
    </div>
  );
}

export function Vazio({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <p>{children}</p>
      {acao}
    </div>
  );
}

export function Etiqueta({ children, tom }: { children: ReactNode; tom?: 'acento' | 'positivo' | 'negativo' | 'aviso' }) {
  return <span className={`etiqueta${tom ? ` ${tom}` : ''}`}>{children}</span>;
}

export function Aviso({ children, tom = 'aviso' }: { children: ReactNode; tom?: 'aviso' | 'info' | 'positivo' }) {
  const icone: NomeIcone = tom === 'aviso' ? 'aviso' : tom === 'positivo' ? 'ok' : 'info';
  return (
    <div className={`aviso-caixa${tom === 'aviso' ? '' : ` ${tom}`}`}>
      <Icone nome={icone} />
      <div>{children}</div>
    </div>
  );
}

export function Legenda({ itens }: { itens: { nome: string; cor: string; valor: string }[] }) {
  return (
    <ul className="legenda">
      {itens.map((i) => (
        <li key={i.nome}>
          <span className="ponto" style={{ background: i.cor }} />
          <span>{i.nome}</span>
          <span className="v">{i.valor}</span>
        </li>
      ))}
    </ul>
  );
}

export function LinhasResumo({ linhas }: { linhas: [ReactNode, ReactNode, string?][] }) {
  return (
    <div className="resumo-linhas">
      {linhas.map(([a, b, cls], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: linhas estáticas
        <div key={i} className={cls}>
          <span className="suave">{a}</span>
          <span>{b}</span>
        </div>
      ))}
    </div>
  );
}

export function NotaSimulacao({ children }: { children?: ReactNode }) {
  return (
    <p className="nota-simulacao">
      {children ??
        'Simulação com pressupostos hipotéticos definidos por ti. Não é uma previsão nem uma garantia de rentabilidade, e não constitui aconselhamento financeiro.'}
    </p>
  );
}

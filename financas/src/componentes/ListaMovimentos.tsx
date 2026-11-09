import { useState } from 'react';
import { data as fmtData, euro } from '../dominio/formato';
import { nomeCategoria, ordenarMovimentos } from '../dominio/fluxos';
import { efeitoNaConta } from '../dominio/saldos';
import type { Movimento } from '../dominio/tipos';
import { NOMES_MEIO, nomeConta } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { FormMovimento } from './FormMovimento';
import { Icone } from './icones';
import { Etiqueta, Vazio } from './ui';

/** Lista de movimentos; clicar abre a edição. Com `contaId`, mostra o efeito no saldo dessa conta. */
export function ListaMovimentos({
  movimentos,
  contaId,
  limite = 200,
  vazio = 'Sem movimentos.',
}: {
  movimentos: Movimento[];
  contaId?: string;
  limite?: number;
  vazio?: string;
}) {
  const { estado } = useLoja();
  const [editar, setEditar] = useState<Movimento | null>(null);
  const [mostrar, setMostrar] = useState(limite);
  const refeicao = new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
  const lista = ordenarMovimentos(movimentos);
  if (!lista.length) return <Vazio>{vazio}</Vazio>;
  return (
    <>
      <div className="lista">
        {lista.slice(0, mostrar).map((m) => {
          const valor = contaId ? efeitoNaConta(m, contaId) : m.tipo === 'despesa' ? -m.valor : m.tipo === 'receita' ? m.valor : m.valor;
          const icone = m.tipo === 'receita' ? 'receitas' : m.tipo === 'despesa' ? 'despesas' : m.tipo === 'transferencia' ? 'transferir' : 'editar';
          const sub =
            m.tipo === 'transferencia'
              ? `${nomeConta(estado, m.contaId)} → ${nomeConta(estado, m.contaDestinoId)}`
              : m.tipo === 'ajuste'
                ? `Correção de saldo · ${nomeConta(estado, m.contaId)}`
                : `${nomeCategoria(estado, m.categoriaId)} · ${m.meio ? NOMES_MEIO[m.meio] : nomeConta(estado, m.contaId)}`;
          return (
            <div
              className="item clicavel"
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditar(m)}
              onKeyDown={(e) => e.key === 'Enter' && setEditar(m)}
            >
              <span className="avatar" style={m.tipo === 'receita' ? { color: 'var(--positivo)', background: 'var(--positivo-suave)' } : undefined}>
                <Icone nome={icone} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="titulo">{m.descricao}</div>
                <div className="sub">
                  <span>{fmtData(m.data)}</span>
                  <span>{sub}</span>
                  {refeicao.has(m.contaId) && m.tipo !== 'transferencia' && <Etiqueta tom="aviso">Cartão-refeição</Etiqueta>}
                  {m.recorrenteId && <Etiqueta>Recorrente</Etiqueta>}
                  {m.tipo === 'despesa' && <Etiqueta>{m.fixa ? 'Fixa' : 'Variável'}</Etiqueta>}
                </div>
              </div>
              <div className={`montante ${valor > 0 && m.tipo !== 'transferencia' ? 'positivo' : ''}`}>
                {m.tipo === 'transferencia' && !contaId ? euro(m.valor) : `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${euro(Math.abs(valor))}`}
              </div>
            </div>
          );
        })}
      </div>
      {lista.length > mostrar && (
        <button type="button" onClick={() => setMostrar((n) => n + 200)}>
          Mostrar mais ({lista.length - mostrar})
        </button>
      )}
      {editar && <FormMovimento inicial={editar} aoFechar={() => setEditar(null)} />}
    </>
  );
}

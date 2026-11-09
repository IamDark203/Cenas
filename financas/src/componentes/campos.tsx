import { useEffect, useId, useState, type ReactNode } from 'react';
import { lerNumero, paraCampo } from '../dominio/formato';

interface Base {
  rotulo: string;
  dica?: ReactNode;
}

export function CampoTexto({
  rotulo,
  dica,
  valor,
  mudar,
  obrigatorio,
  exemplo,
  tipo = 'text',
  max = 120,
}: Base & {
  valor: string;
  mudar: (v: string) => void;
  obrigatorio?: boolean;
  exemplo?: string;
  tipo?: 'text' | 'password' | 'url';
  max?: number;
}) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{rotulo}</span>
      <input
        id={id}
        type={tipo}
        value={valor}
        maxLength={max}
        required={obrigatorio}
        placeholder={exemplo}
        onChange={(e) => mudar(e.target.value)}
        autoComplete={tipo === 'password' ? 'new-password' : 'off'}
      />
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export function CampoArea({ rotulo, valor, mudar }: Base & { valor: string; mudar: (v: string) => void }) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{rotulo}</span>
      <textarea id={id} value={valor} maxLength={1000} rows={2} onChange={(e) => mudar(e.target.value)} />
    </label>
  );
}

/**
 * Campo numérico que aceita vírgula decimal (formato português).
 * Mantém o texto escrito enquanto o utilizador edita e só converte no fim.
 */
export function CampoNumero({
  rotulo,
  dica,
  valor,
  mudar,
  sufixo = '€',
  obrigatorio,
  permitirVazio,
  min,
  max,
}: Base & {
  valor: number | null;
  mudar: (v: number | null) => void;
  sufixo?: string;
  obrigatorio?: boolean;
  permitirVazio?: boolean;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const [texto, setTexto] = useState(paraCampo(valor));
  useEffect(() => {
    if (lerNumero(texto) !== valor) setTexto(paraCampo(valor));
    // biome-ignore lint/correctness/useExhaustiveDependencies: só sincroniza quando o valor muda por fora
  }, [valor]);
  const n = lerNumero(texto);
  const invalido = (texto !== '' && n == null) || (n != null && ((min != null && n < min) || (max != null && n > max)));
  return (
    <label className={`campo${invalido ? ' erro' : ''}`} htmlFor={id}>
      <span>{rotulo}</span>
      <span className="com-sufixo">
        <input
          id={id}
          inputMode="decimal"
          value={texto}
          required={obrigatorio}
          placeholder={permitirVazio ? '—' : '0'}
          onChange={(e) => {
            setTexto(e.target.value);
            const v = lerNumero(e.target.value);
            if (e.target.value.trim() === '') mudar(permitirVazio ? null : 0);
            else if (v != null) mudar(v);
          }}
          onBlur={() => setTexto(paraCampo(lerNumero(texto) ?? (permitirVazio ? null : 0)))}
        />
        {sufixo && <span className="sufixo">{sufixo}</span>}
      </span>
      {invalido ? <span className="dica negativo">Valor inválido</span> : dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export function CampoData({
  rotulo,
  dica,
  valor,
  mudar,
  obrigatorio,
}: Base & { valor: string | null; mudar: (v: string | null) => void; obrigatorio?: boolean }) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{rotulo}</span>
      <input id={id} type="date" value={valor ?? ''} required={obrigatorio} onChange={(e) => mudar(e.target.value || null)} />
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export function CampoEscolha<T extends string>({
  rotulo,
  dica,
  valor,
  mudar,
  opcoes,
}: Base & { valor: T; mudar: (v: T) => void; opcoes: { valor: T; nome: string }[] }) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{rotulo}</span>
      <select id={id} value={valor} onChange={(e) => mudar(e.target.value as T)}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nome}
          </option>
        ))}
      </select>
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export function CampoCaixa({ rotulo, valor, mudar, dica }: Base & { valor: boolean; mudar: (v: boolean) => void }) {
  return (
    <div className="campo">
      <label className="campo-caixa">
        <input type="checkbox" checked={valor} onChange={(e) => mudar(e.target.checked)} />
        <span>{rotulo}</span>
      </label>
      {dica && <span className="dica">{dica}</span>}
    </div>
  );
}

export function Segmentos<T extends string>({
  valor,
  mudar,
  opcoes,
  rotulo,
}: {
  valor: T;
  mudar: (v: T) => void;
  opcoes: { valor: T; nome: string }[];
  rotulo: string;
}) {
  return (
    <div className="segmentos" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => mudar(o.valor)}>
          {o.nome}
        </button>
      ))}
    </div>
  );
}

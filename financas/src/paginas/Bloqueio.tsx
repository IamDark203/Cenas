import { useState } from 'react';
import { Icone } from '../componentes/icones';
import { useLoja } from '../estado/loja';

export function Bloqueio() {
  const { desbloquear } = useLoja();
  const [palavra, setPalavra] = useState('');
  const [erro, setErro] = useState('');
  const [aEntrar, setAEntrar] = useState(false);
  return (
    <div className="bloqueio">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setAEntrar(true);
          const ok = await desbloquear(palavra);
          setAEntrar(false);
          if (!ok) setErro('Palavra-passe incorreta.');
        }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
          <span className="avatar" style={{ width: 56, height: 56, borderRadius: 16, color: 'var(--acento)', background: 'var(--acento-suave)' }}>
            <Icone nome="cadeado" />
          </span>
          <h1>Capital</h1>
          <p className="suave">Os teus dados estão cifrados neste dispositivo.</p>
        </div>
        <label className="campo" style={{ textAlign: 'left' }}>
          <span>Palavra-passe</span>
          <input type="password" autoComplete="current-password" value={palavra} onChange={(e) => (setPalavra(e.target.value), setErro(''))} autoFocus />
        </label>
        {erro && <p className="negativo pequeno">{erro}</p>}
        <button type="submit" className="primario" disabled={!palavra || aEntrar}>
          {aEntrar ? 'A abrir…' : 'Desbloquear'}
        </button>
      </form>
    </div>
  );
}

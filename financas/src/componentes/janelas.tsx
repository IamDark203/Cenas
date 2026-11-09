import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './icones';

export function Modal({
  titulo,
  aoFechar,
  children,
  rodape,
  largo,
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  // Corre só ao abrir: foca o primeiro campo, fecha com Escape e devolve o foco no fim.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fecharRef.current();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    const primeiro = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.fechar)');
    primeiro?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="fundo-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div className={`modal${largo ? ' largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="modal-cabeca">
          <h2>{titulo}</h2>
          <button type="button" className="fantasma icone fechar" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        {children}
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirmações e avisos ----------

interface PedidoConfirmacao {
  texto: string;
  botao?: string;
  perigo?: boolean;
  resolver: (ok: boolean) => void;
}

interface Interacoes {
  confirmar: (texto: string, opcoes?: { botao?: string; perigo?: boolean }) => Promise<boolean>;
  avisar: (texto: string) => void;
}

const ContextoInteracoes = createContext<Interacoes | null>(null);

export function ProvedorInteracoes({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const temporizador = useRef<number>();

  const confirmar = useCallback<Interacoes['confirmar']>(
    (texto, opcoes) => new Promise((resolver) => setPedido({ texto, ...opcoes, resolver })),
    [],
  );
  const avisar = useCallback((texto: string) => {
    setToast(texto);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const fechar = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };

  return (
    <ContextoInteracoes.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && (
        <Modal
          titulo="Confirmar"
          aoFechar={() => fechar(false)}
          rodape={
            <>
              <button type="button" onClick={() => fechar(false)}>
                Cancelar
              </button>
              <button type="button" className={`primario${pedido.perigo ? ' perigo' : ''}`} onClick={() => fechar(true)}>
                {pedido.botao ?? 'Confirmar'}
              </button>
            </>
          }
        >
          <p>{pedido.texto}</p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </ContextoInteracoes.Provider>
  );
}

export function useInteracoes(): Interacoes {
  const c = useContext(ContextoInteracoes);
  if (!c) throw new Error('useInteracoes fora do provedor');
  return c;
}

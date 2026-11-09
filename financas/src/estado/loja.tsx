import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { estadoInicial } from '../dominio/dadosIniciais';
import { hoje } from '../dominio/datas';
import { normalizarEstado } from '../dominio/normalizar';
import { lancarVencidas } from '../dominio/recorrencias';
import type { Estado } from '../dominio/tipos';
import { criptoDisponivel, derivarChave, novoSal } from './cripto';
import { abrirCifrado, gravar, lerGuardado, pedirArmazenamentoPersistente, type Sessao } from './persistencia';

type Situacao = 'a-carregar' | 'bloqueado' | 'pronto';

interface Loja {
  situacao: Situacao;
  estado: Estado;
  /** Data de hoje (AAAA-MM-DD), atualizada quando a app volta a ficar visível. */
  hoje: string;
  protegido: boolean;
  erroGravacao: boolean;
  atualizar: (f: (e: Estado) => Estado) => void;
  substituir: (e: Estado) => void;
  desbloquear: (palavraPasse: string) => Promise<boolean>;
  bloquear: () => void;
  definirPalavraPasse: (palavraPasse: string | null) => Promise<void>;
}

const Contexto = createContext<Loja | null>(null);

const MINUTOS_BLOQUEIO = 5;

function comVencidas(e: Estado, data: string): Estado {
  return lancarVencidas(e, data) ?? e;
}

export function ProvedorLoja({ children }: { children: ReactNode }) {
  const [situacao, setSituacao] = useState<Situacao>('a-carregar');
  const [estado, setEstado] = useState<Estado>(() => estadoInicial());
  const [dataHoje, setDataHoje] = useState(hoje());
  const [erroGravacao, setErroGravacao] = useState(false);
  const sessao = useRef<Sessao | null>(null);
  const [protegido, setProtegido] = useState(false);
  const pronto = useRef(false);

  // Carregamento inicial.
  useEffect(() => {
    pedirArmazenamentoPersistente();
    const g = lerGuardado();
    if (g?.formato === 'cifrado') {
      setProtegido(true);
      setSituacao('bloqueado');
      return;
    }
    let e: Estado;
    try {
      e = g ? normalizarEstado(g.estado) : estadoInicial();
    } catch {
      e = estadoInicial();
    }
    setEstado(comVencidas(e, hoje()));
    pronto.current = true;
    setSituacao('pronto');
  }, []);

  // Grava cada alteração (cifrada se houver palavra-passe).
  useEffect(() => {
    if (!pronto.current || situacao !== 'pronto') return;
    const t = setTimeout(() => {
      gravar(estado, sessao.current).then((ok) => setErroGravacao(!ok));
    }, 250);
    return () => clearTimeout(t);
  }, [estado, situacao]);

  // Ao voltar à app: atualiza a data, lança recorrências vencidas e bloqueia se esteve muito tempo fora.
  useEffect(() => {
    let escondidoDesde = 0;
    const aoMudar = () => {
      if (document.visibilityState === 'hidden') {
        escondidoDesde = Date.now();
        return;
      }
      if (sessao.current && escondidoDesde && Date.now() - escondidoDesde > MINUTOS_BLOQUEIO * 60_000) {
        bloquearAgora();
        return;
      }
      const d = hoje();
      setDataHoje(d);
      if (pronto.current) setEstado((e) => comVencidas(e, d));
    };
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  });

  const bloquearAgora = () => {
    if (!sessao.current) return;
    sessao.current = null;
    pronto.current = false;
    setEstado(estadoInicial());
    setSituacao('bloqueado');
  };

  const atualizar = useCallback((f: (e: Estado) => Estado) => {
    setEstado((e) => comVencidas(f(e), hoje()));
  }, []);

  const substituir = useCallback((e: Estado) => setEstado(comVencidas(e, hoje())), []);

  const desbloquear = useCallback(async (palavraPasse: string) => {
    const g = lerGuardado();
    if (g?.formato !== 'cifrado') return false;
    try {
      const { dados, sessao: s } = await abrirCifrado(g, palavraPasse);
      sessao.current = s;
      setEstado(comVencidas(normalizarEstado(dados), hoje()));
      pronto.current = true;
      setSituacao('pronto');
      return true;
    } catch {
      return false;
    }
  }, []);

  const definirPalavraPasse = useCallback(
    async (palavraPasse: string | null) => {
      if (palavraPasse && !criptoDisponivel()) throw new Error('Este browser não suporta cifra.');
      if (palavraPasse) {
        const sal = novoSal();
        sessao.current = { chave: await derivarChave(palavraPasse, sal), sal };
      } else {
        sessao.current = null;
      }
      setProtegido(!!palavraPasse);
      const ok = await gravar(estado, sessao.current);
      setErroGravacao(!ok);
    },
    [estado],
  );

  const valor = useMemo<Loja>(
    () => ({
      situacao,
      estado,
      hoje: dataHoje,
      protegido,
      erroGravacao,
      atualizar,
      substituir,
      desbloquear,
      bloquear: bloquearAgora,
      definirPalavraPasse,
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: bloquearAgora só usa refs e setters estáveis
    [situacao, estado, dataHoje, protegido, erroGravacao, atualizar, substituir, desbloquear, definirPalavraPasse],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useLoja(): Loja {
  const l = useContext(Contexto);
  if (!l) throw new Error('useLoja fora do ProvedorLoja');
  return l;
}

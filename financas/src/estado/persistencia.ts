import type { Estado } from '../dominio/tipos';
import { cifrar, decifrar, derivarChave, ITERACOES } from './cripto';

export const CHAVE_ARMAZENAMENTO = 'capital.v1';

export type Guardado =
  | { formato: 'aberto'; estado: unknown }
  | { formato: 'cifrado'; sal: string; iteracoes: number; iv: string; dados: string };

export function lerGuardado(): Guardado | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (!bruto) return null;
    const g = JSON.parse(bruto) as Guardado;
    return g && (g.formato === 'aberto' || g.formato === 'cifrado') ? g : null;
  } catch {
    return null;
  }
}

export interface Sessao {
  chave: CryptoKey;
  sal: string;
}

export async function gravar(estado: Estado, sessao: Sessao | null): Promise<boolean> {
  try {
    let g: Guardado;
    if (sessao) {
      const { iv, dados } = await cifrar(sessao.chave, JSON.stringify(estado));
      g = { formato: 'cifrado', sal: sessao.sal, iteracoes: ITERACOES, iv, dados };
    } else {
      g = { formato: 'aberto', estado };
    }
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}

export async function abrirCifrado(g: Extract<Guardado, { formato: 'cifrado' }>, palavraPasse: string) {
  const chave = await derivarChave(palavraPasse, g.sal, g.iteracoes);
  const texto = await decifrar(chave, g.iv, g.dados);
  return { dados: JSON.parse(texto) as unknown, sessao: { chave, sal: g.sal } };
}

/** Pede ao browser que não apague estes dados quando falta espaço. */
export function pedirArmazenamentoPersistente(): void {
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* sem suporte */
  }
}

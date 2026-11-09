// Cifra local dos dados com palavra-passe (Web Crypto: PBKDF2-SHA-256 + AES-GCM 256).
// A palavra-passe nunca é guardada; sem ela os dados não podem ser recuperados.

export const ITERACOES = 310_000;

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const deB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function criptoDisponivel(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function novoSal(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivarChave(palavraPasse: string, sal: string, iteracoes = ITERACOES): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(palavraPasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: deB64(sal), iterations: iteracoes, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrar(chave: CryptoKey, texto: string): Promise<{ iv: string; dados: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto));
  return { iv: b64(iv), dados: b64(dados) };
}

/** Lança erro se a palavra-passe estiver errada (a autenticação do AES-GCM falha). */
export async function decifrar(chave: CryptoKey, iv: string, dados: string): Promise<string> {
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, chave, deB64(dados));
  return new TextDecoder().decode(claro);
}

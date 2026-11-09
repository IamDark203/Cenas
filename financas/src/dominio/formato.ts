// Formatos de Portugal: 1234,56 €, 12,5 %, 09/11/2026.

const euroFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const euroCurto = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 4 });
const dataFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const mesFmt = new Intl.DateTimeFormat('pt-PT', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const mesLongoFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const euro = (v: number): string => euroFmt.format(Number.isFinite(v) ? v : 0);
export const euroRedondo = (v: number): string => euroCurto.format(Number.isFinite(v) ? v : 0);
export const pct = (fracao: number): string => pctFmt.format(Number.isFinite(fracao) ? fracao : 0);
export const numero = (v: number): string => numFmt.format(v);

export function sinal(v: number): string {
  return v > 0 ? `+${euro(v)}` : euro(v);
}

export function data(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dataFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** "nov. 26" a partir de "2026-11". */
export function mesCurto(mes: string): string {
  return mesFmt.format(new Date(`${mes}-01T00:00:00Z`)).replace(' de ', ' ');
}

/** "novembro de 2026" a partir de "2026-11". */
export function mesLongo(mes: string): string {
  return mesLongoFmt.format(new Date(`${mes}-01T00:00:00Z`));
}

/**
 * Converte texto escrito pelo utilizador em número. Aceita "1.234,56", "1234,56", "1234.56" e "1 234,56".
 * Devolve null se não for um número.
 */
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (texto == null) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let t = texto.replace(/[\s €%]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Número para mostrar num campo editável (vírgula decimal, sem separador de milhares). */
export function paraCampo(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 10000) / 10000).replace('.', ',');
}

export const arred = (v: number): number => Math.round(v * 100) / 100;

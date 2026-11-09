// Datas como texto ISO (AAAA-MM-DD), sem fusos horários.

export function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

const dois = (n: number): string => String(n).padStart(2, '0');

export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

export function diasNoMes(ano: number, mes1: number): number {
  return new Date(Date.UTC(ano, mes1, 0)).getUTCDate();
}

/** Soma meses mantendo o dia âncora (31 jan + 1 mês = 28/29 fev). */
export function somarMeses(iso: string, meses: number, diaAncora?: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes1 = (total % 12) + 1;
  const dia = Math.min(diaAncora ?? d, diasNoMes(ano, mes1));
  return `${ano}-${dois(mes1)}-${dois(dia)}`;
}

export function somarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function diferencaDias(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

export function inicioMes(mes: string): string {
  return `${mes}-01`;
}

export function fimMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${dois(diasNoMes(a, m))}`;
}

export function somarMesesMes(mes: string, n: number): string {
  return mesDe(somarMeses(`${mes}-01`, n));
}

/** Lista de meses (AAAA-MM) de `de` até `ate`, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let m = de;
  while (m <= ate && out.length < 600) {
    out.push(m);
    m = somarMesesMes(m, 1);
  }
  return out;
}

export type Periodo = '1m' | '3m' | '6m' | '12m' | 'tudo';

export const NOMES_PERIODO: Record<Periodo, string> = {
  '1m': 'Mês atual',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '12m': 'Último ano',
  tudo: 'Histórico completo',
};

/** Meses incluídos num período, a terminar no mês de referência. */
export function mesesDoPeriodo(periodo: Periodo, mesRef: string, primeiroMes: string): string[] {
  const n = { '1m': 1, '3m': 3, '6m': 6, '12m': 12, tudo: 0 }[periodo];
  const inicio = n === 0 ? primeiroMes : somarMesesMes(mesRef, -(n - 1));
  return mesesEntre(inicio, mesRef);
}

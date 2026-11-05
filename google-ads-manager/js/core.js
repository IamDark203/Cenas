/*
 * Lógica pura (sem DOM): datas, períodos, rateio de registos, conflitos e ritmo mensal.
 * Funciona no browser (global `Core`) e em Node (module.exports) para testes.
 */
(function (root) {
  const NUM_FIELDS = ['impressoes', 'cliques', 'custo', 'conversoes', 'valor'];
  const DAY = 86400000;

  // ---------- Datas (sempre strings AAAA-MM-DD, sem fuso horário) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toUTC = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const fromUTC = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
  const localToday = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const addDays = (s, n) => fromUTC(toUTC(s) + n * DAY);
  const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
  const dayCount = (a, b) => daysBetween(a, b) + 1;
  const weekday = (s) => new Date(toUTC(s)).getUTCDay(); // 0 = domingo
  const startOfWeek = (s) => addDays(s, -((weekday(s) + 6) % 7)); // segunda-feira
  const endOfWeek = (s) => addDays(startOfWeek(s), 6);
  const startOfMonth = (s) => `${s.slice(0, 7)}-01`;
  const daysInMonth = (s) => {
    const [y, m] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  };
  const endOfMonth = (s) => `${s.slice(0, 7)}-${pad(daysInMonth(s))}`;
  const addMonths = (s, n) => {
    const [y, m] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
  };
  const maxDate = (a, b) => (a > b ? a : b);
  const minDate = (a, b) => (a < b ? a : b);

  // ---------- Registos com período ----------
  /** Dias do registo (inclusivo). */
  const recDays = (r) => dayCount(r.inicio, r.fim);

  /**
   * Parte do registo que cai em [from, to], com os valores rateados de forma proporcional aos dias.
   * Devolve null se não houver sobreposição.
   */
  function clip(r, from, to) {
    const a = maxDate(r.inicio, from);
    const b = minDate(r.fim, to);
    if (a > b) return null;
    const f = dayCount(a, b) / recDays(r);
    if (f === 1) return r;
    const out = { ...r, inicio: a, fim: b };
    for (const k of NUM_FIELDS) out[k] = (r[k] || 0) * f;
    return out;
  }

  const sliceRecords = (records, from, to) => records.map((r) => clip(r, from, to)).filter(Boolean);
  const overlaps = (r, from, to) => r.inicio <= to && r.fim >= from;

  /** Caminho de detalhe do registo: [] = total da campanha, [grupo], [grupo, palavra]. */
  function levelPath(r) {
    const p = [];
    if (r.grupo) {
      p.push(r.grupo.trim().toLowerCase());
      if (r.palavra) p.push(r.palavra.trim().toLowerCase());
    }
    return p;
  }
  const isPrefix = (a, b) => a.every((v, i) => b[i] === v);

  /**
   * Procura um registo que entre em conflito com `cand`: mesma campanha, períodos sobrepostos e
   * níveis de detalhe que se contêm (ex.: total da campanha vs. grupo, ou o mesmo grupo duas vezes).
   * Assim nada é contado em duplicado.
   */
  function findConflict(records, cand) {
    const pc = levelPath(cand);
    return (
      records.find((r) => {
        if (r.id && r.id === cand.id) return false;
        if (r.campaignId !== cand.campaignId) return false;
        if (!overlaps(r, cand.inicio, cand.fim)) return false;
        const pr = levelPath(r);
        return isPrefix(pr, pc) || isPrefix(pc, pr);
      }) || null
    );
  }

  /** Valida um registo; devolve uma mensagem de erro ou null. */
  function validateRecord(r) {
    if (!r.campaignId) return 'Escolha a campanha.';
    if (!isIsoDate(r.inicio) || !isIsoDate(r.fim)) return 'Indique um período válido.';
    if (r.fim < r.inicio) return 'A data final não pode ser anterior à data inicial.';
    if (r.palavra && !r.grupo) return 'Para registar uma palavra-chave indique também o grupo de anúncios.';
    for (const k of NUM_FIELDS) {
      if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) return 'Há valores inválidos.';
      if (r[k] < 0) return 'Os valores não podem ser negativos.';
    }
    if (!Number.isInteger(r.impressoes) || !Number.isInteger(r.cliques)) return 'Impressões e cliques têm de ser números inteiros.';
    if (r.impressoes > 0 && r.cliques > r.impressoes) return 'O número de cliques não pode exceder as impressões.';
    return null;
  }

  // ---------- Agrupamento temporal ----------
  function bucketStart(d, gran) {
    if (gran === 'semana') return startOfWeek(d);
    if (gran === 'mes') return startOfMonth(d);
    return d;
  }
  function bucketEnd(d, gran) {
    if (gran === 'semana') return endOfWeek(d);
    if (gran === 'mes') return endOfMonth(d);
    return d;
  }

  /** Lista de intervalos [from, to] que cobrem o período, cortados às extremidades. */
  function buckets(from, to, gran) {
    const out = [];
    let s = bucketStart(from, gran);
    while (s <= to) {
      const e = bucketEnd(s, gran);
      out.push({ from: maxDate(s, from), to: minDate(e, to), start: s, end: e });
      s = addDays(e, 1);
    }
    return out;
  }

  // ---------- Agregação ----------
  const safeDiv = (a, b) => (b > 0 ? a / b : null);
  function aggregate(records) {
    const t = { impressoes: 0, cliques: 0, custo: 0, conversoes: 0, valor: 0, n: records.length };
    for (const r of records) for (const k of NUM_FIELDS) t[k] += r[k] || 0;
    t.ctr = safeDiv(t.cliques, t.impressoes);
    t.cpc = safeDiv(t.custo, t.cliques);
    t.taxaConv = safeDiv(t.conversoes, t.cliques);
    t.cpa = safeDiv(t.custo, t.conversoes);
    t.roas = t.valor > 0 ? safeDiv(t.valor, t.custo) : null;
    return t;
  }

  /** Série temporal: para cada intervalo, métricas agregadas (null quando não há registos). */
  function series(records, from, to, gran) {
    return buckets(from, to, gran).map((b) => {
      const part = sliceRecords(records, b.from, b.to);
      return { ...b, totals: part.length ? aggregate(part) : null };
    });
  }

  // ---------- Ritmo mensal ----------
  /** Orçamento mensal de uma campanha: o mensal explícito, ou o diário × dias do mês. */
  function monthlyBudget(c, month) {
    if (c.orcamentoMensal > 0) return c.orcamentoMensal;
    if (c.orcamento > 0) return c.orcamento * daysInMonth(month);
    return null;
  }

  /**
   * Ritmo do mês para um conjunto de registos.
   * `month` é qualquer data do mês; `today` limita a projeção ao que já passou.
   * A projeção usa os dias com dados (até ao último dia registado no mês).
   */
  function pacing(records, month, today, budget, goalConv) {
    const ms = startOfMonth(month);
    const me = endOfMonth(month);
    const dim = daysInMonth(month);
    const part = sliceRecords(records, ms, me);
    const t = aggregate(part);
    let coveredTo = null;
    for (const r of part) coveredTo = coveredTo ? maxDate(coveredTo, r.fim) : r.fim;
    const isPast = me < today;
    const isFuture = ms > today;
    const elapsed = coveredTo ? dayCount(ms, coveredTo) : 0;
    const complete = isPast || elapsed >= dim;
    const factor = complete ? 1 : elapsed > 0 ? dim / elapsed : null;
    const projCusto = factor === null ? null : t.custo * factor;
    const projConv = factor === null ? null : t.conversoes * factor;
    return {
      inicio: ms,
      fim: me,
      dias: dim,
      diasComDados: elapsed,
      completo: complete,
      futuro: isFuture,
      custo: t.custo,
      conversoes: t.conversoes,
      orcamento: budget,
      objetivoConv: goalConv || null,
      projCusto,
      projConv,
      pctGasto: budget ? t.custo / budget : null,
      pctProj: budget && projCusto !== null ? projCusto / budget : null,
      pctConv: goalConv ? t.conversoes / goalConv : null,
      pctConvProj: goalConv && projConv !== null ? projConv / goalConv : null,
      ritmoDiarioRestante:
        budget && !complete && dim - elapsed > 0 ? Math.max(0, budget - t.custo) / (dim - elapsed) : null,
    };
  }

  /** Classificação do ritmo de gasto face ao orçamento. */
  function pacingStatus(p) {
    if (p.pctProj === null) return null;
    if (p.pctProj > 1.05) return 'acima';
    if (p.pctProj < 0.85) return 'abaixo';
    return 'ok';
  }

  // ---------- Números e CSV ----------
  function toNum(s) {
    if (typeof s === 'number') return s;
    let v = String(s ?? '').trim().replace(/[€\s% ]/g, '');
    if (v === '') return 0;
    if (v.includes(',') && v.includes('.')) {
      v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    } else if (v.includes(',')) {
      v = v.replace(',', '.');
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function toIsoDate(s) {
    const v = String(s ?? '').trim();
    if (isIsoDate(v)) return v;
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) return null;
    const out = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return isIsoDate(out) ? out : null;
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvNum = (v) => String(Math.round((v || 0) * 100) / 100).replace('.', ',');

  // ---------- Migração de dados ----------
  const SCHEMA = 2;

  /** Converte qualquer versão anterior para o formato atual. Não altera o objeto recebido. */
  function migrate(data, uid) {
    const d = JSON.parse(JSON.stringify(data || {}));
    if (!Array.isArray(d.campaigns)) d.campaigns = [];
    if (!Array.isArray(d.records)) d.records = [];
    if (!Array.isArray(d.notes)) d.notes = [];
    if (!Array.isArray(d.accounts) || d.accounts.length === 0) {
      d.accounts = [{ id: uid(), nome: 'Conta principal' }];
    }
    const firstAccount = d.accounts[0].id;
    for (const c of d.campaigns) {
      if (!c.accountId || !d.accounts.some((a) => a.id === c.accountId)) c.accountId = firstAccount;
      c.estado = c.estado || 'ativa';
    }
    for (const r of d.records) {
      if (!r.inicio) r.inicio = r.data;
      if (!r.fim) r.fim = r.inicio;
      delete r.data;
      r.grupo = r.grupo || '';
      r.palavra = r.palavra || '';
      for (const k of NUM_FIELDS) r[k] = Number(r[k]) || 0;
    }
    d.records = d.records.filter((r) => isIsoDate(r.inicio) && isIsoDate(r.fim) && d.campaigns.some((c) => c.id === r.campaignId));
    for (const n of d.notes) {
      if (!n.accountId) n.accountId = firstAccount;
    }
    if (!d.currentAccountId || !d.accounts.some((a) => a.id === d.currentAccountId)) d.currentAccountId = firstAccount;
    d.meta = d.meta || {};
    d.versao = SCHEMA;
    return d;
  }

  /** Junta `incoming` em `base` (por id; o que vem no ficheiro prevalece). */
  function merge(base, incoming) {
    const out = JSON.parse(JSON.stringify(base));
    for (const key of ['accounts', 'campaigns', 'records', 'notes']) {
      const map = new Map(out[key].map((x) => [x.id, x]));
      for (const x of incoming[key]) map.set(x.id, x);
      out[key] = [...map.values()];
    }
    return out;
  }

  const Core = {
    NUM_FIELDS, SCHEMA,
    isIsoDate, localToday, addDays, daysBetween, dayCount, weekday, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, daysInMonth, addMonths, maxDate, minDate,
    recDays, clip, sliceRecords, overlaps, levelPath, findConflict, validateRecord,
    bucketStart, bucketEnd, buckets, aggregate, series,
    monthlyBudget, pacing, pacingStatus,
    toNum, toIsoDate, parseCsv, csvCell, csvNum, migrate, merge,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);

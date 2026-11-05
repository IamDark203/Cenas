/* Formatação (pt-PT) e definições das métricas. */
const Fmt = (() => {
  const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const int = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct0 = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 0 });
  const pct1 = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 });
  const dShort = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const dFull = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const dLong = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dWeekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mLong = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mOnly = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
  const mShort = { format: (d) => `${mOnly.format(d).replace('.', '')} ${String(d.getUTCFullYear()).slice(2)}` };
  const dt = (s) => new Date(`${s}T00:00:00Z`);

  const DEFS = {
    custo: { label: 'Custo', fmt: (v) => eur.format(v), axis: (v) => `${compact.format(v)} €`, better: 'neutral' },
    impressoes: { label: 'Impressões', fmt: (v) => int.format(v), axis: (v) => compact.format(v), better: 'up' },
    cliques: { label: 'Cliques', fmt: (v) => int.format(v), axis: (v) => compact.format(v), better: 'up' },
    conversoes: { label: 'Conversões', fmt: (v) => dec.format(v), axis: (v) => compact.format(v), better: 'up' },
    valor: { label: 'Valor de conversão', fmt: (v) => eur.format(v), axis: (v) => `${compact.format(v)} €`, better: 'up' },
    ctr: { label: 'CTR', fmt: (v) => pct.format(v), axis: (v) => pct1.format(v), better: 'up' },
    cpc: { label: 'CPC médio', fmt: (v) => eur.format(v), axis: (v) => eur.format(v), better: 'down' },
    taxaConv: { label: 'Taxa de conversão', fmt: (v) => pct.format(v), axis: (v) => pct1.format(v), better: 'up' },
    cpa: { label: 'Custo / conversão', fmt: (v) => eur.format(v), axis: (v) => eur.format(v), better: 'down' },
    roas: { label: 'ROAS', fmt: (v) => `${dec.format(v)}×`, axis: (v) => `${dec.format(v)}×`, better: 'up' },
  };

  function metric(key, value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return DEFS[key].fmt(value);
  }

  /** Período legível: "05/11/2026" ou "02/11/2026 – 08/11/2026" ou "novembro de 2026". */
  function period(a, b) {
    if (a === b) return dFull.format(dt(a));
    if (a === Core.startOfMonth(a) && b === Core.endOfMonth(a)) return cap(mLong.format(dt(a)));
    return `${dFull.format(dt(a))} – ${dFull.format(dt(b))}`;
  }

  /** Rótulo curto de um intervalo do gráfico. */
  function bucket(b, gran) {
    if (gran === 'mes') return mShort.format(dt(b.start));
    return dShort.format(dt(b.from));
  }
  function bucketLong(b, gran) {
    if (gran === 'mes') return cap(mLong.format(dt(b.start)));
    if (gran === 'semana') return `Semana de ${dShort.format(dt(b.from))} a ${dShort.format(dt(b.to))}`;
    return cap(dWeekday.format(dt(b.from)));
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function ago(isoDateTime) {
    if (!isoDateTime) return null;
    const ms = Date.now() - new Date(isoDateTime).getTime();
    const d = Math.floor(ms / 86400000);
    if (d <= 0) return 'hoje';
    if (d === 1) return 'ontem';
    return `há ${d} dias`;
  }

  return {
    eur, int, dec, pct, pct0, pct1, DEFS, metric, period, bucket, bucketLong, cap, esc, ago,
    date: (s) => dFull.format(dt(s)),
    dateLong: (s) => dLong.format(dt(s)),
    month: (s) => cap(mLong.format(dt(s))),
  };
})();

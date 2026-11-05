/* Cálculo de métricas e formatação (pt-PT). */
const Metrics = (() => {
  const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const int = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 });

  const safeDiv = (a, b) => (b > 0 ? a / b : null);

  function aggregate(records) {
    const t = { impressoes: 0, cliques: 0, custo: 0, conversoes: 0, valor: 0, dias: 0 };
    for (const r of records) {
      t.impressoes += r.impressoes || 0;
      t.cliques += r.cliques || 0;
      t.custo += r.custo || 0;
      t.conversoes += r.conversoes || 0;
      t.valor += r.valor || 0;
      t.dias += 1;
    }
    return withDerived(t);
  }

  function withDerived(t) {
    return {
      ...t,
      ctr: safeDiv(t.cliques, t.impressoes),
      cpc: safeDiv(t.custo, t.cliques),
      taxaConv: safeDiv(t.conversoes, t.cliques),
      cpa: safeDiv(t.custo, t.conversoes),
      roas: t.valor > 0 ? safeDiv(t.valor, t.custo) : null,
    };
  }

  const DEFS = {
    custo: { label: 'Custo', fmt: (v) => eur.format(v), axis: (v) => `${compact.format(v)} €`, better: 'neutral' },
    impressoes: { label: 'Impressões', fmt: (v) => int.format(v), axis: (v) => compact.format(v), better: 'up' },
    cliques: { label: 'Cliques', fmt: (v) => int.format(v), axis: (v) => compact.format(v), better: 'up' },
    conversoes: { label: 'Conversões', fmt: (v) => dec.format(v), axis: (v) => compact.format(v), better: 'up' },
    valor: { label: 'Valor de conversão', fmt: (v) => eur.format(v), axis: (v) => `${compact.format(v)} €`, better: 'up' },
    ctr: { label: 'CTR', fmt: (v) => pct.format(v), axis: (v) => pct.format(v), better: 'up' },
    cpc: { label: 'CPC médio', fmt: (v) => eur.format(v), axis: (v) => eur.format(v), better: 'down' },
    taxaConv: { label: 'Taxa de conversão', fmt: (v) => pct.format(v), axis: (v) => pct.format(v), better: 'up' },
    cpa: { label: 'Custo / conversão', fmt: (v) => eur.format(v), axis: (v) => eur.format(v), better: 'down' },
    roas: { label: 'ROAS', fmt: (v) => `${dec.format(v)}×`, axis: (v) => `${dec.format(v)}×`, better: 'up' },
  };

  function format(key, value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return DEFS[key].fmt(value);
  }

  return { aggregate, format, DEFS, eur, int, dec };
})();

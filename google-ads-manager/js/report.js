/* Relatório para imprimir / guardar em PDF. */
const Report = (() => {
  const { $, $$, esc, state } = UI;

  function period() {
    const t = UI.today();
    switch (state.rep) {
      case 'prev-month': {
        const s = Core.addMonths(t, -1);
        return { from: s, to: Core.endOfMonth(s) };
      }
      case '30':
        return { from: Core.addDays(t, -29), to: t };
      case 'quarter':
        return { from: Core.addMonths(t, -2), to: t };
      case 'custom': {
        let a = Core.isIsoDate(state.repFrom) ? state.repFrom : Core.startOfMonth(t);
        let b = Core.isIsoDate(state.repTo) ? state.repTo : t;
        if (a > b) [a, b] = [b, a];
        return { from: a, to: b };
      }
      default:
        return { from: Core.startOfMonth(t), to: t };
    }
  }

  const autoGran = (from, to) => {
    const d = Core.dayCount(from, to);
    return d <= 45 ? 'dia' : d <= 120 ? 'semana' : 'mes';
  };

  function render() {
    const campaignId = UI.fillCampaignSelect($('#rep-campaign'), state.repCampaign, { all: true });
    state.repCampaign = campaignId;
    UI.setSegmented($('#rep-range'), 'rep', state.rep);
    $('#rep-custom').hidden = state.rep !== 'custom';
    const p = period();
    if (state.rep === 'custom') {
      $('#rep-from').value = p.from;
      $('#rep-to').value = p.to;
    }
    const host = $('#report');
    const camps = Store.campaigns().filter((c) => campaignId === 'all' || c.id === campaignId);
    const recs = Store.records().filter((r) => camps.some((c) => c.id === r.campaignId));
    const part = Core.sliceRecords(recs, p.from, p.to);
    const acc = Store.account();
    const scope = campaignId === 'all' ? `${camps.length} campanha${camps.length === 1 ? '' : 's'}` : camps[0]?.nome || '';

    if (!camps.length) {
      host.innerHTML = `<div class="card">${UI.empty('Sem campanhas', 'Crie campanhas e registe resultados para gerar o relatório.')}</div>`;
      return;
    }

    const cur = Core.aggregate(part);
    const pp = UI.previousPeriod(p.from, p.to);
    const prev = Core.aggregate(Core.sliceRecords(recs, pp.from, pp.to));
    const gran = autoGran(p.from, p.to);
    const breakdownGran = Core.dayCount(p.from, p.to) <= 92 ? 'semana' : 'mes';
    const isFullMonth = p.from === Core.startOfMonth(p.from) && Core.startOfMonth(p.to) === p.from;
    const notes = Dashboard.notesFor(p, campaignId);

    host.innerHTML = `
      <header class="rep-head">
        <div>
          <div class="rep-kicker">Relatório de desempenho · Google Ads</div>
          <h1>${esc(acc.nome)}</h1>
          <div class="rep-meta">${esc(Fmt.period(p.from, p.to))} · ${esc(scope)}</div>
        </div>
        <div class="rep-meta right">Gerado em ${Fmt.dateLong(UI.today())}<br/>Comparação: ${esc(Fmt.period(pp.from, pp.to))}</div>
      </header>
      ${part.length ? '' : `<div class="card">${UI.empty('Sem resultados neste período', 'Escolha outro período ou registe resultados.')}</div>`}
      <section class="rep-section"><div class="kpis" id="rep-kpis"></div></section>
      <section class="rep-section rep-charts">
        <div class="card"><h2>Custo</h2><div class="chart small" id="rep-chart-cost"></div></div>
        <div class="card"><h2>Conversões</h2><div class="chart small" id="rep-chart-conv"></div></div>
      </section>
      <section class="rep-section card"><h2>Desempenho por campanha</h2><div class="table-wrap" id="rep-camps"></div></section>
      <section class="rep-section card"><h2>Evolução por ${breakdownGran === 'semana' ? 'semana' : 'mês'}</h2><div class="table-wrap" id="rep-time"></div></section>
      ${isFullMonth ? `<section class="rep-section card"><h2>Orçamento e objetivos do mês</h2>${Dashboard.pacingHtml(camps, p.from, { compact: true })}</section>` : ''}
      ${notes.length ? `<section class="rep-section card"><h2>Alterações e notas</h2><ul class="notes-list">${notes.map((n) => `<li><span class="note-date">${Fmt.date(n.data)}</span><span class="tag">${esc(n.alvo)}</span><span class="note-text">${esc(n.texto)}</span></li>`).join('')}</ul></section>` : ''}
    `;

    UI.kpis($('#rep-kpis'), cur, prev);

    const ser = Core.series(recs, p.from, p.to, gran);
    const buckets = ser.map(({ totals, ...b }) => b);
    for (const [id, key] of [['#rep-chart-cost', 'custo'], ['#rep-chart-conv', 'conversoes']]) {
      LineChart.render($(id), {
        buckets,
        series: [{ name: Fmt.DEFS[key].label, color: UI.seriesColor(0), values: ser.map((b) => (b.totals ? b.totals[key] : null)) }],
        def: Fmt.DEFS[key],
        gran,
        notes,
        tooltip: $('#tooltip'),
        emptyText: 'Sem resultados neste período.',
      });
    }

    const campRows = camps.map((c) => ({ ...Core.aggregate(part.filter((r) => r.campaignId === c.id)), nome: c.nome }));
    UI.table($('#rep-camps'), {
      cols: [{ key: 'nome', label: 'Campanha', text: true }, ...UI.METRIC_COLS.map(([key, label]) => ({ key, label }))],
      rows: campRows,
      sort: { key: 'custo', dir: -1 },
      sortable: false,
      total: campRows.length > 1 ? { ...cur, label: 'Total' } : null,
    });

    const timeRows = Core.series(recs, p.from, p.to, breakdownGran).map((b) => ({
      ...(b.totals || Core.aggregate([])),
      nome: breakdownGran === 'mes' ? Fmt.month(b.start) : Fmt.period(b.from, b.to),
      ord: b.from,
    }));
    UI.table($('#rep-time'), {
      cols: [{ key: 'nome', label: breakdownGran === 'mes' ? 'Mês' : 'Semana', text: true }, ...UI.METRIC_COLS.map(([key, label]) => ({ key, label }))],
      rows: timeRows,
      sort: { key: 'ord', dir: 1 },
      sortable: false,
      total: { ...cur, label: 'Total' },
    });
  }

  function bind() {
    $$('#rep-range button').forEach((b) =>
      b.addEventListener('click', () => {
        state.rep = b.dataset.rep;
        UI.save();
        render();
      }),
    );
    $('#rep-campaign').addEventListener('change', (e) => {
      state.repCampaign = e.target.value;
      render();
    });
    $('#rep-from').addEventListener('change', (e) => {
      state.repFrom = e.target.value;
      render();
    });
    $('#rep-to').addEventListener('change', (e) => {
      state.repTo = e.target.value;
      render();
    });
    $('#btn-print').addEventListener('click', () => {
      const acc = Store.account();
      const p = period();
      const old = document.title;
      document.title = `Relatório Google Ads - ${acc.nome} - ${p.from} a ${p.to}`;
      window.print();
      document.title = old;
    });
    // Ao imprimir, redesenhar os gráficos à largura da página
    window.addEventListener('beforeprint', () => state.view === 'report' && render());
    window.addEventListener('afterprint', () => state.view === 'report' && render());
  }

  UI.views.report = render;
  return { render, bind, period };
})();

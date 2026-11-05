/* Painel: indicadores, ritmo do mês, gráfico com comparação e anotações, tabela de desempenho. */
const Dashboard = (() => {
  const { $, $$, esc, state } = UI;

  // ---------- Período ----------
  function period(records) {
    const t = UI.today();
    if (state.range === 'all') {
      if (!records.length) return { from: t, to: t };
      let a = records[0].inicio;
      let b = records[0].fim;
      for (const r of records) {
        if (r.inicio < a) a = r.inicio;
        if (r.fim > b) b = r.fim;
      }
      return { from: a, to: b };
    }
    if (state.range === 'month') return { from: Core.startOfMonth(t), to: t };
    if (state.range === 'custom') {
      let a = Core.isIsoDate(state.from) ? state.from : Core.addDays(t, -29);
      let b = Core.isIsoDate(state.to) ? state.to : t;
      if (a > b) [a, b] = [b, a];
      return { from: a, to: b };
    }
    const n = Number(state.range) || 30;
    return { from: Core.addDays(t, -(n - 1)), to: t };
  }

  const filtered = (campaignId) => Store.records().filter((r) => campaignId === 'all' || r.campaignId === campaignId);

  // ---------- Ritmo do mês (partilhado com Campanhas e Relatório) ----------
  function bar(pctNow, pctProj, label) {
    if (pctNow === null) return '<span class="muted">—</span>';
    const scale = Math.max(1, pctNow, pctProj ?? 0);
    const w = (v) => `${((v / scale) * 100).toFixed(1)}%`;
    return `<div class="pbar" role="img" aria-label="${esc(label)}">
      <div class="pbar-fill" style="width:${w(pctNow)}"></div>
      ${pctProj !== null ? `<div class="pbar-proj" style="left:${w(Math.min(pctProj, scale))}" title="Previsão: ${Fmt.pct0.format(pctProj)}"></div>` : ''}
      <div class="pbar-limit" style="left:${w(1)}"></div>
    </div>`;
  }

  function statusBadge(p) {
    const s = Core.pacingStatus(p);
    if (!s) return '';
    if (p.completo) {
      return p.pctProj > 1.0001
        ? '<span class="status bad">▲ Ultrapassou o orçamento</span>'
        : '<span class="status good">✓ Dentro do orçamento</span>';
    }
    if (s === 'acima') return '<span class="status bad">▲ Acima do orçamento</span>';
    if (s === 'abaixo') return '<span class="status warn">▼ Abaixo do orçamento</span>';
    return '<span class="status good">✓ No ritmo</span>';
  }
  function convBadge(p) {
    if (p.pctConvProj === null) return '';
    if (p.pctConvProj >= 1) return `<span class="status good">✓ ${p.completo ? 'Objetivo atingido' : 'Objetivo ao alcance'}</span>`;
    if (p.pctConvProj >= 0.9) return '<span class="status warn">● Perto do objetivo</span>';
    return `<span class="status bad">▼ ${p.completo ? 'Objetivo falhado' : 'Abaixo do objetivo'}</span>`;
  }

  /** Tabela de ritmo para um conjunto de campanhas num mês. */
  function pacingHtml(camps, month, { compact = false } = {}) {
    const t = UI.today();
    const recs = Store.records();
    const ms = Core.startOfMonth(month);
    const me = Core.endOfMonth(month);
    // Campanhas terminadas só entram se tiverem resultados nesse mês
    camps = camps.filter((c) => c.estado !== 'terminada' || recs.some((r) => r.campaignId === c.id && Core.overlaps(r, ms, me)));
    const rows = camps.map((c) => {
      const p = Core.pacing(
        recs.filter((r) => r.campaignId === c.id),
        month,
        t,
        Core.monthlyBudget(c, month),
        c.objetivoConversoes,
      );
      return { c, p };
    });
    const withTargets = rows.filter(({ p }) => p.orcamento || p.objetivoConv);
    if (!rows.length) return UI.empty('Sem campanhas', 'Crie campanhas para acompanhar o ritmo do mês.');
    const anyFuture = rows[0].p.futuro;
    if (anyFuture) return UI.empty('Mês futuro', 'Ainda não há dados para este mês.');
    const info = rows[0].p;
    const covered = Math.max(...rows.map(({ p }) => p.diasComDados));
    const head = `<p class="pacing-info">${Fmt.month(info.inicio)} · ${info.completo ? 'mês completo' : `${covered} de ${info.dias} dias com dados`}
      <span class="pacing-legend"><i class="lg-fill"></i>realizado <i class="lg-proj"></i>previsão no fim do mês <i class="lg-limit"></i>orçamento / objetivo</span></p>`;

    // Total: só soma orçamentos/objetivos das campanhas que os têm definidos
    let total = null;
    if (rows.length > 1) {
      const sumBudget = rows.reduce((a, { p }) => a + (p.orcamento || 0), 0);
      const sumGoal = rows.reduce((a, { p }) => a + (p.objetivoConv || 0), 0);
      const allRecs = recs.filter((r) => camps.some((c) => c.id === r.campaignId));
      total = Core.pacing(allRecs, month, t, sumBudget || null, sumGoal || null);
    }

    const line = (name, p, isTotal) => `<tr class="${isTotal ? 'total' : ''}">
      <td class="text">${name}</td>
      <td class="pcell">
        <div class="pnums"><strong>${Fmt.eur.format(p.custo)}</strong>${p.orcamento ? `<span> de ${Fmt.eur.format(p.orcamento)}</span>` : '<span class="muted"> sem orçamento</span>'}</div>
        ${p.orcamento ? bar(p.pctGasto, p.pctProj, 'Gasto face ao orçamento') : ''}
      </td>
      <td>${p.projCusto !== null && !p.completo ? Fmt.eur.format(p.projCusto) : p.completo ? '<span class="muted">—</span>' : '—'}
        ${p.ritmoDiarioRestante !== null && !compact ? `<div class="sub">${Fmt.eur.format(p.ritmoDiarioRestante)}/dia disponível</div>` : ''}</td>
      <td class="text">${statusBadge(p)}</td>
      <td class="pcell">
        <div class="pnums"><strong>${Fmt.dec.format(p.conversoes)}</strong>${p.objetivoConv ? `<span> de ${Fmt.dec.format(p.objetivoConv)}</span>` : '<span class="muted"> sem objetivo</span>'}</div>
        ${p.objetivoConv ? bar(p.pctConv, p.pctConvProj, 'Conversões face ao objetivo') : ''}
      </td>
      <td>${p.projConv !== null && !p.completo ? Fmt.dec.format(p.projConv) : '<span class="muted">—</span>'}</td>
      <td class="text">${convBadge(p)}</td>
    </tr>`;

    const hint = withTargets.length
      ? ''
      : '<p class="hint">Dica: defina o orçamento e o objetivo de conversões em cada campanha para ver a previsão face ao alvo.</p>';
    return `${head}<div class="table-wrap"><table class="pacing-table">
      <thead><tr><th class="text">Campanha</th><th class="text">Gasto</th><th>Previsão</th><th class="text">Estado</th><th class="text">Conversões</th><th>Previsão</th><th class="text">Objetivo</th></tr></thead>
      <tbody>${rows.map(({ c, p }) => line(esc(c.nome), p, false)).join('')}</tbody>
      ${total ? `<tfoot>${line('Total', total, true)}</tfoot>` : ''}
    </table></div>${hint}`;
  }

  // ---------- Séries do gráfico ----------
  /** Agrupa registos pela dimensão de comparação; devolve entidades estáveis (ordenadas por nome). */
  function splitEntities(recs, campaignId) {
    const map = new Map();
    for (const r of recs) {
      let key;
      let name;
      if (campaignId === 'all') {
        key = r.campaignId;
        name = Store.campaign(r.campaignId)?.nome || '—';
      } else {
        key = r.grupo ? r.grupo.trim().toLowerCase() : '';
        name = r.grupo ? r.grupo.trim() : 'Sem detalhe de grupo';
      }
      if (!map.has(key)) map.set(key, { key, name, recs: [] });
      map.get(key).recs.push(r);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }

  function chartSeries(recs, p, campaignId) {
    const vals = (rs) => Core.series(rs, p.from, p.to, state.gran).map((b) => (b.totals ? b.totals[state.metric] : null));
    const buckets = Core.buckets(p.from, p.to, state.gran);
    if (state.compare !== 'split') return { buckets, series: [{ name: Fmt.DEFS[state.metric].label, color: UI.seriesColor(0), values: vals(recs) }] };

    let ents = splitEntities(
      recs.filter((r) => Core.overlaps(r, p.from, p.to)),
      campaignId,
    );
    let series;
    if (ents.length <= UI.MAX_SERIES) {
      series = ents.map((e, i) => ({ name: e.name, color: UI.seriesColor(i), values: vals(e.recs) }));
    } else {
      // Demasiadas séries: as 6 com mais custo no período + "Outras"
      const cost = (e) => Core.aggregate(Core.sliceRecords(e.recs, p.from, p.to)).custo;
      ents = ents.map((e) => ({ ...e, c: cost(e) })).sort((a, b) => b.c - a.c);
      const top = ents.slice(0, UI.MAX_SERIES - 1).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
      const rest = ents.slice(UI.MAX_SERIES - 1);
      series = top.map((e, i) => ({ name: e.name, color: UI.seriesColor(i), values: vals(e.recs) }));
      series.push({ name: `Outras (${rest.length})`, color: UI.OTHER_COLOR, values: vals(rest.flatMap((e) => e.recs)) });
    }
    return { buckets, series };
  }

  function notesFor(p, campaignId) {
    return Store.notes()
      .filter((n) => n.data >= p.from && n.data <= p.to)
      .filter((n) => campaignId === 'all' || !n.campaignId || n.campaignId === campaignId)
      .map((n) => ({ ...n, alvo: n.campaignId ? Store.campaign(n.campaignId)?.nome || '' : 'Todas as campanhas' }));
  }

  // ---------- Tabela de desempenho ----------
  function summaryRows(recs, p, campaignId) {
    const part = Core.sliceRecords(recs, p.from, p.to);
    const groups = new Map();
    const add = (key, base, r) => {
      if (!groups.has(key)) groups.set(key, { ...base, recs: [] });
      if (r) groups.get(key).recs.push(r);
    };
    const showCamp = campaignId === 'all';
    if (state.dim === 'campanha') {
      for (const c of Store.campaigns()) if (showCamp || c.id === campaignId) add(c.id, { nome: c.nome, estado: c.estado });
      for (const r of part) add(r.campaignId, { nome: Store.campaign(r.campaignId)?.nome }, r);
    } else {
      for (const r of part) {
        const cn = Store.campaign(r.campaignId)?.nome || '—';
        const g = r.grupo ? r.grupo.trim() : '';
        const k = r.palavra ? r.palavra.trim() : '';
        let key;
        let label;
        if (state.dim === 'grupo') {
          key = `${r.campaignId}|${g.toLowerCase()}`;
          label = g || '(total da campanha, sem detalhe)';
        } else {
          key = `${r.campaignId}|${g.toLowerCase()}|${k.toLowerCase()}`;
          label = k ? `${g} › ${k}` : g ? `${g} › (sem palavra-chave)` : '(total da campanha, sem detalhe)';
        }
        add(key, { nome: showCamp ? `${cn} › ${label}` : label }, r);
      }
    }
    return [...groups.values()].map((g) => ({ ...Core.aggregate(g.recs), nome: g.nome, estado: g.estado }));
  }

  // ---------- Render ----------
  function render() {
    const campaignId = UI.fillCampaignSelect($('#f-campaign'), state.campaign, { all: true });
    state.campaign = campaignId;
    UI.setSegmented($('#f-range'), 'range', state.range);
    UI.setSegmented($('#chart-gran'), 'gran', state.gran);
    UI.setSegmented($('#chart-compare'), 'compare', state.compare);
    UI.setSegmented($('#summary-dim'), 'dim', state.dim);
    $('#compare-split').textContent = campaignId === 'all' ? 'Por campanha' : 'Por grupo';
    $('#f-custom').hidden = state.range !== 'custom';
    $('#chart-metric').value = state.metric;

    const recs = filtered(campaignId);
    const p = period(recs);
    if (state.range === 'custom') {
      $('#f-from').value = p.from;
      $('#f-to').value = p.to;
    }
    $('#period-label').textContent = Fmt.period(p.from, p.to);

    // KPIs
    const cur = Core.aggregate(Core.sliceRecords(recs, p.from, p.to));
    const pp = UI.previousPeriod(p.from, p.to);
    const prevRecs = Core.sliceRecords(recs, pp.from, pp.to);
    UI.kpis($('#kpis'), cur, state.range === 'all' ? null : Core.aggregate(prevRecs));

    // Ritmo
    const month = state.pacingMonth || UI.today().slice(0, 7);
    $('#pacing-month').value = month;
    const camps = Store.campaigns().filter((c) => campaignId === 'all' || c.id === campaignId);
    $('#pacing').innerHTML = pacingHtml(camps, `${month}-01`);

    // Gráfico
    $('#chart-title').textContent = `Evolução — ${Fmt.DEFS[state.metric].label}`;
    const { buckets, series } = chartSeries(recs, p, campaignId);
    const notes = notesFor(p, campaignId);
    LineChart.render($('#chart'), { buckets, series, def: Fmt.DEFS[state.metric], gran: state.gran, notes, tooltip: $('#tooltip') });

    // Anotações
    $('#notes-list').innerHTML = notes.length
      ? notes
          .map(
            (n) => `<li><span class="note-date">${Fmt.date(n.data)}</span><span class="tag">${esc(n.alvo)}</span>
            <span class="note-text">${esc(n.texto)}</span><button class="icon-btn" data-edit-note="${esc(n.id)}">Editar</button></li>`,
          )
          .join('')
      : '<li class="muted small">Sem anotações neste período. Registe alterações importantes (lances, anúncios, orçamento) para perceber o impacto no gráfico.</li>';

    // Desempenho
    const host = $('#summary');
    if (!Store.campaigns().length) {
      host.innerHTML = UI.empty('Ainda não tem campanhas', 'Comece por criar uma campanha.', '<button class="btn primary" data-goto="campaigns">Criar campanha</button>');
      return;
    }
    const rows = summaryRows(recs, p, campaignId);
    if (!rows.length) {
      host.innerHTML = UI.empty('Sem detalhe neste período', 'Registe resultados por grupo de anúncios ou palavra-chave para ver este detalhe.');
      return;
    }
    const total = { ...cur, label: 'Total' };
    UI.table(host, {
      cols: [
        {
          key: 'nome',
          label: state.dim === 'campanha' ? 'Campanha' : state.dim === 'grupo' ? 'Grupo de anúncios' : 'Palavra-chave',
          text: true,
          html: (r) => `${r.estado ? `<span class="dot-status ${esc(r.estado)}" title="${esc(UI.estadoLabel(r.estado))}"></span>` : ''}${esc(r.nome)}`,
        },
        ...UI.METRIC_COLS.map(([key, label]) => ({ key, label })),
      ],
      rows,
      sort: state.summarySort,
      onSort: (s) => {
        state.summarySort = s;
        render();
      },
      total: rows.length > 1 ? total : null,
    });
  }

  // ---------- Eventos ----------
  function bind() {
    $('#f-campaign').addEventListener('change', (e) => {
      state.campaign = e.target.value;
      render();
    });
    $$('#f-range button').forEach((b) =>
      b.addEventListener('click', () => {
        state.range = b.dataset.range;
        if (state.range === 'all' && state.gran === 'dia') state.gran = 'semana';
        UI.save();
        render();
      }),
    );
    $('#f-from').addEventListener('change', (e) => {
      state.from = e.target.value;
      render();
    });
    $('#f-to').addEventListener('change', (e) => {
      state.to = e.target.value;
      render();
    });
    $('#chart-metric').addEventListener('change', (e) => {
      state.metric = e.target.value;
      UI.save();
      render();
    });
    $$('#chart-gran button').forEach((b) =>
      b.addEventListener('click', () => {
        state.gran = b.dataset.gran;
        UI.save();
        render();
      }),
    );
    $$('#chart-compare button').forEach((b) =>
      b.addEventListener('click', () => {
        state.compare = b.dataset.compare;
        UI.save();
        render();
      }),
    );
    $$('#summary-dim button').forEach((b) =>
      b.addEventListener('click', () => {
        state.dim = b.dataset.dim;
        state.summarySort = { key: 'custo', dir: -1 };
        UI.save();
        render();
      }),
    );
    $('#pacing-month').addEventListener('change', (e) => {
      state.pacingMonth = e.target.value;
      render();
    });
    $('#btn-new-note').addEventListener('click', () => Notes.open(null));
  }

  UI.views.dashboard = render;
  return { render, bind, pacingHtml, period, notesFor };
})();

/* Anotações (alterações feitas nas campanhas), mostradas no gráfico. */
const Notes = (() => {
  const { $ } = UI;
  const dlg = () => $('#dlg-note');
  const form = () => $('#form-note');

  function open(id) {
    const f = form();
    f.reset();
    UI.formError(f, '');
    const n = id ? Store.note(id) : null;
    $('#dlg-note-title').textContent = n ? 'Editar anotação' : 'Nova anotação';
    $('#btn-del-note').hidden = !n;
    UI.fillCampaignSelect(f.campaignId, n ? n.campaignId || '' : UI.state.campaign !== 'all' ? UI.state.campaign : '', {
      none: 'Todas as campanhas',
    });
    f.id.value = n ? n.id : '';
    f.data.value = n ? n.data : UI.today();
    f.texto.value = n ? n.texto : '';
    dlg().showModal();
    f.texto.focus();
  }

  function bind() {
    form().addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form();
      const texto = f.texto.value.trim();
      if (!Core.isIsoDate(f.data.value)) return UI.formError(f, 'Indique a data.');
      if (!texto) return UI.formError(f, 'Escreva a anotação.');
      Store.saveNote({ id: f.id.value || undefined, data: f.data.value, campaignId: f.campaignId.value || null, texto });
      dlg().close();
      UI.toast(f.id.value ? 'Anotação atualizada' : 'Anotação guardada');
    });
    $('#btn-del-note').addEventListener('click', () => {
      const id = form().id.value;
      dlg().close();
      Store.deleteNote(id);
      UI.toast('Anotação apagada', { undo: true });
    });
  }

  return { open, bind };
})();

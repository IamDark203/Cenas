/* Lógica da interface. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const F = Metrics.format;

  // ---------- Datas ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseIso = (s) => new Date(`${s}T00:00:00`);
  const addDays = (s, n) => {
    const d = parseIso(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const today = () => iso(new Date());
  const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
  const fmtDate = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ---------- Estado da UI ----------
  const ui = {
    view: 'dashboard',
    campaign: 'all',
    range: '30',
    from: null,
    to: null,
    metric: 'custo',
    summarySort: { key: 'custo', dir: -1 },
    rCampaign: 'all',
    rFrom: '',
    rTo: '',
    recordSort: { key: 'data', dir: -1 },
  };

  try {
    const saved = JSON.parse(localStorage.getItem('gads-manager:ui') || '{}');
    for (const k of ['view', 'range', 'metric']) if (saved[k]) ui[k] = saved[k];
    const theme = localStorage.getItem('gads-manager:theme');
    if (theme) document.documentElement.dataset.theme = theme;
  } catch {}
  const saveUi = () => {
    try {
      localStorage.setItem('gads-manager:ui', JSON.stringify({ view: ui.view, range: ui.range, metric: ui.metric }));
    } catch {}
  };

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Navegação ----------
  function setView(view) {
    ui.view = view;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    saveUi();
    render();
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // ---------- Período ----------
  function currentPeriod() {
    const recs = Store.records();
    if (ui.range === 'all') {
      if (!recs.length) return { from: today(), to: today(), prev: null };
      const dates = recs.map((r) => r.data).sort();
      return { from: dates[0], to: dates[dates.length - 1], prev: null };
    }
    if (ui.range === 'custom') {
      const from = ui.from || addDays(today(), -29);
      const to = ui.to || today();
      const [a, b] = from <= to ? [from, to] : [to, from];
      const len = daysBetween(a, b) + 1;
      return { from: a, to: b, prev: { from: addDays(a, -len), to: addDays(a, -1) } };
    }
    const n = Number(ui.range);
    const to = today();
    const from = addDays(to, -(n - 1));
    return { from, to, prev: { from: addDays(from, -n), to: addDays(from, -1) } };
  }

  const inRange = (r, from, to) => r.data >= from && r.data <= to;
  const byCampaign = (r, id) => id === 'all' || r.campaignId === id;

  // ---------- Selects de campanhas ----------
  function fillCampaignSelect(sel, value, withAll) {
    const opts = Store.campaigns().map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`);
    sel.innerHTML = (withAll ? '<option value="all">Todas as campanhas</option>' : '') + opts.join('');
    if ([...sel.options].some((o) => o.value === value)) sel.value = value;
    else if (withAll) sel.value = 'all';
  }

  // ---------- Painel ----------
  const KPI_KEYS = ['custo', 'impressoes', 'cliques', 'ctr', 'cpc', 'conversoes', 'cpa', 'roas'];

  function renderDashboard() {
    fillCampaignSelect($('#f-campaign'), ui.campaign, true);
    ui.campaign = $('#f-campaign').value;
    $$('#f-range button').forEach((b) => b.classList.toggle('active', b.dataset.range === ui.range));
    $('#f-custom').hidden = ui.range !== 'custom';
    $('#chart-metric').value = ui.metric;

    const period = currentPeriod();
    if (ui.range === 'custom') {
      $('#f-from').value = period.from;
      $('#f-to').value = period.to;
    }
    const recs = Store.records().filter((r) => byCampaign(r, ui.campaign));
    const cur = recs.filter((r) => inRange(r, period.from, period.to));
    const totals = Metrics.aggregate(cur);
    const prevTotals = period.prev ? Metrics.aggregate(recs.filter((r) => inRange(r, period.prev.from, period.prev.to))) : null;

    // KPIs
    $('#kpis').innerHTML = KPI_KEYS.map((k) => {
      const def = Metrics.DEFS[k];
      let delta = '<div class="kpi-delta">&nbsp;</div>';
      if (prevTotals && prevTotals.dias > 0 && totals[k] !== null && prevTotals[k]) {
        const change = (totals[k] - prevTotals[k]) / prevTotals[k];
        const good = def.better === 'up' ? change > 0 : def.better === 'down' ? change < 0 : null;
        const cls = Math.abs(change) < 0.005 || good === null ? '' : good ? 'up' : 'down';
        const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '';
        const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(change));
        delta = `<div class="kpi-delta ${cls}">${arrow} ${pct} vs. anterior</div>`;
      } else if (prevTotals) {
        delta = '<div class="kpi-delta">sem comparação</div>';
      }
      return `<div class="kpi"><div class="kpi-label">${def.label}</div><div class="kpi-value">${F(k, totals[k])}</div>${delta}</div>`;
    }).join('');

    // Gráfico
    const def = Metrics.DEFS[ui.metric];
    $('#chart-title').textContent = `Evolução — ${def.label}`;
    const byDay = new Map();
    for (const r of cur) {
      if (!byDay.has(r.data)) byDay.set(r.data, []);
      byDay.get(r.data).push(r);
    }
    const points = [];
    if (cur.length || ui.range !== 'all') {
      for (let d = period.from; d <= period.to; d = addDays(d, 1)) {
        const list = byDay.get(d);
        points.push({ date: d, value: list ? Metrics.aggregate(list)[ui.metric] : null });
      }
    }
    LineChart.render($('#chart'), points, def, $('#tooltip'));

    renderSummary(period);
  }

  const SUMMARY_COLS = [
    ['nome', 'Campanha'],
    ['impressoes', 'Impressões'],
    ['cliques', 'Cliques'],
    ['ctr', 'CTR'],
    ['custo', 'Custo'],
    ['cpc', 'CPC'],
    ['conversoes', 'Conv.'],
    ['taxaConv', 'Taxa conv.'],
    ['cpa', 'Custo/conv.'],
    ['valor', 'Valor conv.'],
    ['roas', 'ROAS'],
  ];

  function sortRows(rows, { key, dir }) {
    return rows.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return va.localeCompare(vb, 'pt') * dir;
      return (va - vb) * dir;
    });
  }

  function headerHtml(cols, sort) {
    return cols
      .map(([k, label]) => {
        const arrow = sort.key === k ? `<span class="arrow">${sort.dir > 0 ? '↑' : '↓'}</span>` : '';
        return `<th data-sort="${k}">${label}${arrow}</th>`;
      })
      .join('');
  }

  function renderSummary(period) {
    const host = $('#campaign-summary');
    const camps = Store.campaigns().filter((c) => ui.campaign === 'all' || c.id === ui.campaign);
    if (!camps.length) {
      host.innerHTML = `<div class="empty"><strong>Ainda não tem campanhas</strong>Comece por criar uma campanha.<br/><br/>
        <button class="btn primary" data-goto="campaigns">Criar campanha</button></div>`;
      return;
    }
    const recs = Store.records().filter((r) => inRange(r, period.from, period.to));
    const rows = camps.map((c) => ({
      id: c.id,
      nome: c.nome,
      estado: c.estado,
      ...Metrics.aggregate(recs.filter((r) => r.campaignId === c.id)),
    }));
    sortRows(rows, ui.summarySort);
    const total = Metrics.aggregate(recs.filter((r) => camps.some((c) => c.id === r.campaignId)));
    const cells = (r) =>
      SUMMARY_COLS.slice(1)
        .map(([k]) => `<td>${F(k, r[k])}</td>`)
        .join('');
    host.innerHTML = `<table>
      <thead><tr>${headerHtml(SUMMARY_COLS, ui.summarySort)}</tr></thead>
      <tbody>${rows
        .map((r) => `<tr><td><span class="badge ${esc(r.estado)}" title="${esc(estadoLabel(r.estado))}"></span> ${esc(r.nome)}</td>${cells(r)}</tr>`)
        .join('')}</tbody>
      ${rows.length > 1 ? `<tfoot><tr><td>Total</td>${cells(total)}</tr></tfoot>` : ''}
    </table>`;
    $$('th[data-sort]', host).forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        ui.summarySort = { key: k, dir: ui.summarySort.key === k ? -ui.summarySort.dir : k === 'nome' ? 1 : -1 };
        renderSummary(currentPeriod());
      }),
    );
  }

  const estadoLabel = (e) => ({ ativa: 'Ativa', pausada: 'Pausada', terminada: 'Terminada' })[e] || e;

  $('#f-campaign').addEventListener('change', (e) => {
    ui.campaign = e.target.value;
    renderDashboard();
  });
  $$('#f-range button').forEach((b) =>
    b.addEventListener('click', () => {
      ui.range = b.dataset.range;
      saveUi();
      renderDashboard();
    }),
  );
  $('#f-from').addEventListener('change', (e) => {
    ui.from = e.target.value;
    renderDashboard();
  });
  $('#f-to').addEventListener('change', (e) => {
    ui.to = e.target.value;
    renderDashboard();
  });
  $('#chart-metric').addEventListener('change', (e) => {
    ui.metric = e.target.value;
    saveUi();
    renderDashboard();
  });

  // ---------- Campanhas ----------
  function renderCampaigns() {
    const host = $('#campaign-list');
    const camps = Store.campaigns();
    if (!camps.length) {
      host.innerHTML = `<div class="card empty" style="grid-column:1/-1"><strong>Sem campanhas</strong>
        Crie a primeira campanha para começar a registar resultados.</div>`;
      return;
    }
    const last30From = addDays(today(), -29);
    host.innerHTML = camps
      .map((c) => {
        const all = Store.records().filter((r) => r.campaignId === c.id);
        const t = Metrics.aggregate(all);
        const m30 = Metrics.aggregate(all.filter((r) => inRange(r, last30From, today())));
        const orc = Number(c.orcamento) || 0;
        let budget = '';
        if (orc > 0) {
          const media = m30.dias ? m30.custo / m30.dias : 0;
          const ratio = Math.min(1, media / orc);
          budget = `<div class="cc-budget${media > orc ? ' over' : ''}" title="Gasto médio diário (últimos 30 dias) face ao orçamento"><div style="width:${(ratio * 100).toFixed(1)}%"></div></div>
            <div class="cc-budget-label"><span>Média diária ${Metrics.eur.format(media)}</span><span>Orçamento ${Metrics.eur.format(orc)}</span></div>`;
        }
        const cpaAlvo = Number(c.cpaAlvo) || 0;
        const cpaNote =
          cpaAlvo > 0 && t.cpa !== null
            ? `<span style="color:var(${t.cpa <= cpaAlvo ? '--good' : '--bad'})">${t.cpa <= cpaAlvo ? '✓' : '!'} CPA alvo ${Metrics.eur.format(cpaAlvo)}</span>`
            : '';
        return `<article class="campaign-card">
          <div class="cc-head">
            <div>
              <div class="cc-name">${esc(c.nome)}</div>
              <div class="cc-meta">${esc(c.tipo)} · ${esc(c.objetivo || '')}${c.inicio ? ` · desde ${fmtDate.format(parseIso(c.inicio))}` : ''}</div>
            </div>
            <span class="badge ${esc(c.estado)}">${esc(estadoLabel(c.estado))}</span>
          </div>
          <div class="cc-stats">
            <div class="cc-stat"><span>Custo total</span><strong>${F('custo', t.custo)}</strong></div>
            <div class="cc-stat"><span>Conversões</span><strong>${F('conversoes', t.conversoes)}</strong></div>
            <div class="cc-stat"><span>ROAS</span><strong>${F('roas', t.roas)}</strong></div>
            <div class="cc-stat"><span>Cliques</span><strong>${F('cliques', t.cliques)}</strong></div>
            <div class="cc-stat"><span>CTR</span><strong>${F('ctr', t.ctr)}</strong></div>
            <div class="cc-stat"><span>Custo/conv.</span><strong>${F('cpa', t.cpa)}</strong></div>
          </div>
          ${budget}
          ${c.notas ? `<div class="cc-meta">${esc(c.notas)}</div>` : ''}
          <div class="cc-foot">
            <span class="cc-meta">${t.dias} registo${t.dias === 1 ? '' : 's'} ${cpaNote}</span>
            <div class="cc-actions">
              <button class="icon-btn" data-add-record="${esc(c.id)}">+ Resultado</button>
              <button class="icon-btn" data-edit-campaign="${esc(c.id)}">Editar</button>
              <button class="icon-btn danger" data-del-campaign="${esc(c.id)}">Apagar</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  const dlgCampaign = $('#dlg-campaign');
  const formCampaign = $('#form-campaign');

  function openCampaign(id) {
    formCampaign.reset();
    const c = id ? Store.campaign(id) : null;
    $('#dlg-campaign-title').textContent = c ? 'Editar campanha' : 'Nova campanha';
    formCampaign.id.value = c ? c.id : '';
    if (c) for (const k of ['nome', 'tipo', 'estado', 'orcamento', 'inicio', 'objetivo', 'cpaAlvo', 'notas']) formCampaign[k].value = c[k] ?? '';
    else formCampaign.inicio.value = today();
    dlgCampaign.showModal();
    formCampaign.nome.focus();
  }

  formCampaign.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formCampaign;
    const nome = f.nome.value.trim();
    if (!nome) return;
    Store.upsertCampaign({
      id: f.id.value || undefined,
      nome,
      tipo: f.tipo.value,
      estado: f.estado.value,
      orcamento: f.orcamento.value === '' ? null : Number(f.orcamento.value),
      inicio: f.inicio.value,
      objetivo: f.objetivo.value,
      cpaAlvo: f.cpaAlvo.value === '' ? null : Number(f.cpaAlvo.value),
      notas: f.notas.value.trim(),
    });
    dlgCampaign.close();
    toast(f.id.value ? 'Campanha atualizada' : 'Campanha criada');
    render();
  });

  $('#btn-new-campaign').addEventListener('click', () => openCampaign());

  // ---------- Resultados ----------
  const RECORD_COLS = [
    ['data', 'Data'],
    ['campanha', 'Campanha'],
    ['impressoes', 'Impressões'],
    ['cliques', 'Cliques'],
    ['ctr', 'CTR'],
    ['custo', 'Custo'],
    ['cpc', 'CPC'],
    ['conversoes', 'Conv.'],
    ['cpa', 'Custo/conv.'],
    ['valor', 'Valor conv.'],
    ['roas', 'ROAS'],
  ];

  function renderResults() {
    fillCampaignSelect($('#r-campaign'), ui.rCampaign, true);
    ui.rCampaign = $('#r-campaign').value;
    const host = $('#records-table');
    if (!Store.campaigns().length) {
      host.innerHTML = `<div class="empty"><strong>Crie primeiro uma campanha</strong>Os resultados são associados a campanhas.<br/><br/>
        <button class="btn primary" data-goto="campaigns">Ir para Campanhas</button></div>`;
      return;
    }
    let recs = Store.records().filter((r) => byCampaign(r, ui.rCampaign));
    if (ui.rFrom) recs = recs.filter((r) => r.data >= ui.rFrom);
    if (ui.rTo) recs = recs.filter((r) => r.data <= ui.rTo);
    if (!recs.length) {
      host.innerHTML = '<div class="empty"><strong>Sem registos</strong>Clique em “+ Novo registo” para adicionar resultados.</div>';
      return;
    }
    const rows = recs.map((r) => ({
      ...Metrics.aggregate([r]),
      id: r.id,
      data: r.data,
      campanha: Store.campaign(r.campaignId)?.nome || '—',
    }));
    sortRows(rows, ui.recordSort);
    const total = Metrics.aggregate(recs);
    const metricCells = (r) =>
      RECORD_COLS.slice(2)
        .map(([k]) => `<td>${F(k, r[k])}</td>`)
        .join('');
    host.innerHTML = `<table>
      <thead><tr>${headerHtml(RECORD_COLS, ui.recordSort)}<th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><td>${fmtDate.format(parseIso(r.data))}</td><td style="text-align:left">${esc(r.campanha)}</td>${metricCells(r)}
          <td class="actions"><button class="icon-btn" data-edit-record="${esc(r.id)}">Editar</button><button class="icon-btn danger" data-del-record="${esc(r.id)}" aria-label="Apagar">✕</button></td></tr>`,
        )
        .join('')}</tbody>
      <tfoot><tr><td>Total</td><td style="text-align:left">${rows.length} registo${rows.length === 1 ? '' : 's'}</td>${metricCells(total)}<td></td></tr></tfoot>
    </table>`;
    $$('th[data-sort]', host).forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        ui.recordSort = { key: k, dir: ui.recordSort.key === k ? -ui.recordSort.dir : k === 'campanha' ? 1 : -1 };
        renderResults();
      }),
    );
  }

  $('#r-campaign').addEventListener('change', (e) => {
    ui.rCampaign = e.target.value;
    renderResults();
  });
  $('#r-from').addEventListener('change', (e) => {
    ui.rFrom = e.target.value;
    renderResults();
  });
  $('#r-to').addEventListener('change', (e) => {
    ui.rTo = e.target.value;
    renderResults();
  });

  const dlgRecord = $('#dlg-record');
  const formRecord = $('#form-record');
  const NUM_FIELDS = ['impressoes', 'cliques', 'custo', 'conversoes', 'valor'];

  function openRecord(id, campaignId) {
    if (!Store.campaigns().length) {
      toast('Crie primeiro uma campanha');
      openCampaign();
      return;
    }
    formRecord.reset();
    $('#record-error').hidden = true;
    const r = id ? Store.records().find((x) => x.id === id) : null;
    $('#dlg-record-title').textContent = r ? 'Editar registo' : 'Novo registo';
    $('#btn-save-new').hidden = !!r;
    fillCampaignSelect(formRecord.campaignId, r?.campaignId || campaignId || (ui.rCampaign !== 'all' ? ui.rCampaign : ''), false);
    formRecord.id.value = r ? r.id : '';
    formRecord.data.value = r ? r.data : today();
    for (const k of NUM_FIELDS) formRecord[k].value = r ? (r[k] ?? '') : '';
    updatePreview();
    dlgRecord.showModal();
    (r ? formRecord.impressoes : formRecord.campaignId).focus();
  }

  function readRecordForm() {
    const f = formRecord;
    const out = { id: f.id.value || undefined, campaignId: f.campaignId.value, data: f.data.value };
    for (const k of NUM_FIELDS) out[k] = f[k].value === '' ? 0 : Number(f[k].value);
    return out;
  }

  function updatePreview() {
    const t = Metrics.aggregate([readRecordForm()]);
    $('#record-preview').innerHTML = ['ctr', 'cpc', 'taxaConv', 'cpa', 'roas']
      .map((k) => `<div>${Metrics.DEFS[k].label}<strong>${F(k, t[k])}</strong></div>`)
      .join('');
  }
  formRecord.addEventListener('input', updatePreview);

  formRecord.addEventListener('submit', (e) => {
    e.preventDefault();
    const action = e.submitter?.value || 'save';
    const data = readRecordForm();
    const err = $('#record-error');
    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = false;
    };
    if (!data.campaignId || !data.data) return fail('Escolha a campanha e a data.');
    if (NUM_FIELDS.some((k) => data[k] < 0 || Number.isNaN(data[k]))) return fail('Os valores não podem ser negativos.');
    if (data.cliques > data.impressoes && data.impressoes > 0) return fail('O número de cliques não pode exceder as impressões.');
    const dup = Store.findRecord(data.campaignId, data.data);
    if (dup && dup.id !== data.id) {
      if (!confirm('Já existe um registo para esta campanha nesta data. Substituir?')) return;
      Store.deleteRecord(dup.id);
    }
    Store.upsertRecord(data);
    toast(data.id ? 'Registo atualizado' : 'Registo guardado');
    if (action === 'save-new') {
      const keepCampaign = data.campaignId;
      const next = addDays(data.data, 1);
      openRecord(null, keepCampaign);
      formRecord.data.value = next;
      formRecord.impressoes.focus();
    } else {
      dlgRecord.close();
    }
    render();
  });

  $('#btn-new-record').addEventListener('click', () => openRecord());

  // ---------- Delegação de eventos ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) t.closest('dialog').close();
    else if (t.dataset.goto) setView(t.dataset.goto);
    else if (t.dataset.editCampaign) openCampaign(t.dataset.editCampaign);
    else if (t.dataset.addRecord) openRecord(null, t.dataset.addRecord);
    else if (t.dataset.editRecord) openRecord(t.dataset.editRecord);
    else if (t.dataset.delCampaign) {
      const c = Store.campaign(t.dataset.delCampaign);
      const n = Store.records().filter((r) => r.campaignId === c.id).length;
      if (confirm(`Apagar a campanha “${c.nome}”${n ? ` e os seus ${n} registos` : ''}?`)) {
        Store.deleteCampaign(c.id);
        toast('Campanha apagada');
        render();
      }
    } else if (t.dataset.delRecord) {
      if (confirm('Apagar este registo?')) {
        Store.deleteRecord(t.dataset.delRecord);
        toast('Registo apagado');
        render();
      }
    }
  });

  // ---------- Tema ----------
  $('#btn-theme').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try {
      localStorage.setItem('gads-manager:theme', root.dataset.theme);
    } catch {}
    render();
  });

  // ---------- Menu de dados ----------
  const menu = $('#data-menu');
  $('#btn-data-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
  });
  menu.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.action;
    if (!a) return;
    menu.hidden = true;
    IO[a]?.();
  });

  // ---------- Importar / exportar ----------
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const CSV_HEAD = ['data', 'campanha', 'impressoes', 'cliques', 'custo', 'conversoes', 'valor_conversao'];
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvNum = (v) => String(v ?? 0).replace('.', ',');

  function parseCsv(text) {
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

  const toNum = (s) => {
    let v = String(s ?? '').trim().replace(/[€\s%]/g, '');
    if (v.includes(',') && v.includes('.')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    else v = v.replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const toIsoDate = (s) => {
    const v = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  };

  let pendingImport = null;
  const fileInput = $('#file-input');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file || !pendingImport) return;
    const text = await file.text();
    pendingImport(text);
    pendingImport = null;
  });
  const pickFile = (accept, handler) => {
    fileInput.accept = accept;
    pendingImport = handler;
    fileInput.click();
  };

  const IO = {
    'export-csv'() {
      const rows = [...Store.records()].sort((a, b) => a.data.localeCompare(b.data));
      if (!rows.length) return toast('Não há resultados para exportar');
      const lines = [CSV_HEAD.join(';')].concat(
        rows.map((r) =>
          [r.data, csvCell(Store.campaign(r.campaignId)?.nome), r.impressoes, r.cliques, csvNum(r.custo), csvNum(r.conversoes), csvNum(r.valor)].join(';'),
        ),
      );
      download(`google-ads-resultados-${today()}.csv`, `﻿${lines.join('\n')}`, 'text/csv;charset=utf-8');
    },
    'import-csv'() {
      pickFile('.csv', (text) => {
        const rows = parseCsv(text.replace(/^﻿/, ''));
        if (rows.length < 2) return toast('Ficheiro CSV vazio');
        const head = rows[0].map((h) => h.trim().toLowerCase());
        const idx = (names) => head.findIndex((h) => names.includes(h));
        const col = {
          data: idx(['data', 'date', 'dia', 'day']),
          campanha: idx(['campanha', 'campaign']),
          impressoes: idx(['impressoes', 'impressões', 'impressions', 'impr.']),
          cliques: idx(['cliques', 'clicks']),
          custo: idx(['custo', 'cost']),
          conversoes: idx(['conversoes', 'conversões', 'conversions']),
          valor: idx(['valor_conversao', 'valor de conversão', 'valor conv.', 'conv. value', 'conversion value']),
        };
        if (col.data < 0 || col.campanha < 0) return toast('O CSV precisa das colunas "data" e "campanha"');
        let added = 0;
        let skipped = 0;
        for (const r of rows.slice(1)) {
          const data = toIsoDate(r[col.data]);
          const nome = (r[col.campanha] || '').trim();
          if (!data || !nome) {
            skipped++;
            continue;
          }
          let c = Store.campaigns().find((x) => x.nome.toLowerCase() === nome.toLowerCase());
          if (!c) {
            Store.upsertCampaign({ nome, tipo: 'Pesquisa', estado: 'ativa', objetivo: 'Vendas', inicio: data, notas: '' });
            c = Store.campaigns().find((x) => x.nome === nome);
          }
          const rec = { campaignId: c.id, data };
          for (const k of NUM_FIELDS) rec[k] = col[k] >= 0 ? toNum(r[col[k]]) : 0;
          const dup = Store.findRecord(c.id, data);
          if (dup) rec.id = dup.id;
          Store.upsertRecord(rec);
          added++;
        }
        toast(`${added} registos importados${skipped ? `, ${skipped} ignorados` : ''}`);
        render();
      });
    },
    'export-json'() {
      download(`google-ads-backup-${today()}.json`, JSON.stringify({ versao: 1, ...Store.snapshot() }, null, 2), 'application/json');
    },
    'import-json'() {
      pickFile('.json', (text) => {
        try {
          const data = JSON.parse(text);
          if (!Array.isArray(data.campaigns) || !Array.isArray(data.records)) throw new Error('formato');
          if (!confirm('Restaurar esta cópia vai substituir todos os dados atuais. Continuar?')) return;
          Store.replaceAll(data);
          toast('Cópia de segurança restaurada');
          render();
        } catch {
          toast('Ficheiro JSON inválido');
        }
      });
    },
    demo() {
      if (Store.campaigns().length && !confirm('Os dados de exemplo vão substituir os dados atuais. Continuar?')) return;
      Store.replaceAll(Demo.generate(today, addDays, Store.uid));
      toast('Dados de exemplo carregados');
      render();
    },
    clear() {
      if (!confirm('Apagar todas as campanhas e resultados? Esta ação não pode ser anulada.')) return;
      Store.replaceAll({ campaigns: [], records: [] });
      toast('Todos os dados foram apagados');
      render();
    },
  };

  // ---------- Dados de exemplo ----------
  const Demo = {
    generate(todayFn, add, uid) {
      const t = todayFn();
      const defs = [
        { nome: 'Pesquisa — Marca', tipo: 'Pesquisa', objetivo: 'Vendas', orcamento: 50, cpaAlvo: 8, base: [900, 0.11, 0.35, 0.12, 55] },
        { nome: 'Pesquisa — Genéricas', tipo: 'Pesquisa', objetivo: 'Leads', orcamento: 160, cpaAlvo: 25, base: [3200, 0.045, 0.9, 0.04, 0] },
        { nome: 'Performance Max — Loja', tipo: 'Performance Max', objetivo: 'Vendas', orcamento: 120, cpaAlvo: 20, base: [14000, 0.012, 0.55, 0.03, 68] },
        { nome: 'Remarketing Display', tipo: 'Display', objetivo: 'Vendas', orcamento: 40, cpaAlvo: 15, base: [22000, 0.004, 0.28, 0.02, 45], estado: 'pausada' },
      ];
      const campaigns = [];
      const records = [];
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (const d of defs) {
        const id = uid();
        campaigns.push({ id, nome: d.nome, tipo: d.tipo, estado: d.estado || 'ativa', orcamento: d.orcamento, cpaAlvo: d.cpaAlvo, objetivo: d.objetivo, inicio: add(t, -89), notas: '', criadaEm: new Date().toISOString() });
        const [imp, ctr, cpc, cr, aov] = d.base;
        const end = d.estado === 'pausada' ? -20 : 0;
        for (let i = -89; i <= end; i++) {
          const date = add(t, i);
          const dow = parseIso(date).getDay();
          const wk = dow === 0 || dow === 6 ? 0.75 : 1;
          const trend = 1 + (i + 89) / 300;
          const impressoes = Math.round(imp * wk * trend * (0.8 + rnd() * 0.4));
          const cliques = Math.round(impressoes * ctr * (0.85 + rnd() * 0.3));
          const custo = Math.round(cliques * cpc * (0.85 + rnd() * 0.3) * 100) / 100;
          const conversoes = Math.round(cliques * cr * (0.6 + rnd() * 0.8));
          const valor = Math.round(conversoes * aov * (0.8 + rnd() * 0.4) * 100) / 100;
          records.push({ id: uid(), campaignId: id, data: date, impressoes, cliques, custo, conversoes, valor });
        }
      }
      return { campaigns, records };
    },
  };

  // ---------- Render ----------
  function render() {
    if (ui.view === 'dashboard') renderDashboard();
    else if (ui.view === 'campaigns') renderCampaigns();
    else renderResults();
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => ui.view === 'dashboard' && renderDashboard(), 150);
  });

  Store.load();
  setView(ui.view);
})();

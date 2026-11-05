/* Utilitários partilhados da interface: estado da UI, toasts com "Anular", diálogos, tabelas. */
const UI = (() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = Fmt.esc;
  const today = () => Core.localToday();

  // ---------- Estado da interface (preferências guardadas) ----------
  const PERSIST = ['view', 'range', 'metric', 'gran', 'compare', 'dim', 'rep', 'ptype'];
  const state = {
    view: 'dashboard',
    campaign: 'all',
    range: '30',
    from: '',
    to: '',
    metric: 'custo',
    gran: 'dia',
    compare: 'total',
    dim: 'campanha',
    pacingMonth: '',
    summarySort: { key: 'custo', dir: -1 },
    rCampaign: 'all',
    rFrom: '',
    rTo: '',
    rSearch: '',
    rLimit: 200,
    recordSort: { key: 'inicio', dir: -1 },
    rep: 'month',
    repFrom: '',
    repTo: '',
    repCampaign: 'all',
    ptype: 'dia',
  };
  try {
    const saved = JSON.parse(localStorage.getItem('gads-manager:ui') || '{}');
    for (const k of PERSIST) if (saved[k] !== undefined) state[k] = saved[k];
  } catch {}
  function save() {
    try {
      const out = {};
      for (const k of PERSIST) out[k] = state[k];
      localStorage.setItem('gads-manager:ui', JSON.stringify(out));
    } catch {}
  }

  // ---------- Vistas ----------
  const views = {};
  function render() {
    views[state.view]?.();
    App.renderChrome();
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, { undo = false, error = false } = {}) {
    const t = $('#toast');
    $('#toast-text').textContent = msg;
    $('#toast-undo').hidden = !undo;
    t.classList.toggle('error', error);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 8000 : 3000);
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('#toast-undo').addEventListener('click', () => {
      if (Store.undo()) toast('Ação anulada');
    });
  });

  // ---------- Diálogo de pergunta (substitui confirm) ----------
  /** @returns {Promise<string|null>} o valor do botão escolhido, ou null se fechou. */
  function ask({ title, text, buttons }) {
    const dlg = $('#dlg-ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text || '';
    const actions = $('#ask-actions');
    actions.innerHTML = '';
    return new Promise((resolve) => {
      let result = null;
      const all = [{ label: 'Cancelar', value: null, cls: 'ghost' }, ...buttons];
      for (const b of all) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn ${b.cls || ''}`;
        btn.textContent = b.label;
        btn.dataset.value = b.value ?? '';
        btn.addEventListener('click', () => {
          result = b.value;
          dlg.close();
        });
        actions.append(btn);
      }
      dlg.addEventListener('close', () => resolve(result), { once: true });
      dlg.showModal();
      actions.lastElementChild.focus();
    });
  }
  const confirmDanger = async (title, text, label = 'Apagar') =>
    (await ask({ title, text, buttons: [{ label, value: 'ok', cls: 'danger' }] })) === 'ok';

  function formError(form, msg) {
    const e = $('[data-error]', form);
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  // ---------- Selects ----------
  function fillCampaignSelect(sel, value, { all = false, allLabel = 'Todas as campanhas', none = null } = {}) {
    const camps = Store.campaigns();
    let html = all ? `<option value="all">${esc(allLabel)}</option>` : '';
    if (none !== null) html += `<option value="">${esc(none)}</option>`;
    html += camps.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    sel.innerHTML = html;
    if ([...sel.options].some((o) => o.value === value)) sel.value = value;
    else if (sel.options.length) sel.selectedIndex = 0;
    return sel.value;
  }

  function setSegmented(group, attr, value) {
    $$(`[data-${attr}]`, group).forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
  }

  // ---------- Cores das séries ----------
  const MAX_SERIES = 7;
  const seriesColor = (i) => `var(--s${i + 1})`;
  const OTHER_COLOR = 'var(--s-other)';

  // ---------- Tabelas ----------
  const METRIC_COLS = [
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
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      if (typeof va === 'string') return va.localeCompare(vb, 'pt') * dir;
      return (va - vb) * dir;
    });
  }

  /**
   * Tabela ordenável.
   * cols: [{key, label, html?(row), text?: true}]; as colunas de métricas usam Fmt.metric.
   */
  function table(host, { cols, rows, sort, onSort, total, actions, sortable = true }) {
    sortRows(rows, sort);
    const head = cols
      .map((c) => {
        const arrow = sortable && sort.key === c.key ? `<span class="arrow">${sort.dir > 0 ? '↑' : '↓'}</span>` : '';
        return `<th ${sortable ? `data-sort="${c.key}"` : ''} class="${c.text ? 'text' : ''}">${esc(c.label)}${arrow}</th>`;
      })
      .join('');
    const cell = (c, r) => {
      if (c.html) return `<td class="${c.text ? 'text' : ''}">${c.html(r)}</td>`;
      if (Fmt.DEFS[c.key]) return `<td>${Fmt.metric(c.key, r[c.key])}</td>`;
      return `<td class="text">${esc(r[c.key])}</td>`;
    };
    const body = rows
      .map((r) => `<tr>${cols.map((c) => cell(c, r)).join('')}${actions ? `<td class="actions">${actions(r)}</td>` : ''}</tr>`)
      .join('');
    const foot = total
      ? `<tfoot><tr>${cols.map((c, i) => (i === 0 ? `<td class="text">${esc(total.label)}</td>` : c.text ? `<td class="text">${esc(total[c.key] ?? '')}</td>` : Fmt.DEFS[c.key] ? `<td>${Fmt.metric(c.key, total[c.key])}</td>` : '<td></td>')).join('')}${actions ? '<td></td>' : ''}</tr></tfoot>`
      : '';
    host.innerHTML = `<table><thead><tr>${head}${actions ? '<th class="actions"></th>' : ''}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
    if (sortable) {
      $$('th[data-sort]', host).forEach((th) =>
        th.addEventListener('click', () => {
          const k = th.dataset.sort;
          const textCol = cols.find((c) => c.key === k)?.text;
          onSort({ key: k, dir: sort.key === k ? -sort.dir : textCol ? 1 : -1 });
        }),
      );
    }
  }

  function empty(title, text, button) {
    return `<div class="empty"><strong>${esc(title)}</strong><span>${esc(text)}</span>${button || ''}</div>`;
  }

  // ---------- Comparação de períodos ----------
  /** Período anterior equivalente: mês anterior para meses (ou parte deles), senão o mesmo nº de dias antes. */
  function previousPeriod(from, to) {
    if (from === Core.startOfMonth(from) && Core.startOfMonth(to) === from) {
      const pm = Core.addMonths(from, -1);
      const len = Core.dayCount(from, to);
      const end = Core.minDate(Core.addDays(pm, len - 1), Core.endOfMonth(pm));
      return { from: pm, to: end };
    }
    const len = Core.dayCount(from, to);
    return { from: Core.addDays(from, -len), to: Core.addDays(from, -1) };
  }

  function deltaHtml(key, cur, prev) {
    if (!prev || prev.n === 0 || cur[key] === null || !prev[key]) return '<div class="kpi-delta">sem comparação</div>';
    const change = (cur[key] - prev[key]) / prev[key];
    const better = Fmt.DEFS[key].better;
    const good = better === 'up' ? change > 0 : better === 'down' ? change < 0 : null;
    const cls = Math.abs(change) < 0.005 || good === null ? '' : good ? 'up' : 'down';
    const arrow = change > 0.0005 ? '▲' : change < -0.0005 ? '▼' : '';
    return `<div class="kpi-delta ${cls}">${arrow} ${Fmt.pct1.format(Math.abs(change))} vs. anterior</div>`;
  }

  const KPI_KEYS = ['custo', 'impressoes', 'cliques', 'ctr', 'cpc', 'conversoes', 'cpa', 'roas'];
  function kpis(host, cur, prev) {
    host.innerHTML = KPI_KEYS.map(
      (k) =>
        `<div class="kpi"><div class="kpi-label">${Fmt.DEFS[k].label}</div><div class="kpi-value">${Fmt.metric(k, cur[k])}</div>${deltaHtml(k, cur, prev)}</div>`,
    ).join('');
  }

  const estadoLabel = (e) => ({ ativa: 'Ativa', pausada: 'Pausada', terminada: 'Terminada' })[e] || e;

  /** Rótulo do tipo de período de um registo. */
  function periodType(r) {
    if (r.inicio === r.fim) return 'dia';
    if (r.inicio === Core.startOfWeek(r.inicio) && r.fim === Core.addDays(r.inicio, 6)) return 'semana';
    if (r.inicio === Core.startOfMonth(r.inicio) && r.fim === Core.endOfMonth(r.inicio)) return 'mes';
    return 'intervalo';
  }
  const PTYPE_LABEL = { dia: 'Dia', semana: 'Semana', mes: 'Mês', intervalo: 'Intervalo' };

  return {
    $, $$, esc, today, state, save, views, render, toast, ask, confirmDanger, formError,
    fillCampaignSelect, setSegmented, MAX_SERIES, seriesColor, OTHER_COLOR, METRIC_COLS, sortRows, table, empty,
    previousPeriod, kpis, estadoLabel, periodType, PTYPE_LABEL,
  };
})();

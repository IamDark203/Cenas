/*
 * Gráfico de linhas em SVG (uma ou várias séries), com crosshair, tooltip com todas as séries
 * e marcadores de anotações. Sem dependências.
 */
const LineChart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const exp = 10 ** Math.floor(Math.log10(v));
    const f = v / exp;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * exp;
  }

  /**
   * @param {HTMLElement} host
   * @param {object} o
   * @param {Array<{from:string,to:string,start:string,end:string}>} o.buckets
   * @param {Array<{name:string,color:string,values:(number|null)[]}>} o.series
   * @param {{label:string, fmt:Function, axis:Function}} o.def
   * @param {Array<{data:string,texto:string,alvo:string}>} o.notes
   * @param {string} o.gran
   * @param {HTMLElement} o.tooltip
   * @param {string} [o.emptyText]
   */
  function render(host, o) {
    host.innerHTML = '';
    const { buckets, series, def, gran, tooltip } = o;
    const notes = o.notes || [];
    const hasData = series.some((s) => s.values.some((v) => v !== null));
    if (!buckets.length || !hasData) {
      const empty = h('div', 'empty');
      empty.append(h('strong', '', 'Sem dados neste período'), h('span', '', o.emptyText || 'Adicione resultados no separador “Resultados”.'));
      host.append(empty);
      return;
    }

    if (series.length > 1) {
      const legend = h('div', 'legend');
      for (const s of series) {
        const item = h('span', 'legend-item');
        const key = h('span', 'legend-key');
        key.style.background = s.color;
        item.append(key, document.createTextNode(s.name));
        legend.append(item);
      }
      host.append(legend);
    }

    const plot = h('div', 'plot');
    host.append(plot);
    const W = plot.clientWidth || 800;
    const H = plot.clientHeight || 260;
    const m = { top: 14, right: 14, bottom: 26, left: 64 };
    const iw = Math.max(10, W - m.left - m.right);
    const ih = Math.max(10, H - m.top - m.bottom);
    const all = series.flatMap((s) => s.values.filter((v) => v !== null));
    const yMax = niceMax(Math.max(...all) * 1.05);
    const n = buckets.length;
    const x = (i) => m.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.top + ih - (v / yMax) * ih;
    const indexOfDate = (d) => buckets.findIndex((b) => d >= b.from && d <= b.to);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Gráfico de ${def.label}` });

    // Grelha + eixo Y
    const axis = el('g', { class: 'axis' });
    for (let t = 0; t <= 4; t++) {
      const v = (yMax / 4) * t;
      svg.append(el('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: W - m.right, y1: y(v), y2: y(v) }));
      const lbl = el('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
      lbl.textContent = def.axis(v);
      axis.append(lbl);
    }
    // Eixo X: rótulos espaçados (sempre o primeiro e o último)
    const maxLabels = Math.max(2, Math.floor(iw / 80));
    const every = Math.max(1, Math.ceil(n / maxLabels));
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (!(i % every === 0 || last)) continue;
      if (!last && n - 1 - i < every * 0.6 && i !== 0) continue;
      const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : last ? 'end' : 'middle';
      const lbl = el('text', { x: x(i), y: H - 6, 'text-anchor': anchor });
      lbl.textContent = Fmt.bucket(buckets[i], gran);
      axis.append(lbl);
    }
    svg.append(axis);

    // Anotações (atrás das linhas)
    const noteIdx = new Map();
    for (const nt of notes) {
      const i = indexOfDate(nt.data);
      if (i < 0) continue;
      if (!noteIdx.has(i)) noteIdx.set(i, []);
      noteIdx.get(i).push(nt);
    }
    for (const i of noteIdx.keys()) {
      svg.append(el('line', { class: 'note-line', x1: x(i), x2: x(i), y1: m.top, y2: m.top + ih }));
      svg.append(el('rect', { class: 'note-flag', x: x(i) - 4, y: m.top - 6, width: 8, height: 8, rx: 2, transform: `rotate(45 ${x(i)} ${m.top - 2})` }));
    }

    // Séries
    const single = series.length === 1;
    for (const s of series) {
      let d = '';
      let area = '';
      let segStart = null;
      let prev = null;
      const closeArea = () => {
        if (segStart !== null) area += `L${x(prev)},${y(0)}L${x(segStart)},${y(0)}Z`;
      };
      s.values.forEach((v, i) => {
        if (v === null) {
          closeArea();
          segStart = null;
          return;
        }
        const cmd = segStart === null ? 'M' : 'L';
        if (segStart === null) segStart = i;
        d += `${cmd}${x(i)},${y(v)}`;
        area += `${cmd}${x(i)},${y(v)}`;
        prev = i;
      });
      closeArea();
      if (single) svg.append(el('path', { class: 'area', d: area, fill: s.color }));
      svg.append(el('path', { class: 'line', d, stroke: s.color }));
      const count = s.values.filter((v) => v !== null).length;
      // Pontos: quando há poucos, ou quando um valor está isolado (sem vizinhos para formar linha)
      s.values.forEach((v, i) => {
        if (v === null) return;
        const isolated = (i === 0 || s.values[i - 1] === null) && (i === n - 1 || s.values[i + 1] === null);
        if (count <= 31 || isolated) svg.append(el('circle', { class: 'dot', cx: x(i), cy: y(v), r: 4, fill: s.color }));
      });
    }

    // Interação
    const cross = el('line', { class: 'crosshair', y1: m.top, y2: m.top + ih, visibility: 'hidden' });
    svg.append(cross);
    const focusDots = series.map((s) => {
      const c = el('circle', { class: 'dot focus', r: 5, fill: s.color, visibility: 'hidden' });
      svg.append(c);
      return c;
    });
    const hit = el('rect', { x: m.left - 10, y: 0, width: iw + 20, height: H, fill: 'transparent', tabindex: 0 });
    svg.append(hit);

    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      focusDots.forEach((c) => c.setAttribute('visibility', 'hidden'));
      tooltip.hidden = true;
    };
    let current = -1;
    function show(i, clientX, clientY) {
      current = i;
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      series.forEach((s, k) => {
        const v = s.values[i];
        const c = focusDots[k];
        if (v === null) c.setAttribute('visibility', 'hidden');
        else {
          c.setAttribute('cx', x(i));
          c.setAttribute('cy', y(v));
          c.setAttribute('visibility', 'visible');
        }
      });
      tooltip.innerHTML = '';
      tooltip.append(h('div', 'tt-title', Fmt.bucketLong(buckets[i], gran)));
      const rows = series.map((s, k) => ({ s, v: s.values[i], k })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
      for (const { s, v } of rows) {
        const row = h('div', 'tt-row');
        const key = h('span', 'tt-key');
        key.style.background = s.color;
        row.append(key, h('span', 'tt-value', v === null ? '—' : def.fmt(v)), h('span', 'tt-name', single ? def.label : s.name));
        tooltip.append(row);
      }
      for (const nt of noteIdx.get(i) || []) {
        const row = h('div', 'tt-note');
        row.append(h('strong', '', `${Fmt.date(nt.data)}${nt.alvo ? ` · ${nt.alvo}` : ''}`), h('span', '', nt.texto));
        tooltip.append(row);
      }
      tooltip.hidden = false;
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = clientX + 16;
      if (left + tw > window.innerWidth - 8) left = clientX - tw - 16;
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${Math.max(8, Math.min(clientY - 10, window.innerHeight - th - 8))}px`;
    }
    hit.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.left) / iw) * (n - 1))));
      show(i, ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const i = Math.max(0, Math.min(n - 1, (current < 0 ? n - 1 : current) + (ev.key === 'ArrowRight' ? 1 : -1)));
      const r = svg.getBoundingClientRect();
      show(i, r.left + (x(i) / W) * r.width, r.top + m.top + 20);
    });

    plot.append(svg);
  }

  return { render };
})();

/* Gráfico de linha simples em SVG, com crosshair e tooltip. Sem dependências. */
const LineChart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = 10 ** Math.floor(Math.log10(v));
    const f = v / exp;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * exp;
  }

  const fmtDay = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' });
  const fmtLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
  const toDate = (iso) => new Date(`${iso}T00:00:00`);

  /**
   * @param {HTMLElement} host
   * @param {{date: string, value: number|null}[]} points  ordenados por data
   * @param {{label: string, fmt: Function, axis: Function}} def
   * @param {HTMLElement} tooltip
   */
  function render(host, points, def, tooltip) {
    host.innerHTML = '';
    const valid = points.filter((p) => p.value !== null);
    if (valid.length === 0) {
      host.innerHTML =
        '<div class="empty"><strong>Sem dados neste período</strong>Adicione resultados no separador “Resultados”.</div>';
      return;
    }

    const W = host.clientWidth || 800;
    const H = host.clientHeight || 280;
    const m = { top: 12, right: 12, bottom: 26, left: 64 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const yMax = niceMax(Math.max(...valid.map((p) => p.value)) * 1.05);
    const n = points.length;
    const x = (i) => m.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.top + ih - (v / yMax) * ih;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Gráfico de ${def.label}` });

    // Grelha e eixo Y
    const axis = el('g', { class: 'axis' });
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = (yMax / ticks) * t;
      const yy = y(v);
      svg.appendChild(el('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: W - m.right, y1: yy, y2: yy }));
      const label = el('text', { x: m.left - 8, y: yy + 4, 'text-anchor': 'end' });
      label.textContent = def.axis(v);
      axis.appendChild(label);
    }

    // Eixo X: no máximo ~7 rótulos
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
    points.forEach((p, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every / 2) return;
      const label = el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle' });
      label.textContent = fmtDay.format(toDate(p.date));
      axis.appendChild(label);
    });
    svg.appendChild(axis);

    // Linha (quebra em dias sem dados)
    let d = '';
    let area = '';
    let segStart = null;
    let prevI = null;
    const closeArea = () => {
      if (segStart !== null) area += `L${x(prevI)},${y(0)}L${x(segStart)},${y(0)}Z`;
    };
    points.forEach((p, i) => {
      if (p.value === null) {
        closeArea();
        segStart = null;
        return;
      }
      const cmd = segStart === null ? 'M' : 'L';
      if (segStart === null) segStart = i;
      d += `${cmd}${x(i)},${y(p.value)}`;
      area += `${cmd}${x(i)},${y(p.value)}`;
      prevI = i;
    });
    closeArea();
    svg.appendChild(el('path', { class: 'area', d: area }));
    svg.appendChild(el('path', { class: 'line', d }));

    // Pontos visíveis apenas quando há poucos dados
    if (valid.length <= 31) {
      points.forEach((p, i) => {
        if (p.value !== null) svg.appendChild(el('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: valid.length <= 14 ? 4 : 3 }));
      });
    }

    // Interação
    const cross = el('line', { class: 'crosshair', y1: m.top, y2: m.top + ih, visibility: 'hidden' });
    const focus = el('circle', { class: 'dot', r: 5, visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(focus);
    const hit = el('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(hit);

    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
      tooltip.hidden = true;
    };
    hit.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = n === 1 ? 0 : Math.round(((px - m.left) / iw) * (n - 1));
      const p = points[Math.max(0, Math.min(n - 1, i))];
      const idx = points.indexOf(p);
      cross.setAttribute('x1', x(idx));
      cross.setAttribute('x2', x(idx));
      cross.setAttribute('visibility', 'visible');
      if (p.value !== null) {
        focus.setAttribute('cx', x(idx));
        focus.setAttribute('cy', y(p.value));
        focus.setAttribute('visibility', 'visible');
      } else {
        focus.setAttribute('visibility', 'hidden');
      }
      tooltip.innerHTML = `<div class="tt-title">${fmtLong.format(toDate(p.date))}</div>
        <div>${def.label}: <span class="tt-value">${p.value === null ? 'sem dados' : def.fmt(p.value)}</span></div>`;
      tooltip.hidden = false;
      const tw = tooltip.offsetWidth;
      const left = ev.clientX + 14 + tw > window.innerWidth ? ev.clientX - tw - 14 : ev.clientX + 14;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${ev.clientY - 10}px`;
    });
    hit.addEventListener('pointerleave', hide);

    host.appendChild(svg);
  }

  return { render };
})();

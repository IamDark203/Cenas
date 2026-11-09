/* Gráficos simples em SVG/HTML, sem bibliotecas externas. */
(function (root) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  // Cores das categorias de despesa; verde/roxo/cinzento ficam reservados para poupança, investimento e por alocar.
  const CORES = ['#2457d6', '#e8743b', '#d64a7f', '#13a4b4', '#c9a227', '#a35d3d', '#e05b5b', '#7a8b2e', '#4a6fa5'];
  const CORES_TIPO = { poupanca: '#19a979', investimento: '#945ecf', livre: '#b8c0cc' };

  function el(tag, attrs, texto) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (texto != null) e.textContent = texto;
    return e;
  }

  function corPara(fatia, i) {
    return CORES_TIPO[fatia.tipo] || CORES[i % CORES.length];
  }

  function donut(contentor, fatias, formatar) {
    contentor.replaceChildren();
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    if (total <= 0) {
      contentor.append(el('p', { class: 'ajuda' }, 'Adiciona rendimentos e despesas para ver a distribuição.'));
      return;
    }
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 42 42');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Distribuição do rendimento');
    const raio = 15.9155; // perímetro = 100
    let deslocamento = 25; // começa no topo
    let iDespesa = 0;
    const cores = fatias.map((f) => corPara(f, f.tipo === 'despesa' ? iDespesa++ : 0));
    fatias.forEach((f, i) => {
      const pct = (f.valor / total) * 100;
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', '21');
      c.setAttribute('cy', '21');
      c.setAttribute('r', String(raio));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', cores[i]);
      c.setAttribute('stroke-width', '6');
      c.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
      c.setAttribute('stroke-dashoffset', String(deslocamento));
      const t = document.createElementNS(SVG, 'title');
      t.textContent = `${f.nome}: ${formatar(f.valor)} (${pct.toFixed(1)}%)`;
      c.append(t);
      svg.append(c);
      deslocamento -= pct;
    });
    const ul = el('ul', { class: 'legenda' });
    fatias.forEach((f, i) => {
      const li = el('li');
      const cor = el('span', { class: 'cor' });
      cor.style.background = cores[i];
      li.append(cor, el('span', {}, f.nome), el('span', { class: 'val' }, `${((f.valor / total) * 100).toFixed(0)}%`));
      li.title = formatar(f.valor);
      ul.append(li);
    });
    contentor.append(svg, ul);
  }

  function barras(contentor, linhas, formatar, opcoes) {
    contentor.replaceChildren();
    if (!linhas.length) {
      contentor.append(el('p', { class: 'ajuda' }, (opcoes && opcoes.vazio) || 'Sem dados.'));
      return;
    }
    const max = Math.max(...linhas.map((l) => l.valor), 0.01);
    linhas.forEach((l, i) => {
      const linha = el('div', { class: 'linha-barra' });
      const cab = el('div', { class: 'cabecalho' });
      cab.append(el('span', {}, l.nome), el('span', {}, l.detalhe || formatar(l.valor)));
      const barra = el('div', { class: 'barra' });
      const preench = el('span');
      preench.style.width = `${Math.max(0, Math.min(1, l.fracao != null ? l.fracao : l.valor / max)) * 100}%`;
      preench.style.background = l.cor || CORES[i % CORES.length];
      barra.append(preench);
      linha.append(cab, barra);
      if (l.nota) linha.append(el('div', { class: 'ajuda' }, l.nota));
      contentor.append(linha);
    });
  }

  root.FinGraficos = { donut, barras, el };
})(self);

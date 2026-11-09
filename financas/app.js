/* Interface da aplicação: listas editáveis, formulários, resumo e armazenamento local. */
(function () {
  'use strict';

  const C = window.FinCalc;
  const G = window.FinGraficos;
  const el = G.el;
  const CHAVE = 'financas.v1';

  const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 });
  const fmt = (v) => euro.format(v || 0);

  let estado = carregar();
  let periodo = 'mensal';

  // ---------- Armazenamento ----------
  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) return C.normalizarEstado(JSON.parse(bruto));
    } catch (e) {
      console.warn('Não foi possível ler os dados guardados:', e);
    }
    return C.estadoInicial();
  }

  function guardar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) {
      avisar('Atenção: não foi possível guardar neste browser. Exporta uma cópia.');
    }
    desenhar();
  }

  // ---------- Definição das secções ----------
  const opcoesFreq = () => Object.fromEntries(Object.entries(C.FREQUENCIAS).map(([k, v]) => [k, v.nome]));
  const opcoesCategorias = () => Object.fromEntries(estado.categorias.map((c) => [c, c]));
  const campoNome = (exemplo) => ({ chave: 'nome', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, exemplo });
  const campoNotas = { chave: 'notas', rotulo: 'Notas', tipo: 'area' };
  const campoValor = (rotulo, chave, dica) => ({ chave: chave || 'valor', rotulo, tipo: 'numero', dica });

  const SECCOES = {
    rendimentos: {
      singular: 'rendimento',
      vazio: 'Ainda não tens rendimentos. Começa pelo teu ordenado.',
      novo: () => ({ tipo: 'ordenado', frequencia: 'mensal14' }),
      campos: () => [
        campoNome('Ex.: Ordenado empresa X'),
        { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: C.TIPOS_RENDIMENTO },
        { ...campoValor('Valor líquido (€)'), obrigatorio: true },
        {
          chave: 'frequencia',
          rotulo: 'Frequência',
          tipo: 'select',
          opcoes: opcoesFreq(),
          dica: '"14x" inclui os subsídios de férias e de Natal.',
        },
        campoNotas,
      ],
      linha: (i) => ({
        meta: `${C.TIPOS_RENDIMENTO[i.tipo]} · ${C.FREQUENCIAS[i.frequencia].nome}`,
        montante: fmt(i.valor),
        sub: `${fmt(C.valorMensal(i.valor, i.frequencia))}/mês`,
      }),
      total: (lista) => `${fmt(C.totalMensal(lista))}/mês`,
    },
    despesas: {
      singular: 'despesa',
      vazio: 'Ainda não tens despesas registadas.',
      novo: () => ({ categoria: estado.categorias[0], frequencia: 'mensal' }),
      campos: () => [
        campoNome('Ex.: Renda da casa'),
        { chave: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: opcoesCategorias() },
        { ...campoValor('Valor (€)'), obrigatorio: true },
        { chave: 'frequencia', rotulo: 'Frequência', tipo: 'select', opcoes: opcoesFreq() },
        campoNotas,
      ],
      linha: (i) => ({
        meta: `${i.categoria} · ${C.FREQUENCIAS[i.frequencia].nome}`,
        montante: fmt(i.valor),
        sub: `${fmt(C.valorMensal(i.valor, i.frequencia))}/mês`,
      }),
      total: (lista) => `${fmt(C.totalMensal(lista))}/mês`,
    },
    poupancas: {
      singular: 'poupança',
      vazio: 'Ainda não tens poupanças registadas.',
      novo: () => ({}),
      campos: () => [
        campoNome('Ex.: Fundo de emergência'),
        { ...campoValor('Saldo atual (€)', 'saldo'), obrigatorio: true },
        campoValor('Reforço mensal (€)', 'contribuicaoMensal', 'Quanto pões de parte todos os meses.'),
        campoValor('Objetivo (€)', 'objetivo', 'Opcional. Deixa a 0 se não tiveres objetivo.'),
        campoNotas,
      ],
      linha: (i) => {
        const p = C.progressoObjetivo(i);
        const partes = [];
        if (i.contribuicaoMensal) partes.push(`+${fmt(i.contribuicaoMensal)}/mês`);
        if (p) partes.push(`${pct.format(p.percentagem)} de ${fmt(i.objetivo)}`);
        return { meta: partes.join(' · ') || 'Sem reforço mensal', montante: fmt(i.saldo), sub: 'saldo' };
      },
      total: (lista) => fmt(lista.reduce((s, p) => s + p.saldo, 0)),
    },
    investimentos: {
      singular: 'investimento',
      vazio: 'Ainda não tens investimentos registados.',
      novo: () => ({ tipo: 'etf' }),
      campos: () => [
        campoNome('Ex.: ETF MSCI World'),
        { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: C.TIPOS_INVESTIMENTO },
        { ...campoValor('Total investido (€)', 'valorInvestido'), obrigatorio: true },
        { ...campoValor('Valor atual (€)', 'valorAtual'), obrigatorio: true },
        campoValor('Investimento mensal (€)', 'contribuicaoMensal'),
        campoNotas,
      ],
      linha: (i) => {
        const g = C.ganhoInvestimento(i);
        const sinal = g.ganho >= 0 ? '+' : '';
        return {
          meta: `${C.TIPOS_INVESTIMENTO[i.tipo]} · investido ${fmt(i.valorInvestido)}${
            i.contribuicaoMensal ? ` · +${fmt(i.contribuicaoMensal)}/mês` : ''
          }`,
          montante: fmt(i.valorAtual),
          sub: `${sinal}${fmt(g.ganho)} (${sinal}${pct.format(g.rentabilidade)})`,
          classeSub: g.ganho >= 0 ? 'positivo' : 'negativo',
        };
      },
      total: (lista) => fmt(C.resumoInvestimentos(lista).atual),
    },
  };

  // ---------- Listas ----------
  function desenharLista(nome) {
    const sec = SECCOES[nome];
    const cont = document.getElementById(`lista-${nome}`);
    const lista = estado[nome];
    cont.replaceChildren();
    if (!lista.length) {
      cont.append(el('div', { class: 'vazio' }, sec.vazio));
      return;
    }
    for (const item of lista) {
      const l = sec.linha(item);
      const linha = el('div', { class: 'item' });
      const info = el('div');
      info.append(el('div', { class: 'nome' }, item.nome), el('div', { class: 'meta' }, l.meta));
      if (item.notas) info.append(el('div', { class: 'meta' }, item.notas));
      const montante = el('div', { class: 'montante' }, l.montante);
      montante.append(el('small', l.classeSub ? { class: l.classeSub } : {}, l.sub));
      const botoes = el('div', { class: 'botoes' });
      const editar = el('button', { type: 'button', 'aria-label': `Editar ${item.nome}` }, 'Editar');
      editar.addEventListener('click', () => abrirFormulario(nome, item));
      const apagar = el('button', { type: 'button', class: 'perigo', 'aria-label': `Apagar ${item.nome}` }, 'Apagar');
      apagar.addEventListener('click', () => {
        if (!confirm(`Apagar "${item.nome}"?`)) return;
        estado[nome] = estado[nome].filter((x) => x.id !== item.id);
        guardar();
        avisar(`${capitalizar(sec.singular)} apagado(a).`);
      });
      botoes.append(editar, apagar);
      linha.append(info, montante, botoes);
      cont.append(linha);
    }
    const total = el('div', { class: 'total-lista' });
    total.append(el('span', {}, 'Total:'), el('span', {}, sec.total(lista)));
    cont.append(total);
  }

  // ---------- Formulário (criar / editar) ----------
  const dialogo = document.getElementById('dialogo');
  const form = document.getElementById('form-item');
  let edicao = null; // { nome, id }

  function abrirFormulario(nome, item) {
    const sec = SECCOES[nome];
    const dados = item || sec.novo();
    edicao = { nome, id: item ? item.id : null };
    document.getElementById('dialogo-titulo').textContent = `${item ? 'Editar' : 'Novo(a)'} ${sec.singular}`;
    document.getElementById('dialogo-erro').textContent = '';
    const campos = document.getElementById('dialogo-campos');
    campos.replaceChildren();
    for (const c of sec.campos()) campos.append(criarCampo(c, dados[c.chave]));
    dialogo.showModal();
    const primeiro = campos.querySelector('input, select');
    if (primeiro) primeiro.focus();
  }

  function criarCampo(c, valor) {
    const label = el('label', {}, c.rotulo);
    let input;
    if (c.tipo === 'select') {
      input = el('select', { name: c.chave });
      for (const [k, v] of Object.entries(c.opcoes)) input.append(el('option', { value: k }, v));
      if (valor != null && !(valor in c.opcoes)) input.append(el('option', { value: valor }, valor));
      if (valor != null) input.value = valor;
    } else if (c.tipo === 'area') {
      input = el('textarea', { name: c.chave, maxlength: '500', rows: '2' });
      input.value = valor || '';
    } else if (c.tipo === 'numero') {
      input = el('input', { name: c.chave, type: 'number', step: '0.01', min: '0', inputmode: 'decimal' });
      input.value = valor != null ? String(valor) : '';
      if (!c.obrigatorio) input.placeholder = '0';
    } else {
      input = el('input', { name: c.chave, type: 'text', maxlength: '100' });
      input.value = valor || '';
      if (c.exemplo) input.placeholder = c.exemplo;
    }
    if (c.obrigatorio) input.required = true;
    label.append(input);
    if (c.dica) label.append(el('span', { class: 'dica' }, c.dica));
    return label;
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!edicao) return;
    const sec = SECCOES[edicao.nome];
    const dados = { id: edicao.id || C.novoId() };
    for (const c of sec.campos()) {
      const v = form.elements[c.chave].value;
      dados[c.chave] = c.tipo === 'numero' ? C.numero(v) : v.trim();
    }
    if (!dados.nome) {
      document.getElementById('dialogo-erro').textContent = 'Indica uma descrição.';
      return;
    }
    const [limpo] = C.normalizarEstado({ [edicao.nome]: [dados] })[edicao.nome];
    const lista = estado[edicao.nome];
    const idx = lista.findIndex((x) => x.id === limpo.id);
    if (idx >= 0) lista[idx] = limpo;
    else lista.push(limpo);
    dialogo.close();
    guardar();
    avisar(idx >= 0 ? 'Alterações guardadas.' : `${capitalizar(sec.singular)} adicionado(a).`);
  });

  document.getElementById('cancelar').addEventListener('click', () => dialogo.close());

  // ---------- Resumo ----------
  function desenharResumo() {
    const r = C.resumo(estado);
    const m = periodo === 'anual' ? 12 : 1;
    const sufixo = periodo === 'anual' ? '/ano' : '/mês';
    const kpis = document.getElementById('kpis');
    kpis.replaceChildren();
    const kpi = (rotulo, valor, detalhe, classe) => {
      const k = el('div', { class: 'kpi' });
      k.append(el('div', { class: 'rotulo' }, rotulo), el('div', { class: `valor ${classe || ''}` }, valor));
      if (detalhe) k.append(el('div', { class: 'detalhe' }, detalhe));
      kpis.append(k);
    };
    kpi('Rendimentos', fmt(r.rendimento * m), sufixo);
    kpi('Despesas', fmt(r.despesas * m), sufixo);
    kpi('Poupança + investimento', fmt((r.poupancaMensal + r.investimentoMensal) * m), `${pct.format(r.taxaPoupanca)} do rendimento`);
    kpi('Saldo livre', fmt(r.saldoLivre * m), r.saldoLivre < 0 ? 'Estás a gastar mais do que ganhas' : sufixo, r.saldoLivre < 0 ? 'negativo' : 'positivo');
    kpi('Total poupado', fmt(r.totalPoupado));
    kpi('Património', fmt(r.patrimonio), 'poupanças + investimentos');

    const fatias = C.paraOndeVai(estado).map((f) => ({ ...f, valor: f.valor * m }));
    G.donut(document.getElementById('grafico-destino'), fatias, fmt);

    const cats = C.despesasPorCategoria(estado.despesas);
    G.barras(
      document.getElementById('grafico-categorias'),
      cats.map((c) => ({
        nome: c.categoria,
        valor: c.valor * m,
        detalhe: `${fmt(c.valor * m)}${r.rendimento > 0 ? ` · ${pct.format(c.valor / r.rendimento)}` : ''}`,
      })),
      fmt,
      { vazio: 'Sem despesas registadas.' },
    );

    const objetivos = estado.poupancas
      .map((p) => ({ p, prog: C.progressoObjetivo(p) }))
      .filter((x) => x.prog)
      .map(({ p, prog }) => ({
        nome: p.nome,
        valor: p.saldo,
        fracao: prog.percentagem,
        cor: '#19a979',
        detalhe: `${fmt(p.saldo)} de ${fmt(p.objetivo)}`,
        nota:
          prog.falta === 0
            ? 'Objetivo atingido!'
            : prog.mesesRestantes != null
              ? `Faltam ${fmt(prog.falta)} — cerca de ${prog.mesesRestantes} ${prog.mesesRestantes === 1 ? 'mês' : 'meses'}`
              : `Faltam ${fmt(prog.falta)} — define um reforço mensal`,
      }));
    G.barras(document.getElementById('resumo-objetivos'), objetivos, fmt, {
      vazio: 'Define um objetivo numa poupança para acompanhares o progresso.',
    });

    const ri = document.getElementById('resumo-investimentos');
    ri.replaceChildren();
    if (!estado.investimentos.length) {
      ri.append(el('p', { class: 'ajuda' }, 'Sem investimentos registados.'));
    } else {
      const inv = r.investimentos;
      const sinal = inv.ganho >= 0 ? '+' : '';
      const linhas = [
        ['Total investido', fmt(inv.investido)],
        ['Valor atual', fmt(inv.atual)],
        ['Ganho / perda', `${sinal}${fmt(inv.ganho)} (${sinal}${pct.format(inv.rentabilidade)})`, inv.ganho >= 0 ? 'positivo' : 'negativo'],
      ];
      for (const [k, v, cls] of linhas) {
        const d = el('div', { class: 'linha-barra' });
        const cab = el('div', { class: 'cabecalho' });
        cab.append(el('span', {}, k), el('strong', cls ? { class: cls } : {}, v));
        d.append(cab);
        ri.append(d);
      }
    }
  }

  // ---------- Categorias ----------
  function desenharCategorias() {
    const ul = document.getElementById('lista-categorias');
    ul.replaceChildren();
    for (const cat of estado.categorias) {
      const usadas = estado.despesas.filter((d) => d.categoria === cat).length;
      const li = el('li');
      li.append(el('span', {}, usadas ? `${cat} (${usadas})` : cat));
      const botoes = el('span', { class: 'botoes' });
      const renomear = el('button', { type: 'button' }, 'Mudar nome');
      renomear.addEventListener('click', () => {
        const novo = (prompt('Novo nome da categoria:', cat) || '').trim().slice(0, 60);
        if (!novo || novo === cat) return;
        if (estado.categorias.includes(novo)) return avisar('Já existe uma categoria com esse nome.');
        estado.categorias = estado.categorias.map((c) => (c === cat ? novo : c));
        for (const d of estado.despesas) if (d.categoria === cat) d.categoria = novo;
        guardar();
      });
      const apagar = el('button', { type: 'button', class: 'perigo' }, 'Apagar');
      apagar.addEventListener('click', () => apagarCategoria(cat, usadas));
      botoes.append(renomear, apagar);
      li.append(botoes);
      ul.append(li);
    }
  }

  function apagarCategoria(cat, usadas) {
    if (estado.categorias.length <= 1) return avisar('Tens de manter pelo menos uma categoria.');
    const restantes = estado.categorias.filter((c) => c !== cat);
    const destino = restantes.includes('Outros') ? 'Outros' : restantes[0];
    const msg = usadas
      ? `Apagar "${cat}"? As ${usadas} despesa(s) desta categoria passam para "${destino}".`
      : `Apagar "${cat}"?`;
    if (!confirm(msg)) return;
    estado.categorias = restantes;
    for (const d of estado.despesas) if (d.categoria === cat) d.categoria = destino;
    guardar();
  }

  document.getElementById('form-categoria').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = document.getElementById('nova-categoria');
    const nome = input.value.trim();
    if (!nome) return;
    if (estado.categorias.includes(nome)) return avisar('Essa categoria já existe.');
    estado.categorias.push(nome);
    input.value = '';
    guardar();
  });

  // ---------- Cópia de segurança ----------
  document.getElementById('exportar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `financas-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('importar').addEventListener('change', async (ev) => {
    const ficheiro = ev.target.files[0];
    ev.target.value = '';
    if (!ficheiro) return;
    try {
      const novo = C.normalizarEstado(JSON.parse(await ficheiro.text()));
      if (!confirm('Substituir os dados atuais pelos do ficheiro?')) return;
      estado = novo;
      guardar();
      avisar('Dados importados.');
    } catch (e) {
      avisar(`Não foi possível importar: ${e.message}`);
    }
  });

  document.getElementById('exemplo').addEventListener('click', () => {
    if (!confirm('Substituir os dados atuais por dados de exemplo?')) return;
    estado = C.normalizarEstado(window.FinExemplo());
    guardar();
    mostrarSeparador('resumo');
  });

  document.getElementById('apagar-tudo').addEventListener('click', () => {
    if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    estado = C.estadoInicial();
    guardar();
  });

  // ---------- Navegação ----------
  function mostrarSeparador(nome) {
    for (const b of document.querySelectorAll('[data-sep]')) b.setAttribute('aria-selected', String(b.dataset.sep === nome));
    for (const s of document.querySelectorAll('.separador')) s.hidden = s.id !== `sep-${nome}`;
    try {
      sessionStorage.setItem('financas.separador', nome);
    } catch (e) {
      /* sem armazenamento: ignora */
    }
  }

  for (const b of document.querySelectorAll('[data-sep]')) b.addEventListener('click', () => mostrarSeparador(b.dataset.sep));
  for (const b of document.querySelectorAll('[data-adicionar]')) {
    b.addEventListener('click', () => abrirFormulario(b.dataset.adicionar, null));
  }
  for (const b of document.querySelectorAll('[data-periodo]')) {
    b.addEventListener('click', () => {
      periodo = b.dataset.periodo;
      for (const x of document.querySelectorAll('[data-periodo]')) x.setAttribute('aria-pressed', String(x === b));
      desenharResumo();
    });
  }

  // ---------- Utilitários ----------
  let temporizador;
  function avisar(msg) {
    const a = document.getElementById('aviso');
    a.textContent = msg;
    a.classList.add('visivel');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => a.classList.remove('visivel'), 2800);
  }

  function capitalizar(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function desenhar() {
    for (const nome of Object.keys(SECCOES)) desenharLista(nome);
    desenharCategorias();
    desenharResumo();
  }

  desenhar();
  try {
    const sep = sessionStorage.getItem('financas.separador');
    if (sep && document.getElementById(`sep-${sep}`)) mostrarSeparador(sep);
  } catch (e) {
    /* ignora */
  }
})();

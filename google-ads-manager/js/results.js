/* Resultados: lista de registos e formulário de registo (dia/semana/mês/intervalo, com detalhe opcional). */
const Results = (() => {
  const { $, $$, esc, state } = UI;

  function render() {
    state.rCampaign = UI.fillCampaignSelect($('#r-campaign'), state.rCampaign, { all: true });
    const host = $('#records-table');
    if (!Store.campaigns().length) {
      host.innerHTML = UI.empty('Crie primeiro uma campanha', 'Os resultados são associados a campanhas.', '<button class="btn primary" data-goto="campaigns">Ir para Campanhas</button>');
      return;
    }
    const q = state.rSearch.trim().toLowerCase();
    let recs = Store.records().filter((r) => state.rCampaign === 'all' || r.campaignId === state.rCampaign);
    if (state.rFrom) recs = recs.filter((r) => r.fim >= state.rFrom);
    if (state.rTo) recs = recs.filter((r) => r.inicio <= state.rTo);
    if (q) {
      recs = recs.filter((r) =>
        [r.grupo, r.palavra, Store.campaign(r.campaignId)?.nome].some((v) => (v || '').toLowerCase().includes(q)),
      );
    }
    if (!recs.length) {
      host.innerHTML = UI.empty('Sem registos', 'Clique em “+ Novo registo” para adicionar resultados, ou ajuste os filtros.');
      return;
    }
    const rows = recs.map((r) => ({
      ...Core.aggregate([r]),
      id: r.id,
      inicio: r.inicio,
      fim: r.fim,
      tipo: UI.periodType(r),
      campanha: Store.campaign(r.campaignId)?.nome || '—',
      detalhe: [r.grupo, r.palavra].filter(Boolean).join(' › '),
    }));
    const total = { ...Core.aggregate(recs), label: 'Total', campanha: `${rows.length} registo${rows.length === 1 ? '' : 's'}` };
    UI.sortRows(rows, state.recordSort);
    const shown = rows.slice(0, state.rLimit);
    UI.table(host, {
      cols: [
        { key: 'inicio', label: 'Período', text: true, html: (r) => `<span class="ptype">${UI.PTYPE_LABEL[r.tipo]}</span> ${esc(Fmt.period(r.inicio, r.fim))}` },
        { key: 'campanha', label: 'Campanha', text: true },
        { key: 'detalhe', label: 'Grupo › palavra-chave', text: true, html: (r) => (r.detalhe ? esc(r.detalhe) : '<span class="muted">Total da campanha</span>') },
        ...UI.METRIC_COLS.filter(([k]) => k !== 'taxaConv').map(([key, label]) => ({ key, label })),
      ],
      rows: shown,
      sort: state.recordSort,
      onSort: (s) => {
        state.recordSort = s;
        render();
      },
      total,
      actions: (r) =>
        `<button class="icon-btn" data-edit-record="${esc(r.id)}">Editar</button><button class="icon-btn" data-dup-record="${esc(r.id)}" title="Duplicar para o período seguinte">Duplicar</button><button class="icon-btn danger" data-del-record="${esc(r.id)}" aria-label="Apagar">✕</button>`,
    });
    if (rows.length > shown.length) {
      host.insertAdjacentHTML('beforeend', `<div class="more"><button class="btn" id="btn-more">Mostrar mais (${rows.length - shown.length} restantes)</button></div>`);
      $('#btn-more').addEventListener('click', () => {
        state.rLimit += 200;
        render();
      });
    }
  }

  // ---------- Formulário ----------
  const NUMS = Core.NUM_FIELDS;
  const form = () => $('#form-record');
  let ptype = state.ptype;

  function setPtype(t) {
    ptype = t;
    UI.setSegmented($('#rec-ptype'), 'ptype', t);
    $$('#rec-period [data-p]').forEach((el) => (el.hidden = !el.dataset.p.split(' ').includes(t)));
    $('#rec-start-label').textContent = t === 'dia' ? 'Data *' : t === 'semana' ? 'Qualquer dia da semana *' : 'De *';
    updatePeriodHint();
  }

  /** Lê o período do formulário consoante o tipo escolhido. */
  function readPeriod() {
    const f = form();
    if (ptype === 'dia') return { inicio: f.inicio.value, fim: f.inicio.value };
    if (ptype === 'semana') {
      if (!Core.isIsoDate(f.inicio.value)) return { inicio: '', fim: '' };
      const s = Core.startOfWeek(f.inicio.value);
      return { inicio: s, fim: Core.addDays(s, 6) };
    }
    if (ptype === 'mes') {
      if (!/^\d{4}-\d{2}$/.test(f.mes.value)) return { inicio: '', fim: '' };
      const s = `${f.mes.value}-01`;
      return { inicio: s, fim: Core.endOfMonth(s) };
    }
    return { inicio: f.inicio.value, fim: f.fim.value };
  }

  function updatePeriodHint() {
    const { inicio, fim } = readPeriod();
    const ok = Core.isIsoDate(inicio) && Core.isIsoDate(fim) && fim >= inicio;
    const extra = ok && inicio > UI.today() ? ' · atenção: período no futuro' : '';
    $('#rec-period-hint').textContent = ok ? `Período: ${Fmt.period(inicio, fim)} (${Core.dayCount(inicio, fim)} dia${inicio === fim ? '' : 's'})${extra}` : '';
  }

  function readForm() {
    const f = form();
    const out = { id: f.id.value || undefined, campaignId: f.campaignId.value, ...readPeriod(), grupo: f.grupo.value.trim(), palavra: f.palavra.value.trim() };
    for (const k of NUMS) out[k] = f[k].value === '' ? 0 : Number(f[k].value);
    return out;
  }

  function updatePreview() {
    const t = Core.aggregate([readForm()]);
    $('#record-preview').innerHTML = ['ctr', 'cpc', 'taxaConv', 'cpa', 'roas']
      .map((k) => `<div>${Fmt.DEFS[k].label}<strong>${Fmt.metric(k, t[k])}</strong></div>`)
      .join('');
  }

  function updateDatalists() {
    const id = form().campaignId.value;
    const lv = id ? Store.levels(id) : { grupos: [], palavras: [] };
    $('#dl-grupos').innerHTML = lv.grupos.map((g) => `<option value="${esc(g)}">`).join('');
    $('#dl-palavras').innerHTML = lv.palavras.map((g) => `<option value="${esc(g)}">`).join('');
  }

  function fillPeriod(t, inicio, fim) {
    const f = form();
    setPtype(t);
    f.inicio.value = inicio;
    f.fim.value = fim;
    f.mes.value = inicio.slice(0, 7);
    updatePeriodHint();
  }

  /** Abre o formulário. `preset` pode trazer campanha, período e detalhe para "Duplicar" e "Guardar e seguinte". */
  function open(id, preset = {}) {
    if (!Store.campaigns().length) {
      UI.toast('Crie primeiro uma campanha');
      Campaigns.open();
      return;
    }
    const f = form();
    f.reset();
    UI.formError(f, '');
    const r = id ? Store.record(id) : null;
    const src = r || preset;
    $('#dlg-record-title').textContent = r ? 'Editar registo' : 'Novo registo';
    $('#btn-save-new').hidden = !!r;
    UI.fillCampaignSelect(f.campaignId, src.campaignId || (state.rCampaign !== 'all' ? state.rCampaign : ''));
    f.id.value = r ? r.id : '';
    const t = src.inicio ? UI.periodType(src) : ptype || 'dia';
    const today = UI.today();
    fillPeriod(t, src.inicio || (t === 'mes' ? Core.startOfMonth(today) : today), src.fim || today);
    f.grupo.value = src.grupo || '';
    f.palavra.value = src.palavra || '';
    $('#rec-detail').open = !!(src.grupo || src.palavra);
    for (const k of NUMS) f[k].value = r ? r[k] : preset[k] ?? '';
    updateDatalists();
    updatePreview();
    if (!$('#dlg-record').open) $('#dlg-record').showModal();
    (r || preset.campaignId ? f.impressoes : f.campaignId).focus();
  }

  /** Período seguinte do mesmo tipo (para "Guardar e seguinte" e "Duplicar"). */
  function nextPeriod(r) {
    const t = UI.periodType(r);
    if (t === 'mes') {
      const s = Core.addMonths(r.inicio, 1);
      return { inicio: s, fim: Core.endOfMonth(s) };
    }
    const len = Core.dayCount(r.inicio, r.fim);
    return { inicio: Core.addDays(r.inicio, len), fim: Core.addDays(r.fim, len) };
  }

  function describe(r) {
    const lvl = r.palavra ? `palavra-chave “${r.palavra}”` : r.grupo ? `grupo “${r.grupo}”` : 'total da campanha';
    return `${Fmt.period(r.inicio, r.fim)} (${lvl})`;
  }

  async function submit(e) {
    e.preventDefault();
    const f = form();
    const action = e.submitter?.value || 'save';
    const data = readForm();
    const err = Core.validateRecord(data);
    if (err) return UI.formError(f, err);
    const conflict = Core.findConflict(Store.records(), data);
    if (conflict) {
      const same =
        conflict.inicio === data.inicio && conflict.fim === data.fim && Core.levelPath(conflict).join('|') === Core.levelPath(data).join('|');
      if (!same) {
        return UI.formError(
          f,
          `Já existe um registo que se sobrepõe: ${describe(conflict)}. Para não contar resultados em duplicado, edite esse registo ou escolha outro período/nível.`,
        );
      }
      const choice = await UI.ask({
        title: 'Registo já existe',
        text: `Já existe um registo para ${describe(conflict)}. Quer substituí-lo pelos novos valores?`,
        buttons: [{ label: 'Substituir', value: 'replace', cls: 'primary' }],
      });
      if (choice !== 'replace') return;
      data.id = conflict.id;
    }
    state.ptype = ptype;
    UI.save();
    const wasEdit = !!f.id.value;
    Store.saveRecord(data);
    UI.toast(wasEdit || conflict ? 'Registo atualizado' : 'Registo guardado');
    if (action === 'save-new') {
      open(null, { campaignId: data.campaignId, grupo: data.grupo, palavra: data.palavra, ...nextPeriod(data) });
    } else {
      $('#dlg-record').close();
    }
  }

  async function remove(id) {
    Store.deleteRecord(id);
    UI.toast('Registo apagado', { undo: true });
  }

  function duplicate(id) {
    const r = Store.record(id);
    open(null, { campaignId: r.campaignId, grupo: r.grupo, palavra: r.palavra, ...nextPeriod(r) });
  }

  function bind() {
    const f = form();
    f.addEventListener('submit', submit);
    f.addEventListener('input', (e) => {
      if (['inicio', 'fim', 'mes'].includes(e.target.name)) updatePeriodHint();
      updatePreview();
      UI.formError(f, '');
    });
    f.campaignId.addEventListener('change', updateDatalists);
    $$('#rec-ptype button').forEach((b) =>
      b.addEventListener('click', () => {
        const prev = readPeriod();
        setPtype(b.dataset.ptype);
        if (prev.inicio) {
          f.inicio.value = prev.inicio;
          f.mes.value = prev.inicio.slice(0, 7);
          if (!f.fim.value) f.fim.value = prev.fim;
        }
        updatePeriodHint();
      }),
    );
    $('#btn-new-record').addEventListener('click', () => open());
    $('#r-campaign').addEventListener('change', (e) => {
      state.rCampaign = e.target.value;
      state.rLimit = 200;
      render();
    });
    for (const [id, key] of [['#r-from', 'rFrom'], ['#r-to', 'rTo'], ['#r-search', 'rSearch']]) {
      $(id).addEventListener('input', (e) => {
        state[key] = e.target.value;
        state.rLimit = 200;
        render();
      });
    }
  }

  UI.views.results = render;
  return { render, bind, open, remove, duplicate };
})();

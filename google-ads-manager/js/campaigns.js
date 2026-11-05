/* Campanhas: cartões com totais, ritmo do mês e alvos; formulário de campanha. */
const Campaigns = (() => {
  const { $, esc } = UI;

  function targetCheck(value, target, lowerIsBetter, fmt, label) {
    if (!(target > 0) || value === null) return '';
    const ok = lowerIsBetter ? value <= target : value >= target;
    return `<span class="status ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✕'} ${label} ${fmt(target)}</span>`;
  }

  function render() {
    const host = $('#campaign-list');
    const camps = Store.campaigns();
    if (!camps.length) {
      host.innerHTML = `<div class="card" style="grid-column:1/-1">${UI.empty('Sem campanhas nesta conta', 'Crie a primeira campanha para começar a registar resultados.', '<button class="btn primary" data-new-campaign>+ Nova campanha</button>')}</div>`;
      return;
    }
    const t = UI.today();
    const month = Core.startOfMonth(t);
    const all = Store.records();
    host.innerHTML = camps
      .map((c) => {
        const recs = all.filter((r) => r.campaignId === c.id);
        const tot = Core.aggregate(recs);
        const m = Core.aggregate(Core.sliceRecords(recs, month, t));
        const p = Core.pacing(recs, month, t, Core.monthlyBudget(c, month), c.objetivoConversoes);
        const pace = (now, proj) => {
          const scale = Math.max(1, now, proj ?? 0);
          return `<div class="pbar"><div class="pbar-fill" style="width:${((now / scale) * 100).toFixed(1)}%"></div>${proj !== null ? `<div class="pbar-proj" style="left:${((Math.min(proj, scale) / scale) * 100).toFixed(1)}%"></div>` : ''}<div class="pbar-limit" style="left:${((1 / scale) * 100).toFixed(1)}%"></div></div>`;
        };
        const budget = p.orcamento
          ? `<div class="cc-pace"><div class="cc-pace-row"><span>Orçamento do mês</span><span><b>${Fmt.eur.format(p.custo)}</b> de ${Fmt.eur.format(p.orcamento)}</span></div>${pace(p.pctGasto, p.pctProj)}
             ${p.projCusto !== null && !p.completo ? `<div class="cc-pace-row sub"><span>Previsão: ${Fmt.eur.format(p.projCusto)}</span>${paceBadge(p)}</div>` : ''}</div>`
          : '';
        const goal = p.objetivoConv
          ? `<div class="cc-pace"><div class="cc-pace-row"><span>Conversões do mês</span><span><b>${Fmt.dec.format(p.conversoes)}</b> de ${Fmt.dec.format(p.objetivoConv)}</span></div>${pace(p.pctConv, p.pctConvProj)}</div>`
          : '';
        const checks = [targetCheck(tot.cpa, c.cpaAlvo, true, (v) => Fmt.eur.format(v), 'CPA alvo'), targetCheck(tot.roas, c.roasAlvo, false, (v) => `${Fmt.dec.format(v)}×`, 'ROAS alvo')]
          .filter(Boolean)
          .join('');
        const lv = Store.levels(c.id);
        return `<article class="campaign-card">
          <div class="cc-head">
            <div>
              <div class="cc-name">${esc(c.nome)}</div>
              <div class="cc-meta">${esc(c.tipo || '')}${c.objetivo ? ` · ${esc(c.objetivo)}` : ''}${c.inicio ? ` · desde ${Fmt.date(c.inicio)}` : ''}</div>
            </div>
            <span class="badge ${esc(c.estado)}">${esc(UI.estadoLabel(c.estado))}</span>
          </div>
          <div class="cc-stats">
            <div class="cc-stat"><span>Custo total</span><strong>${Fmt.metric('custo', tot.custo)}</strong></div>
            <div class="cc-stat"><span>Conversões</span><strong>${Fmt.metric('conversoes', tot.conversoes)}</strong></div>
            <div class="cc-stat"><span>ROAS</span><strong>${Fmt.metric('roas', tot.roas)}</strong></div>
            <div class="cc-stat"><span>Cliques</span><strong>${Fmt.metric('cliques', tot.cliques)}</strong></div>
            <div class="cc-stat"><span>CTR</span><strong>${Fmt.metric('ctr', tot.ctr)}</strong></div>
            <div class="cc-stat"><span>Custo/conv.</span><strong>${Fmt.metric('cpa', tot.cpa)}</strong></div>
          </div>
          ${budget}${goal}
          ${checks ? `<div class="cc-checks">${checks}</div>` : ''}
          ${c.notas ? `<div class="cc-meta">${esc(c.notas)}</div>` : ''}
          <div class="cc-foot">
            <span class="cc-meta">${recs.length} registo${recs.length === 1 ? '' : 's'}${lv.grupos.length ? ` · ${lv.grupos.length} grupo${lv.grupos.length === 1 ? '' : 's'}` : ''} · este mês ${Fmt.eur.format(m.custo)}</span>
            <div class="cc-actions">
              <button class="icon-btn" data-view-campaign="${esc(c.id)}">Painel</button>
              <button class="icon-btn" data-add-record="${esc(c.id)}">+ Resultado</button>
              <button class="icon-btn" data-edit-campaign="${esc(c.id)}">Editar</button>
              <button class="icon-btn danger" data-del-campaign="${esc(c.id)}">Apagar</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  function paceBadge(p) {
    const s = Core.pacingStatus(p);
    if (s === 'acima') return '<span class="status bad">▲ Acima</span>';
    if (s === 'abaixo') return '<span class="status warn">▼ Abaixo</span>';
    if (s === 'ok') return '<span class="status good">✓ No ritmo</span>';
    return '';
  }

  // ---------- Formulário ----------
  const NUMS = ['orcamento', 'orcamentoMensal', 'objetivoConversoes', 'cpaAlvo', 'roasAlvo'];
  const TEXTS = ['nome', 'tipo', 'estado', 'inicio', 'objetivo', 'notas'];

  function open(id) {
    const f = $('#form-campaign');
    f.reset();
    UI.formError(f, '');
    const c = id ? Store.campaign(id) : null;
    $('#dlg-campaign-title').textContent = c ? 'Editar campanha' : 'Nova campanha';
    f.id.value = c ? c.id : '';
    if (c) for (const k of [...TEXTS, ...NUMS]) f[k].value = c[k] ?? '';
    else f.inicio.value = UI.today();
    $('#dlg-campaign').showModal();
    f.nome.focus();
  }

  async function remove(id) {
    const c = Store.campaign(id);
    const n = Store.records().filter((r) => r.campaignId === id).length;
    const ok = await UI.confirmDanger('Apagar campanha', `Apagar “${c.nome}”${n ? ` e os seus ${n} registos` : ''}? Pode anular logo a seguir.`);
    if (!ok) return;
    Store.deleteCampaign(id);
    UI.toast('Campanha apagada', { undo: true });
  }

  function bind() {
    const f = $('#form-campaign');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = f.nome.value.trim();
      if (!nome) return UI.formError(f, 'Indique o nome da campanha.');
      const dup = Store.campaigns().find((c) => c.nome.toLowerCase() === nome.toLowerCase() && c.id !== f.id.value);
      if (dup) return UI.formError(f, 'Já existe uma campanha com este nome nesta conta.');
      const data = { id: f.id.value || undefined };
      for (const k of TEXTS) data[k] = f[k].value.trim();
      data.nome = nome;
      for (const k of NUMS) {
        const v = f[k].value === '' ? null : Number(f[k].value);
        if (v !== null && (!Number.isFinite(v) || v < 0)) return UI.formError(f, 'Os valores de orçamento e objetivos têm de ser positivos.');
        data[k] = v;
      }
      Store.saveCampaign(data);
      $('#dlg-campaign').close();
      UI.toast(f.id.value ? 'Campanha atualizada' : 'Campanha criada');
    });
    $('#btn-new-campaign').addEventListener('click', () => open());
  }

  UI.views.campaigns = render;
  return { render, bind, open, remove };
})();

/* Arranque, navegação, contas, tema e delegação de eventos. */
const App = (() => {
  const { $, $$, esc, state } = UI;

  function setView(view) {
    if (!UI.views[view]) view = 'dashboard';
    state.view = view;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    UI.save();
    UI.render();
    window.scrollTo(0, 0);
  }

  function renderChrome() {
    const sel = $('#account-select');
    sel.innerHTML =
      Store.accounts()
        .map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`)
        .join('') + '<option value="__manage">Gerir contas…</option>';
    sel.value = Store.account().id;
    DataIO.banners();
    DataIO.menuStatus();
  }

  // ---------- Contas ----------
  function renderAccounts() {
    const list = $('#account-list');
    const counts = (id) => Store.allState().campaigns.filter((c) => c.accountId === id).length;
    list.innerHTML = Store.accounts()
      .map(
        (a) => `<li data-id="${esc(a.id)}">
          <input value="${esc(a.nome)}" aria-label="Nome da conta" maxlength="80" />
          <span class="muted small">${counts(a.id)} campanhas</span>
          ${a.id === Store.account().id ? '<span class="tag">atual</span>' : `<button class="icon-btn" data-switch-account="${esc(a.id)}">Abrir</button>`}
          <button class="icon-btn danger" data-del-account="${esc(a.id)}" aria-label="Apagar conta">✕</button>
        </li>`,
      )
      .join('');
    $$('input', list).forEach((inp) =>
      inp.addEventListener('change', () => {
        const nome = inp.value.trim();
        if (nome) Store.renameAccount(inp.closest('li').dataset.id, nome);
        renderAccounts();
      }),
    );
  }

  // ---------- Delegação de cliques ----------
  async function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (t.matches('[data-close]')) return t.closest('dialog').close();
    if (d.goto) return setView(d.goto);
    if (d.action && DataIO.actions[d.action]) {
      $('#data-menu').hidden = true;
      return DataIO.actions[d.action]();
    }
    if ('newCampaign' in d) return Campaigns.open();
    if (d.editCampaign) return Campaigns.open(d.editCampaign);
    if (d.delCampaign) return Campaigns.remove(d.delCampaign);
    if (d.viewCampaign) {
      state.campaign = d.viewCampaign;
      return setView('dashboard');
    }
    if (d.addRecord) return Results.open(null, { campaignId: d.addRecord });
    if (d.editRecord) return Results.open(d.editRecord);
    if (d.dupRecord) return Results.duplicate(d.dupRecord);
    if (d.delRecord) return Results.remove(d.delRecord);
    if (d.editNote) return Notes.open(d.editNote);
    if (d.switchAccount) {
      Store.switchAccount(d.switchAccount);
      $('#dlg-accounts').close();
      return UI.toast(`Conta “${Store.account().nome}”`);
    }
    if (d.delAccount) {
      const acc = Store.accounts().find((a) => a.id === d.delAccount);
      const ok = await UI.confirmDanger('Apagar conta', `Apagar a conta “${acc.nome}” com todas as campanhas, resultados e anotações? Pode anular logo a seguir.`);
      if (!ok) return;
      Store.deleteAccount(acc.id);
      renderAccounts();
      // Fechar a janela para o botão "Anular" do aviso ficar acessível
      $('#dlg-accounts').close();
      UI.toast(`Conta “${acc.nome}” apagada`, { undo: true });
    }
  }

  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    document.addEventListener('click', onClick);

    $('#account-select').addEventListener('change', (e) => {
      if (e.target.value === '__manage') {
        e.target.value = Store.account().id;
        renderAccounts();
        $('#dlg-accounts').showModal();
        return;
      }
      Store.switchAccount(e.target.value);
      state.campaign = 'all';
      state.rCampaign = 'all';
      state.repCampaign = 'all';
    });
    $('#form-account').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.target.nome;
      const nome = inp.value.trim();
      if (!nome) return inp.focus();
      Store.addAccount(nome);
      state.campaign = 'all';
      state.rCampaign = 'all';
      state.repCampaign = 'all';
      inp.value = '';
      renderAccounts();
      UI.toast(`Conta “${nome}” criada`);
    });

    // Menu de dados
    const menu = $('#data-menu');
    $('#btn-data-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      DataIO.menuStatus();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target.id !== 'btn-data-menu') menu.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.hidden = true;
    });

    // Tema
    $('#btn-theme').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try {
        localStorage.setItem('gads-manager:theme', root.dataset.theme);
      } catch {}
      UI.render();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => (state.view === 'dashboard' || state.view === 'report') && UI.render(), 150);
    });

    Dashboard.bind();
    Notes.bind();
    Campaigns.bind();
    Results.bind();
    Report.bind();
  }

  function init() {
    try {
      const theme = localStorage.getItem('gads-manager:theme');
      if (theme) document.documentElement.dataset.theme = theme;
    } catch {}
    Store.load();
    Store.onChange(() => UI.render());
    AutoFile.onStatus(() => renderChrome());
    bind();
    setView(state.view);
    AutoFile.restore();
    // Pede ao browser para não apagar os dados automaticamente quando há pouco espaço.
    navigator.storage?.persist?.().catch(() => {});
  }

  return { init, renderChrome, setView };
})();

document.addEventListener('DOMContentLoaded', App.init);

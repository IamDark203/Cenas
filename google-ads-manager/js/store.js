/*
 * Armazenamento: estado da app no localStorage, com contas, anular, sincronização entre
 * separadores e gravação automática num ficheiro escolhido pelo utilizador (quando o browser suporta).
 */
const Store = (() => {
  const KEY = 'gads-manager:v2';
  const OLD_KEY = 'gads-manager:v1';
  const listeners = new Set();
  let state = null;
  let undoSnapshot = null;
  let lastSaveError = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const emit = () => listeners.forEach((fn) => fn());

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    } catch (e) {
      lastSaveError = e;
    }
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Dados guardados corrompidos; a começar vazio.', e);
    }
    state = Core.migrate(parsed, uid);
    persist();
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      lastSaveError = null;
    } catch (e) {
      lastSaveError = e;
      console.error('Não foi possível guardar.', e);
    }
    AutoFile.schedule();
  }

  /** Aplica uma alteração. Com `undoable`, guarda uma cópia para o botão "Anular". */
  function commit(fn, { undoable = false } = {}) {
    if (undoable) undoSnapshot = clone(state);
    fn(state);
    persist();
    emit();
  }

  function undo() {
    if (!undoSnapshot) return false;
    state = undoSnapshot;
    undoSnapshot = null;
    persist();
    emit();
    return true;
  }

  // Outro separador alterou os dados: recarregar.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          state = Core.migrate(JSON.parse(e.newValue), uid);
          emit();
        } catch {}
      }
    });
  }

  // ---------- Leitura ----------
  const account = () => state.accounts.find((a) => a.id === state.currentAccountId);
  const accounts = () => [...state.accounts].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const campaigns = () =>
    state.campaigns.filter((c) => c.accountId === state.currentAccountId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const campaign = (id) => state.campaigns.find((c) => c.id === id);
  const records = () => {
    const ids = new Set(campaigns().map((c) => c.id));
    return state.records.filter((r) => ids.has(r.campaignId));
  };
  const record = (id) => state.records.find((r) => r.id === id);
  const notes = () => state.notes.filter((n) => n.accountId === state.currentAccountId).sort((a, b) => a.data.localeCompare(b.data));
  const note = (id) => state.notes.find((n) => n.id === id);
  const meta = () => state.meta;

  /** Grupos e palavras-chave já usados numa campanha (para sugestões). */
  function levels(campaignId) {
    const grupos = new Set();
    const palavras = new Set();
    for (const r of state.records) {
      if (r.campaignId !== campaignId) continue;
      if (r.grupo) grupos.add(r.grupo);
      if (r.palavra) palavras.add(r.palavra);
    }
    return { grupos: [...grupos].sort(), palavras: [...palavras].sort() };
  }

  // ---------- Escrita ----------
  function upsert(list, item) {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item };
    else list.push(item);
  }

  const saveCampaign = (c) =>
    commit((s) => upsert(s.campaigns, c.id ? c : { ...c, id: uid(), accountId: s.currentAccountId, criadaEm: new Date().toISOString() }));
  const deleteCampaign = (id) =>
    commit(
      (s) => {
        s.campaigns = s.campaigns.filter((c) => c.id !== id);
        s.records = s.records.filter((r) => r.campaignId !== id);
        s.notes = s.notes.filter((n) => n.campaignId !== id);
      },
      { undoable: true },
    );

  function saveRecord(r) {
    const item = r.id ? r : { ...r, id: uid() };
    commit((s) => upsert(s.records, item));
    return item;
  }
  const deleteRecord = (id) => commit((s) => (s.records = s.records.filter((r) => r.id !== id)), { undoable: true });

  const saveNote = (n) => commit((s) => upsert(s.notes, n.id ? n : { ...n, id: uid(), accountId: s.currentAccountId }));
  const deleteNote = (id) => commit((s) => (s.notes = s.notes.filter((n) => n.id !== id)), { undoable: true });

  function addAccount(nome) {
    const id = uid();
    commit((s) => {
      s.accounts.push({ id, nome });
      s.currentAccountId = id;
    });
    return id;
  }
  const renameAccount = (id, nome) => commit((s) => (s.accounts.find((a) => a.id === id).nome = nome));
  const switchAccount = (id) => commit((s) => (s.currentAccountId = id));
  function deleteAccount(id) {
    commit(
      (s) => {
        const camps = new Set(s.campaigns.filter((c) => c.accountId === id).map((c) => c.id));
        s.accounts = s.accounts.filter((a) => a.id !== id);
        s.campaigns = s.campaigns.filter((c) => !camps.has(c.id));
        s.records = s.records.filter((r) => !camps.has(r.campaignId));
        s.notes = s.notes.filter((n) => n.accountId !== id);
        if (!s.accounts.length) s.accounts.push({ id: uid(), nome: 'Conta principal' });
        if (!s.accounts.some((a) => a.id === s.currentAccountId)) s.currentAccountId = s.accounts[0].id;
      },
      { undoable: true },
    );
  }

  /** Substitui tudo (restauro) ou junta (partilha). Os dados recebidos são validados/migrados. */
  function importData(data, mode) {
    const incoming = Core.migrate(data, uid);
    commit(
      (s) => {
        const next = mode === 'merge' ? Core.merge(s, incoming) : incoming;
        if (mode === 'merge') next.currentAccountId = s.currentAccountId;
        next.meta = s.meta;
        Object.keys(s).forEach((k) => delete s[k]);
        Object.assign(s, Core.migrate(next, uid));
      },
      { undoable: true },
    );
  }

  /** Substitui apenas a conta atual (dados de exemplo / apagar dados da conta). */
  function replaceCurrentAccount(campaignsList, recordsList, notesList) {
    commit(
      (s) => {
        const acc = s.currentAccountId;
        const old = new Set(s.campaigns.filter((c) => c.accountId === acc).map((c) => c.id));
        s.campaigns = s.campaigns.filter((c) => !old.has(c.id)).concat(campaignsList.map((c) => ({ ...c, accountId: acc })));
        s.records = s.records.filter((r) => !old.has(r.campaignId)).concat(recordsList);
        s.notes = s.notes.filter((n) => n.accountId !== acc).concat(notesList.map((n) => ({ ...n, accountId: acc })));
      },
      { undoable: true },
    );
  }

  /** Cópia exportável. `onlyCurrent` exporta só a conta atual (para partilhar). */
  function exportData(onlyCurrent) {
    const s = clone(state);
    if (onlyCurrent) {
      const camps = new Set(campaigns().map((c) => c.id));
      s.accounts = s.accounts.filter((a) => a.id === s.currentAccountId);
      s.campaigns = s.campaigns.filter((c) => camps.has(c.id));
      s.records = s.records.filter((r) => camps.has(r.campaignId));
      s.notes = s.notes.filter((n) => n.accountId === s.currentAccountId);
    }
    delete s.meta;
    return { app: 'gestor-google-ads', ...s, exportadoEm: new Date().toISOString() };
  }

  function markBackup() {
    state.meta.ultimaCopia = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
    emit();
  }

  const hasData = () => state.records.length > 0 || state.campaigns.length > 0;

  return {
    uid, load, undo, canUndo: () => !!undoSnapshot, onChange: (fn) => listeners.add(fn), saveError: () => lastSaveError,
    account, accounts, campaigns, campaign, records, record, notes, note, meta, levels, hasData,
    saveCampaign, deleteCampaign, saveRecord, deleteRecord, saveNote, deleteNote,
    addAccount, renameAccount, switchAccount, deleteAccount,
    importData, replaceCurrentAccount, exportData, markBackup,
    allState: () => state,
  };
})();

/*
 * Gravação automática num ficheiro JSON (File System Access API: Chrome/Edge no computador).
 * O "handle" do ficheiro fica no IndexedDB; ao reabrir a app o browser pede de novo permissão.
 */
const AutoFile = (() => {
  const supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  let handle = null;
  let active = false;
  let timer = null;
  let status = 'off'; // off | active | needs-permission | error
  const listeners = new Set();
  const setStatus = (s) => {
    status = s;
    listeners.forEach((fn) => fn(s));
  };

  function idb(op, value) {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('gads-manager', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite');
          const st = tx.objectStore('kv');
          const r = op === 'get' ? st.get('autofile') : op === 'put' ? st.put(value, 'autofile') : st.delete('autofile');
          r.onsuccess = () => resolve(r.result ?? null);
          r.onerror = () => resolve(null);
        } catch {
          resolve(null); // ex.: browser que não consegue guardar o "handle" — a gravação continua nesta sessão
        }
      };
    });
  }

  async function write() {
    if (!active || !handle) return;
    try {
      const w = await handle.createWritable();
      await w.write(JSON.stringify(Store.exportData(false), null, 2));
      await w.close();
      Store.markBackup();
      if (status !== 'active') setStatus('active');
    } catch (e) {
      console.error('Falha na gravação automática', e);
      active = false;
      setStatus('error');
    }
  }

  function schedule() {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(write, 800);
  }

  async function choose() {
    handle = await window.showSaveFilePicker({
      suggestedName: 'gestor-google-ads-dados.json',
      types: [{ description: 'Dados JSON', accept: { 'application/json': ['.json'] } }],
    });
    await idb('put', handle);
    active = true;
    await write();
    setStatus('active');
  }

  async function restore() {
    if (!supported) return;
    handle = await idb('get');
    if (!handle) return;
    const perm = await handle.queryPermission?.({ mode: 'readwrite' });
    if (perm === 'granted') {
      active = true;
      setStatus('active');
    } else {
      setStatus('needs-permission');
    }
  }

  async function reactivate() {
    if (!handle) return;
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      active = true;
      await write();
      setStatus('active');
    }
  }

  async function stop() {
    active = false;
    handle = null;
    await idb('delete');
    setStatus('off');
  }

  return {
    supported, choose, restore, reactivate, stop, schedule,
    status: () => status, fileName: () => handle?.name || null, onStatus: (fn) => listeners.add(fn),
  };
})();

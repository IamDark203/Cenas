/* Persistência local (localStorage) para campanhas e registos de resultados. */
const Store = (() => {
  const KEY = 'gads-manager:v1';
  let state = { campaigns: [], records: [] };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { campaigns: parsed.campaigns || [], records: parsed.records || [] };
      }
    } catch (e) {
      console.warn('Não foi possível ler os dados guardados.', e);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Não foi possível guardar os dados.', e);
    }
  }

  const campaigns = () => [...state.campaigns].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const campaign = (id) => state.campaigns.find((c) => c.id === id);
  const records = () => state.records;

  function upsertCampaign(data) {
    if (data.id) {
      const i = state.campaigns.findIndex((c) => c.id === data.id);
      if (i >= 0) state.campaigns[i] = { ...state.campaigns[i], ...data };
    } else {
      state.campaigns.push({ ...data, id: uid(), criadaEm: new Date().toISOString() });
    }
    save();
  }

  function deleteCampaign(id) {
    state.campaigns = state.campaigns.filter((c) => c.id !== id);
    state.records = state.records.filter((r) => r.campaignId !== id);
    save();
  }

  /** Um registo por campanha e dia: se já existir, é substituído. */
  function findRecord(campaignId, data) {
    return state.records.find((r) => r.campaignId === campaignId && r.data === data);
  }

  function upsertRecord(data) {
    if (data.id) {
      const i = state.records.findIndex((r) => r.id === data.id);
      if (i >= 0) state.records[i] = { ...state.records[i], ...data };
    } else {
      state.records.push({ ...data, id: uid() });
    }
    save();
  }

  function deleteRecord(id) {
    state.records = state.records.filter((r) => r.id !== id);
    save();
  }

  function replaceAll(next) {
    state = { campaigns: next.campaigns || [], records: next.records || [] };
    save();
  }

  const snapshot = () => JSON.parse(JSON.stringify(state));

  return {
    uid, load, save, campaigns, campaign, records, upsertCampaign, deleteCampaign,
    findRecord, upsertRecord, deleteRecord, replaceAll, snapshot,
  };
})();

/* Dados: cópias de segurança, partilha, CSV, gravação automática, dados de exemplo e avisos. */
const DataIO = (() => {
  const { $, esc } = UI;
  const BACKUP_DAYS = 7;

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const slug = (s) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'conta';

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = $('#file-input');
      input.accept = accept;
      input.value = '';
      input.onchange = async () => {
        const f = input.files[0];
        resolve(f ? await f.text() : null);
      };
      input.click();
    });
  }

  // ---------- JSON ----------
  function backup() {
    download(`gestor-google-ads-copia-${UI.today()}.json`, JSON.stringify(Store.exportData(false), null, 2), 'application/json');
    Store.markBackup();
    UI.toast('Cópia de segurança descarregada');
  }

  function share() {
    const acc = Store.account();
    download(`gestor-google-ads-${slug(acc.nome)}-${UI.today()}.json`, JSON.stringify(Store.exportData(true), null, 2), 'application/json');
    UI.toast(`Conta “${acc.nome}” exportada`);
  }

  async function openJson() {
    const text = await pickFile('.json,application/json');
    if (text === null) return;
    let data;
    try {
      data = JSON.parse(text);
      if (!Array.isArray(data.campaigns) || !Array.isArray(data.records)) throw new Error('formato');
    } catch {
      UI.toast('Este ficheiro não é uma cópia válida da app', { error: true });
      return;
    }
    const nAcc = Array.isArray(data.accounts) ? data.accounts.length : 1;
    const choice = await UI.ask({
      title: 'Abrir ficheiro',
      text: `O ficheiro tem ${nAcc} conta${nAcc === 1 ? '' : 's'}, ${data.campaigns.length} campanhas e ${data.records.length} registos. “Juntar” acrescenta e atualiza os dados (ideal para ficheiros partilhados por colegas). “Substituir tudo” repõe exatamente a cópia.`,
      buttons: [
        { label: 'Substituir tudo', value: 'replace', cls: 'danger' },
        { label: 'Juntar', value: 'merge', cls: 'primary' },
      ],
    });
    if (!choice) return;
    Store.importData(data, choice);
    UI.toast(choice === 'merge' ? 'Dados juntados' : 'Cópia restaurada', { undo: true });
  }

  // ---------- CSV ----------
  const CSV_HEAD = ['inicio', 'fim', 'campanha', 'grupo_anuncios', 'palavra_chave', 'impressoes', 'cliques', 'custo', 'conversoes', 'valor_conversao'];

  function exportCsv() {
    const recs = [...Store.records()].sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!recs.length) return UI.toast('Não há resultados para exportar');
    const lines = [CSV_HEAD.join(';')].concat(
      recs.map((r) =>
        [
          r.inicio, r.fim, Core.csvCell(Store.campaign(r.campaignId)?.nome), Core.csvCell(r.grupo), Core.csvCell(r.palavra),
          r.impressoes, r.cliques, Core.csvNum(r.custo), Core.csvNum(r.conversoes), Core.csvNum(r.valor),
        ].join(';'),
      ),
    );
    download(`gestor-google-ads-${slug(Store.account().nome)}-${UI.today()}.csv`, `﻿${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  }

  /** Importa um CSV no formato exportado pela app (para a conta atual). */
  async function importCsv() {
    const text = await pickFile('.csv,text/csv');
    if (text === null) return;
    const rows = Core.parseCsv(text);
    if (rows.length < 2) return UI.toast('O ficheiro CSV está vazio', { error: true });
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const c = {
      inicio: col('inicio', 'data', 'início'),
      fim: col('fim'),
      campanha: col('campanha'),
      grupo: col('grupo_anuncios', 'grupo'),
      palavra: col('palavra_chave', 'palavra'),
      impressoes: col('impressoes', 'impressões'),
      cliques: col('cliques'),
      custo: col('custo'),
      conversoes: col('conversoes', 'conversões'),
      valor: col('valor_conversao', 'valor'),
    };
    if (c.inicio < 0 || c.campanha < 0) return UI.toast('O CSV precisa das colunas “inicio” e “campanha”', { error: true });

    // Validar tudo antes de gravar: ou entra tudo, ou nada.
    const problems = [];
    const pending = [];
    const newCamps = new Map();
    const findCamp = (nome) =>
      Store.campaigns().find((x) => x.nome.toLowerCase() === nome.toLowerCase()) || newCamps.get(nome.toLowerCase());
    rows.slice(1).forEach((row, i) => {
      const line = i + 2;
      const nome = (row[c.campanha] || '').trim();
      const inicio = Core.toIsoDate(row[c.inicio]);
      const fim = c.fim >= 0 && (row[c.fim] || '').trim() ? Core.toIsoDate(row[c.fim]) : inicio;
      if (!nome) return problems.push(`linha ${line}: falta a campanha`);
      if (!inicio || !fim) return problems.push(`linha ${line}: data inválida`);
      let camp = findCamp(nome);
      if (!camp) {
        camp = { id: Store.uid(), nome, tipo: 'Pesquisa', estado: 'ativa', objetivo: 'Vendas', inicio, notas: '', isNew: true };
        newCamps.set(nome.toLowerCase(), camp);
      }
      const r = {
        campaignId: camp.id, inicio, fim,
        grupo: c.grupo >= 0 ? (row[c.grupo] || '').trim() : '',
        palavra: c.palavra >= 0 ? (row[c.palavra] || '').trim() : '',
      };
      for (const k of Core.NUM_FIELDS) r[k] = c[k] >= 0 ? Core.toNum(row[c[k]]) : 0;
      const err = Core.validateRecord(r);
      if (err) return problems.push(`linha ${line}: ${err}`);
      const inFile = Core.findConflict(pending, r);
      if (inFile) return problems.push(`linha ${line}: sobrepõe-se a outra linha do ficheiro`);
      pending.push({ ...r, id: `tmp${line}` });
    });
    if (problems.length) {
      await UI.ask({
        title: 'Não foi possível importar',
        text: `Corrija o ficheiro e tente de novo. ${problems.length} problema${problems.length === 1 ? '' : 's'}: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? '…' : ''}`,
        buttons: [],
      });
      return;
    }
    // Registos já existentes com o mesmo período e nível são atualizados; sobreposições parciais bloqueiam.
    const existing = Store.records();
    const toSave = [];
    for (const r of pending) {
      const conflict = Core.findConflict(existing, { ...r, id: undefined });
      if (conflict) {
        const same = conflict.inicio === r.inicio && conflict.fim === r.fim && Core.levelPath(conflict).join('|') === Core.levelPath(r).join('|');
        if (!same) {
          await UI.ask({
            title: 'Não foi possível importar',
            text: `A linha de ${Fmt.period(r.inicio, r.fim)} sobrepõe-se a um registo existente (${Fmt.period(conflict.inicio, conflict.fim)}) com outro período ou nível de detalhe. Nada foi importado.`,
            buttons: [],
          });
          return;
        }
        toSave.push({ ...r, id: conflict.id });
      } else toSave.push({ ...r, id: Store.uid() });
    }
    const camps = [...newCamps.values()].map(({ isNew, ...x }) => x);
    Store.replaceCurrentAccount(
      Store.campaigns().concat(camps),
      Store.records().filter((r) => !toSave.some((s) => s.id === r.id)).concat(toSave),
      Store.notes(),
    );
    UI.toast(`${toSave.length} registos importados${camps.length ? `, ${camps.length} campanhas criadas` : ''}`, { undo: true });
  }

  // ---------- Exemplo ----------
  function demo() {
    const t = UI.today();
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const uid = Store.uid;
    const camps = [];
    const recs = [];
    const day = (base, date, i) => {
      const [imp, ctr, cpc, cr, aov] = base;
      const dow = Core.weekday(date);
      const wk = dow === 0 || dow === 6 ? 0.75 : 1;
      const trend = 1 + i / 400;
      const impressoes = Math.round(imp * wk * trend * (0.8 + rnd() * 0.4));
      const cliques = Math.round(impressoes * ctr * (0.85 + rnd() * 0.3));
      const custo = Math.round(cliques * cpc * (0.85 + rnd() * 0.3) * 100) / 100;
      const conversoes = Math.round(cliques * cr * (0.6 + rnd() * 0.8));
      const valor = aov ? Math.round(conversoes * aov * (0.8 + rnd() * 0.4) * 100) / 100 : 0;
      return { impressoes, cliques, custo, conversoes, valor };
    };
    const start = Core.addDays(t, -119);
    const mk = (o) => {
      const c = { id: uid(), estado: 'ativa', inicio: start, notas: '', ...o };
      camps.push(c);
      return c;
    };
    // 1) Diária, com detalhe por grupo de anúncios e palavra-chave
    const marca = mk({ nome: 'Pesquisa — Marca', tipo: 'Pesquisa', objetivo: 'Vendas', orcamento: 60, objetivoConversoes: 330, cpaAlvo: 6, roasAlvo: 12 });
    const kws = [
      ['Marca exata', 'loja exemplo', [520, 0.14, 0.32, 0.13, 58]],
      ['Marca exata', 'loja exemplo online', [210, 0.12, 0.35, 0.12, 52]],
      ['Marca + produto', '', [380, 0.08, 0.41, 0.09, 61]],
    ];
    // 2) Diária, só total
    const gen = mk({ nome: 'Pesquisa — Genéricas', tipo: 'Pesquisa', objetivo: 'Leads', orcamento: 165, objetivoConversoes: 220, cpaAlvo: 25 });
    // 3) Diária, só total
    const pmax = mk({ nome: 'Performance Max — Loja', tipo: 'Performance Max', objetivo: 'Vendas', orcamentoMensal: 3200, objetivoConversoes: 190, cpaAlvo: 18, roasAlvo: 4 });
    // 4) Semanal (registada à semana)
    const disp = mk({ nome: 'Remarketing Display', tipo: 'Display', objetivo: 'Vendas', orcamento: 35, cpaAlvo: 15, roasAlvo: 3 });
    // 5) Mensal, já terminada
    const vid = mk({ nome: 'Vídeo — Lançamento', tipo: 'Vídeo', objetivo: 'Notoriedade', estado: 'terminada', orcamentoMensal: 900 });

    for (let i = 0; i < 120; i++) {
      const d = Core.addDays(start, i);
      if (d > t) break;
      for (const [g, k, base] of kws) recs.push({ id: uid(), campaignId: marca.id, inicio: d, fim: d, grupo: g, palavra: k, ...day(base, d, i) });
      recs.push({ id: uid(), campaignId: gen.id, inicio: d, fim: d, grupo: '', palavra: '', ...day([3300, 0.045, 0.95, 0.042, 0], d, i) });
      recs.push({ id: uid(), campaignId: pmax.id, inicio: d, fim: d, grupo: '', palavra: '', ...day([14000, 0.012, 0.58, 0.032, 70], d, i) });
    }
    for (let w = Core.startOfWeek(start); Core.addDays(w, 6) < t; w = Core.addDays(w, 7)) {
      const tot = { impressoes: 0, cliques: 0, custo: 0, conversoes: 0, valor: 0 };
      for (let k = 0; k < 7; k++) {
        const v = day([21000, 0.0045, 0.27, 0.022, 48], Core.addDays(w, k), 0);
        for (const key of Object.keys(tot)) tot[key] += v[key];
      }
      tot.custo = Math.round(tot.custo * 100) / 100;
      tot.valor = Math.round(tot.valor * 100) / 100;
      recs.push({ id: uid(), campaignId: disp.id, inicio: w, fim: Core.addDays(w, 6), grupo: '', palavra: '', ...tot });
    }
    for (let m = 3; m >= 2; m--) {
      const s = Core.addMonths(t, -m);
      recs.push({ id: uid(), campaignId: vid.id, inicio: s, fim: Core.endOfMonth(s), grupo: '', palavra: '', impressoes: 410000 + m * 23000, cliques: 1900 + m * 150, custo: 870 - m * 12.5, conversoes: 12 + m, valor: 0 });
    }
    const notes = [
      { id: uid(), data: Core.addDays(t, -52), campaignId: pmax.id, texto: 'Novos recursos de imagem e títulos adicionados' },
      { id: uid(), data: Core.addDays(t, -24), campaignId: gen.id, texto: 'Lances aumentados em 15% nas palavras-chave genéricas' },
      { id: uid(), data: Core.addDays(t, -9), campaignId: null, texto: 'Início da campanha de época (promoção no site)' },
    ];
    return { camps, recs, notes };
  }

  async function loadDemo() {
    if (Store.campaigns().length) {
      const ok = await UI.confirmDanger('Carregar dados de exemplo', 'Os dados de exemplo vão substituir as campanhas e resultados desta conta. Pode anular logo a seguir.', 'Substituir');
      if (!ok) return;
    }
    const { camps, recs, notes } = demo();
    Store.replaceCurrentAccount(camps, recs, notes);
    UI.toast('Dados de exemplo carregados', { undo: true });
  }

  async function clearAccount() {
    const acc = Store.account();
    const ok = await UI.confirmDanger('Apagar dados da conta', `Apagar todas as campanhas, resultados e anotações de “${acc.nome}”? Pode anular logo a seguir.`, 'Apagar tudo');
    if (!ok) return;
    Store.replaceCurrentAccount([], [], []);
    UI.toast('Dados da conta apagados', { undo: true });
  }

  // ---------- Gravação automática ----------
  async function autofile() {
    try {
      await AutoFile.choose();
      UI.toast(`A gravar automaticamente em “${AutoFile.fileName()}”`);
    } catch (e) {
      if (e?.name !== 'AbortError') UI.toast('Não foi possível usar esse ficheiro', { error: true });
    }
  }

  // ---------- Avisos ----------
  let dismissedBackup = false;
  function banners() {
    const host = $('#banners');
    const items = [];
    if (Store.saveError()) {
      items.push({ cls: 'bad', text: 'Não foi possível guardar no browser (espaço cheio ou navegação privada). Faça já uma cópia de segurança.', actions: [['backup', 'Fazer cópia agora']] });
    }
    const st = AutoFile.status();
    if (st === 'needs-permission') {
      items.push({ cls: 'warn', text: `A gravação automática em “${AutoFile.fileName()}” está em pausa até autorizar de novo.`, actions: [['autofile-resume', 'Retomar']] });
    } else if (st === 'error') {
      items.push({ cls: 'bad', text: 'A gravação automática no ficheiro falhou.', actions: [['autofile', 'Escolher ficheiro'], ['backup', 'Fazer cópia']] });
    } else if (st !== 'active' && !dismissedBackup && Store.records().length) {
      const last = Store.meta().ultimaCopia;
      const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
      if (days >= BACKUP_DAYS) {
        const text = last
          ? `A última cópia de segurança foi ${Fmt.ago(last)}. Os dados só existem neste browser.`
          : 'Ainda não fez nenhuma cópia de segurança. Os dados só existem neste browser.';
        const actions = [['backup', 'Fazer cópia agora']];
        if (AutoFile.supported) actions.push(['autofile', 'Gravar automaticamente…']);
        items.push({ cls: 'info', text, actions, dismiss: true });
      }
    }
    host.innerHTML = items
      .map(
        (b) => `<div class="banner ${b.cls}"><span>${esc(b.text)}</span><span class="banner-actions">${b.actions
          .map(([a, l]) => `<button class="btn small" data-action="${a}">${esc(l)}</button>`)
          .join('')}${b.dismiss ? '<button class="icon-btn" data-action="dismiss-backup" aria-label="Fechar aviso">✕</button>' : ''}</span></div>`,
      )
      .join('');
  }

  function menuStatus() {
    const last = Store.meta().ultimaCopia;
    const st = AutoFile.status();
    $('#menu-status').innerHTML =
      st === 'active'
        ? `<span class="status good">● Gravação automática ativa</span><br/><span class="muted">${esc(AutoFile.fileName() || '')}</span>`
        : `Última cópia: <b>${last ? esc(Fmt.ago(last)) : 'nunca'}</b>`;
    $('#mi-autofile').hidden = !AutoFile.supported || st === 'active';
    $('#mi-autofile-stop').hidden = st === 'off' || !AutoFile.supported;
  }

  const actions = {
    backup, share, 'open-json': openJson, 'export-csv': exportCsv, 'import-csv': importCsv, demo: loadDemo, clear: clearAccount, autofile,
    'autofile-stop': async () => {
      await AutoFile.stop();
      UI.toast('Gravação automática parada');
      App.renderChrome();
    },
    'autofile-resume': async () => {
      await AutoFile.reactivate();
      App.renderChrome();
    },
    'dismiss-backup': () => {
      dismissedBackup = true;
      banners();
    },
  };

  return { actions, banners, menuStatus, demo };
})();

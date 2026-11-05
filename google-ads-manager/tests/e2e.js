/*
 * Teste ponta-a-ponta no browser (Playwright + Chromium).
 * Executar: node tests/e2e.js   (precisa do pacote `playwright` disponível)
 * A data é fixada em 15/11/2026 para os resultados serem previsíveis.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = `file://${path.resolve(__dirname, '..', 'index.html')}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gads-e2e-'));
let step = 0;
const ok = (msg) => console.log(`  ✓ ${String(++step).padStart(2)} ${msg}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, locale: 'pt-PT' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const $text = (sel) => page.locator(sel).innerText();
  const kpi = async (label) => page.locator('.kpi', { hasText: label }).first().locator('.kpi-value').innerText();
  const toastText = () => page.locator('#toast-text').innerText();
  const go = (view) => page.click(`.tab[data-view=${view}]`);
  const rowCount = () => page.locator('#records-table tbody tr').count();
  const formError = (form) => page.locator(`${form} [data-error]`);

  async function newRecord({ campanha, ptype = 'dia', inicio, fim, mes, grupo, palavra, v = {}, action = 'save' }) {
    if (!(await page.locator('#dlg-record').evaluate((d) => d.open))) await page.click('#btn-new-record');
    const f = '#form-record';
    if (campanha) await page.selectOption(`${f} [name=campaignId]`, { label: campanha });
    await page.click(`#rec-ptype [data-ptype=${ptype}]`);
    if (inicio) await page.fill(`${f} [name=inicio]`, inicio);
    if (fim) await page.fill(`${f} [name=fim]`, fim);
    if (mes) await page.fill(`${f} [name=mes]`, mes);
    if (grupo !== undefined || palavra !== undefined) {
      await page.locator('#rec-detail').evaluate((d) => (d.open = true));
      await page.fill(`${f} [name=grupo]`, grupo || '');
      await page.fill(`${f} [name=palavra]`, palavra || '');
    }
    for (const [k, val] of Object.entries(v)) await page.fill(`${f} [name=${k}]`, String(val));
    await page.click(`${f} button[value=${action}]`);
  }
  const dialogOpen = (id) => page.locator(id).evaluate((d) => d.open);
  /** Responde ao diálogo de pergunta e espera que a ação associada termine. */
  async function answer(value) {
    await page.click(value ? `#ask-actions button[data-value=${value}]` : '#ask-actions button');
    await page.waitForSelector('#dlg-ask:not([open])', { state: 'attached' });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  }

  // ---------------------------------------------------------------- arranque
  await page.goto(URL);
  assert.equal(await page.locator('#account-select option:checked').innerText(), 'Conta principal');
  assert.match(await $text('#summary'), /Ainda não tem campanhas/);
  ok('app abre vazia com a conta principal');

  // ---------------------------------------------------------------- campanhas
  await go('campaigns');
  await page.click('#btn-new-campaign');
  await page.fill('#form-campaign [name=nome]', 'Alpha');
  await page.fill('#form-campaign [name=orcamento]', '10');
  await page.fill('#form-campaign [name=objetivoConversoes]', '30');
  await page.fill('#form-campaign [name=cpaAlvo]', '5');
  await page.click('#form-campaign button[type=submit]');
  await page.click('#btn-new-campaign');
  await page.fill('#form-campaign [name=nome]', 'alpha');
  await page.click('#form-campaign button[type=submit]');
  assert.match(await formError('#form-campaign').innerText(), /Já existe/);
  await page.fill('#form-campaign [name=nome]', 'Beta <script>');
  await page.selectOption('#form-campaign [name=tipo]', 'Display');
  await page.click('#form-campaign button[type=submit]');
  assert.equal(await page.locator('.campaign-card').count(), 2);
  assert.equal(await page.locator('.cc-name', { hasText: 'Beta <script>' }).count(), 1, 'nomes são mostrados como texto');
  ok('criar campanhas, nome duplicado recusado, HTML escapado');

  // ---------------------------------------------------------------- registos
  await go('results');
  await page.click('#btn-new-record');
  await page.selectOption('#form-record [name=campaignId]', { label: 'Alpha' });
  await page.fill('#form-record [name=impressoes]', '1000');
  await page.fill('#form-record [name=cliques]', '50');
  await page.fill('#form-record [name=custo]', '20');
  await page.fill('#form-record [name=conversoes]', '4');
  await page.fill('#form-record [name=valor]', '100');
  const preview = await $text('#record-preview');
  assert.match(preview, /5,00\s?%/);
  assert.match(preview, /0,40\s?€/);
  assert.match(preview, /5,00\s?€/);
  assert.match(preview, /5×/);
  await page.click('#rec-ptype [data-ptype=dia]');
  await page.fill('#form-record [name=inicio]', '2026-11-10');
  await page.click('#form-record button[value=save-new]');
  assert.equal(await dialogOpen('#dlg-record'), true, '"Guardar e seguinte" mantém o formulário aberto');
  assert.equal(await page.inputValue('#form-record [name=inicio]'), '2026-11-11');
  assert.equal(await page.inputValue('#form-record [name=custo]'), '');
  await newRecord({ v: { impressoes: 500, cliques: 25, custo: 10, conversoes: 1, valor: 30 } });
  assert.equal(await rowCount(), 2);
  ok('registo diário com pré-visualização das métricas e "Guardar e seguinte" (avança um dia)');

  await newRecord({ campanha: 'Alpha', ptype: 'semana', inicio: '2026-11-04', v: { impressoes: 7000, cliques: 140, custo: 70, conversoes: 7, valor: 210 } });
  assert.match(await $text('#records-table'), /02\/11\/2026 – 08\/11\/2026/);
  await newRecord({ campanha: 'Beta <script>', ptype: 'mes', mes: '2026-10', v: { impressoes: 31000, cliques: 310, custo: 310, conversoes: 31, valor: 0 } });
  assert.match(await $text('#records-table'), /Outubro de 2026/);
  await newRecord({ campanha: 'Beta <script>', ptype: 'intervalo', inicio: '2026-11-01', fim: '2026-11-10', v: { impressoes: 1000, cliques: 100, custo: 100, conversoes: 10 } });
  assert.equal(await rowCount(), 5);
  ok('registos por semana (ajusta a segunda–domingo), mês e intervalo');

  await newRecord({ campanha: 'Alpha', ptype: 'dia', inicio: '2026-11-05', v: { custo: 1 } });
  assert.match(await formError('#form-record').innerText(), /sobrepõe/);
  await page.click('#dlg-record [data-close]');
  await newRecord({ campanha: 'Alpha', ptype: 'dia', inicio: '2026-11-10', grupo: 'G1', v: { custo: 1 } });
  assert.match(await formError('#form-record').innerText(), /sobrepõe/);
  await page.click('#dlg-record [data-close]');
  await newRecord({ campanha: 'Alpha', ptype: 'dia', inicio: '2026-11-10', v: { impressoes: 2000, cliques: 100, custo: 40, conversoes: 8, valor: 200 } });
  await page.waitForSelector('#dlg-ask[open]');
  assert.match(await $text('#ask-text'), /substituí-lo/);
  await answer('replace');
  assert.equal(await rowCount(), 5, 'substituir não cria registo novo');
  assert.equal(await dialogOpen('#dlg-record'), false);
  ok('sobreposições recusadas (mesmo nível e total vs. grupo); mesmo período pode ser substituído');

  await newRecord({ campanha: 'Alpha', inicio: '2026-11-12', grupo: 'G1', palavra: 'k1', v: { impressoes: 100, cliques: 10, custo: 5, conversoes: 1, valor: 20 } });
  await newRecord({ campanha: 'Alpha', inicio: '2026-11-12', grupo: 'g1', palavra: 'k2', v: { impressoes: 100, cliques: 10, custo: 5, conversoes: 1, valor: 20 } });
  await newRecord({ campanha: 'Alpha', inicio: '2026-11-12', grupo: 'G2', v: { impressoes: 200, cliques: 20, custo: 10, conversoes: 0 } });
  assert.equal(await rowCount(), 8);
  await newRecord({ campanha: 'Alpha', inicio: '2026-11-12', grupo: 'G1', v: { custo: 1 } });
  assert.match(await formError('#form-record').innerText(), /sobrepõe/);
  await page.click('#dlg-record [data-close]');
  await newRecord({ campanha: 'Alpha', inicio: '2026-11-13', palavra: 'sem grupo', v: { custo: 1 } });
  assert.match(await formError('#form-record').innerText(), /grupo de anúncios/);
  await page.click('#dlg-record [data-close]');
  await newRecord({ campanha: 'Alpha', inicio: '2026-11-13', v: { impressoes: 10, cliques: 20 } });
  assert.match(await formError('#form-record').innerText(), /cliques/);
  await page.click('#dlg-record [data-close]');
  ok('detalhe por grupo e palavra-chave; validações (palavra sem grupo, cliques > impressões)');

  await page.fill('#r-search', 'k2');
  assert.equal(await rowCount(), 1);
  await page.fill('#r-search', '');
  await page.fill('#r-from', '2026-11-11');
  assert.equal(await rowCount(), 4, 'filtro "De" inclui registos que terminam depois');
  await page.fill('#r-from', '');
  ok('filtros de pesquisa e de datas nos resultados');

  // ---------------------------------------------------------------- apagar e anular
  await page.locator('#records-table tbody tr', { hasText: 'k2' }).locator('[data-del-record]').click();
  assert.equal(await rowCount(), 7);
  assert.equal(await page.locator('#toast-undo').isVisible(), true);
  await page.click('#toast-undo');
  assert.equal(await rowCount(), 8);
  ok('apagar registo e anular');

  // ---------------------------------------------------------------- painel
  await go('dashboard');
  await page.click('#f-range [data-range=custom]');
  await page.fill('#f-from', '2026-11-01');
  await page.fill('#f-to', '2026-11-15');
  await page.locator('#f-to').dispatchEvent('change');
  // Novembro: Alpha 40+10+70+5+5+10 = 140; Beta 100 → 240 €
  assert.match(await kpi('Custo'), /^240,00\s?€$/);
  // Conversões: 8+1+7+1+1+0 + 10 = 28
  assert.equal(await kpi('Conversões'), '28');
  // Comparação com 17/10–31/10: Beta out. rateado 15/31 × 310 = 150 → +60 %
  assert.match(await page.locator('.kpi', { hasText: 'Custo' }).first().locator('.kpi-delta').innerText(), /60\s?%/);
  ok('indicadores do período com rateio e comparação com o período anterior');

  await page.selectOption('#f-campaign', { label: 'Alpha' });
  assert.match(await kpi('Custo'), /^140,00\s?€$/);
  await page.click('#summary-dim [data-dim=grupo]');
  const groupTable = await $text('#summary');
  assert.match(groupTable, /G1/);
  assert.match(groupTable, /G2/);
  assert.match(groupTable, /total da campanha/);
  await page.click('#summary-dim [data-dim=palavra]');
  assert.match(await $text('#summary'), /G1 › k1/);
  await page.click('#summary-dim [data-dim=campanha]');
  ok('filtro por campanha e detalhe por grupos / palavras-chave');

  await page.selectOption('#f-campaign', 'all');
  await page.click('#chart-gran [data-gran=semana]');
  await page.click('#chart-compare [data-compare=split]');
  assert.equal(await page.locator('#chart .legend-item').count(), 2);
  assert.equal(await page.locator('#chart path.line').count(), 2);
  const box = await page.locator('#chart svg').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.locator('#tooltip').isVisible(), true);
  assert.ok((await page.locator('#tooltip .tt-row').count()) === 2, 'tooltip mostra todas as séries');
  await page.click('#chart-gran [data-gran=mes]');
  assert.equal(await page.locator('#chart .axis text', { hasText: /nov/i }).count(), 1);
  await page.click('#chart-compare [data-compare=total]');
  await page.click('#chart-gran [data-gran=dia]');
  ok('gráfico por dia/semana/mês e comparação entre campanhas com tooltip');

  // Ritmo de novembro (dados até 12/11): Alpha 140 € em 12 dias → previsão 350 € vs orçamento 300 € (10 × 30)
  await page.fill('#pacing-month', '2026-11');
  await page.locator('#pacing-month').dispatchEvent('change');
  const alphaRow = page.locator('#pacing tbody tr', { hasText: 'Alpha' });
  const alphaText = await alphaRow.innerText();
  assert.match(alphaText, /140,00\s?€\s+de 300,00\s?€/);
  assert.match(alphaText, /350,00\s?€/);
  assert.match(alphaText, /Acima do orçamento/);
  assert.match(alphaText, /18 de 30/);
  assert.match(alphaText, /45/); // 18 conv × 30/12
  assert.match(alphaText, /Objetivo ao alcance/);
  await page.fill('#pacing-month', '2026-10');
  await page.locator('#pacing-month').dispatchEvent('change');
  assert.match(await $text('#pacing'), /mês completo/);
  ok('ritmo do mês: previsão de gasto e conversões face ao orçamento e objetivo');

  // ---------------------------------------------------------------- anotações
  await page.click('#btn-new-note');
  await page.fill('#form-note [name=data]', '2026-11-10');
  await page.selectOption('#form-note [name=campaignId]', { label: 'Alpha' });
  await page.fill('#form-note [name=texto]', 'Subi os lances');
  await page.click('#form-note button[type=submit]');
  assert.match(await $text('#notes-list'), /Subi os lances/);
  assert.equal(await page.locator('#chart .note-line').count(), 1);
  await page.click('[data-edit-note]');
  await page.click('#btn-del-note');
  assert.doesNotMatch(await $text('#notes-list'), /Subi os lances/);
  await page.click('#toast-undo');
  assert.match(await $text('#notes-list'), /Subi os lances/);
  ok('anotações aparecem na lista e no gráfico; apagar e anular');

  // ---------------------------------------------------------------- campanhas: ritmo e alvos
  await go('campaigns');
  const alphaCard = await page.locator('.campaign-card', { hasText: 'Alpha' }).innerText();
  assert.match(alphaCard, /Orçamento do mês/);
  assert.match(alphaCard, /CPA alvo/);
  ok('cartões de campanha com ritmo do mês e verificação de CPA alvo');

  // ---------------------------------------------------------------- relatório
  await go('report');
  await page.click('#rep-range [data-rep=custom]');
  await page.fill('#rep-from', '2026-11-01');
  await page.fill('#rep-to', '2026-11-30');
  await page.locator('#rep-to').dispatchEvent('change');
  const rep = await $text('#report');
  assert.match(rep, /Conta principal/);
  assert.match(rep, /Novembro de 2026/);
  assert.match(rep, /Orçamento e objetivos do mês/);
  assert.match(rep, /Subi os lances/);
  assert.match(rep, /Evolução por semana/);
  assert.match(await page.locator('#rep-camps tfoot').innerText(), /240,00\s?€/);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.topbar').isVisible(), false);
  assert.equal(await page.locator('#report').isVisible(), true);
  await page.pdf({ path: path.join(TMP, 'relatorio.pdf') });
  assert.ok(fs.statSync(path.join(TMP, 'relatorio.pdf')).size > 10000);
  await page.emulateMedia({ media: 'screen' });
  ok('relatório com período, totais, ritmo e notas; versão de impressão gera PDF');

  // ---------------------------------------------------------------- cópia de segurança
  assert.match(await $text('#banners'), /Ainda não fez nenhuma cópia/);
  let dl = page.waitForEvent('download');
  await page.click('#banners [data-action=backup]');
  const backupPath = path.join(TMP, 'copia.json');
  await (await dl).saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.records.length, 8);
  assert.equal(backup.notes.length, 1);
  assert.equal(await page.locator('#banners .banner').count(), 0, 'aviso desaparece depois da cópia');
  await page.click('#btn-data-menu');
  assert.match(await $text('#menu-status'), /hoje/);
  await page.keyboard.press('Escape');
  ok('aviso de cópia de segurança; cópia JSON descarregada com todos os dados');

  // ---------------------------------------------------------------- CSV
  dl = page.waitForEvent('download');
  await page.click('#btn-data-menu');
  await page.click('[data-action=export-csv]');
  const csvPath = path.join(TMP, 'resultados.csv');
  await (await dl).saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.match(csv, /^﻿inicio;fim;campanha;grupo_anuncios;palavra_chave/);
  assert.equal(csv.trim().split(/\r?\n/).length, 9);
  ok('exportar CSV (separador ;, decimais com vírgula)');

  // ---------------------------------------------------------------- contas
  await page.selectOption('#account-select', '__manage');
  await page.fill('#form-account [name=nome]', 'Cliente B');
  await page.click('#form-account button[type=submit]');
  await page.click('#dlg-accounts [data-close]');
  assert.equal(await page.locator('#account-select option:checked').innerText(), 'Cliente B');
  await go('results');
  assert.match(await $text('#records-table'), /Crie primeiro uma campanha/);
  ok('nova conta começa vazia e fica selecionada');

  let fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=import-csv]');
  await (await fc).setFiles(csvPath);
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('importados'));
  assert.match(await toastText(), /8 registos importados, 2 campanhas criadas/);
  assert.equal(await rowCount(), 8);
  await go('dashboard');
  assert.match(await kpi('Custo'), /^240,00\s?€$/);
  ok('importar CSV para outra conta reproduz os mesmos totais');

  fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=import-csv]');
  await (await fc).setFiles(csvPath);
  await page.waitForFunction(() => /8 registos importados$/.test(document.querySelector('#toast-text').textContent));
  await go('results');
  assert.equal(await rowCount(), 8, 'reimportar o mesmo CSV atualiza em vez de duplicar');
  const badCsv = path.join(TMP, 'mau.csv');
  fs.writeFileSync(badCsv, 'inicio;campanha;custo\n2026-11-01;X;5\n2026-02-30;X;1\n');
  fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=import-csv]');
  await (await fc).setFiles(badCsv);
  await page.waitForSelector('#dlg-ask[open]');
  assert.match(await $text('#ask-text'), /linha 3: data inválida/);
  await answer();
  assert.equal(await rowCount(), 8, 'CSV com erros não importa nada');
  ok('reimportar não duplica; CSV com erros é recusado por inteiro');

  await page.selectOption('#account-select', '__manage');
  await page.locator('#account-list li', { hasText: 'atual' }).locator('[data-del-account]').click();
  await answer('ok');
  await page.waitForFunction(() => document.querySelectorAll('#account-list li').length === 1);
  assert.equal(await dialogOpen('#dlg-accounts'), false);
  await page.click('#toast-undo');
  assert.equal(await page.locator('#account-select option').count(), 3, '2 contas + "Gerir contas…"');
  await page.selectOption('#account-select', { label: 'Conta principal' });
  ok('apagar conta e anular');

  // ---------------------------------------------------------------- abrir cópia: substituir e juntar
  await page.click('#btn-data-menu');
  await page.click('[data-action=clear]');
  await answer('ok');
  assert.match(await $text('#records-table'), /Crie primeiro uma campanha/);
  fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=open-json]');
  await (await fc).setFiles(backupPath);
  await page.waitForSelector('#dlg-ask[open]');
  await answer('replace');
  assert.equal(await rowCount(), 8);
  assert.equal(await page.locator('#account-select option').count(), 2, 'substituir repõe exatamente a cópia (1 conta)');
  ok('restaurar cópia de segurança (substituir tudo)');

  const shared = path.join(TMP, 'partilha.json');
  fs.writeFileSync(shared, JSON.stringify({ accounts: [{ id: 'colega', nome: 'Conta do colega' }], campaigns: [{ id: 'cc', accountId: 'colega', nome: 'Campanha do colega' }], records: [{ id: 'rr', campaignId: 'cc', inicio: '2026-11-01', fim: '2026-11-01', custo: 9 }], notes: [] }));
  fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=open-json]');
  await (await fc).setFiles(shared);
  await answer('merge');
  assert.equal(await page.locator('#account-select option').count(), 3);
  assert.equal(await rowCount(), 8, 'juntar mantém a conta atual');
  fc = page.waitForEvent('filechooser');
  await page.click('#btn-data-menu');
  await page.click('[data-action=open-json]');
  fs.writeFileSync(path.join(TMP, 'lixo.json'), '{"nada": true}');
  await (await fc).setFiles(path.join(TMP, 'lixo.json'));
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('não é uma cópia válida'));
  ok('juntar ficheiro partilhado por um colega; ficheiro inválido é recusado');

  // ---------------------------------------------------------------- persistência
  await page.reload();
  await go('results');
  assert.equal(await rowCount(), 8);
  assert.equal(await page.locator('#account-select option').count(), 3);
  ok('dados mantêm-se depois de recarregar a página');

  // ---------------------------------------------------------------- dados de exemplo
  await page.click('#btn-data-menu');
  await page.click('[data-action=demo]');
  await answer('ok');
  await go('dashboard');
  await page.click('#f-range [data-range="90"]');
  assert.notEqual(await kpi('Custo'), '0,00 €');
  await page.click('#toast-undo');
  await go('results');
  assert.equal(await rowCount(), 8);
  ok('dados de exemplo carregam e podem ser anulados');

  // ---------------------------------------------------------------- tema e telemóvel
  await page.click('#btn-theme');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.ok(theme === 'dark' || theme === 'light');
  await page.setViewportSize({ width: 375, height: 800 });
  for (const v of ['dashboard', 'campaigns', 'results', 'report']) {
    await go(v);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `sem scroll horizontal em ${v} (${overflow}px)`);
  }
  ok('tema escuro e ecrã de telemóvel sem scroll horizontal');

  // ---------------------------------------------------------------- gravação automática (seletor simulado)
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.addInitScript(() => {
    window.__writes = [];
    window.showSaveFilePicker = async () => ({
      name: 'dados.json',
      createWritable: async () => {
        let buf = '';
        return { write: async (t) => (buf += t), close: async () => window.__writes.push(buf) };
      },
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    });
  });
  await page2.goto(URL);
  await page2.click('#btn-data-menu');
  await page2.click('[data-action=autofile]');
  await page2.waitForFunction(() => window.__writes.length === 1);
  assert.match(await page2.locator('#toast-text').innerText(), /dados\.json/);
  await page2.click('.tab[data-view=campaigns]');
  await page2.click('#btn-new-campaign');
  await page2.fill('#form-campaign [name=nome]', 'Gravada');
  await page2.click('#form-campaign button[type=submit]');
  await page2.waitForFunction(() => window.__writes.length === 2, null, { timeout: 5000 });
  const written = JSON.parse(await page2.evaluate(() => window.__writes.at(-1)));
  assert.ok(written.campaigns.some((c) => c.nome === 'Gravada'));
  await page2.click('#btn-data-menu');
  assert.match(await page2.locator('#menu-status').innerText(), /Gravação automática ativa/);
  assert.equal(await page2.locator('#banners .banner').count(), 0);
  ok('gravação automática escreve o ficheiro a cada alteração');

  assert.deepEqual(errors, [], `erros na consola: ${errors.join(' | ')}`);
  ok('nenhum erro na consola');

  await browser.close();
  console.log(`\nTodos os ${step} passos passaram.`);
})().catch(async (e) => {
  console.error('\n✗ FALHOU no passo', step + 1, '\n', e);
  process.exit(1);
});

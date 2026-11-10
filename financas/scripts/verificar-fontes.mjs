#!/usr/bin/env node
// Verificação automática das fontes oficiais dos produtos bancários (Módulo 10).
// Uso: node scripts/verificar-fontes.mjs caminho/para/produtos.json
//
// Para cada produto descarrega a fonte oficial (FIN, preçário ou página), calcula uma impressão digital
// e compara-a com a da última verificação:
//  - igual: atualiza a data da última verificação e da próxima;
//  - diferente: guarda o histórico, marca a informação como "desatualizada" (requer validação) e
//    regista as percentagens encontradas junto a "TANB" para revisão. Nunca altera taxas automaticamente,
//    para não substituir informação confirmada por dados não verificados;
//  - inacessível: mantém os dados e regista a falha; após 30 dias sem verificação marca como desatualizada.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ficheiro = process.argv[2];
if (!ficheiro) {
  console.error('Indica o ficheiro produtos.json.');
  process.exit(1);
}
const hoje = new Date().toISOString().slice(0, 10);
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const base = JSON.parse(readFileSync(ficheiro, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'fontes-'));
let alterados = 0;

function textoPdf(bytes) {
  try {
    const p = join(tmp, 'f.pdf');
    writeFileSync(p, bytes);
    return execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

const textoHtml = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

for (const p of base.produtos) {
  const fonte = p.fontes?.[0];
  if (!fonte?.url) continue;
  try {
    const r = await fetch(fonte.url, { headers: { 'User-Agent': 'Mozilla/5.0 (verificacao de condicoes publicas)' }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const ehPdf = bytes.subarray(0, 4).toString() === '%PDF';
    // PDF: impressão digital dos bytes. HTML: do texto (as páginas mudam tokens a cada pedido).
    const texto = ehPdf ? textoPdf(bytes) : textoHtml(bytes.toString('utf8'));
    const hash = createHash('sha256').update(ehPdf ? bytes : texto).digest('hex');
    const v = p.verificacao;
    if (v.hashFonte && v.hashFonte !== hash) {
      const conhecidas = new Set([...p.niveis.flatMap((n) => n.escaloes), ...(p.promocao?.escaloes ?? [])].map((e) => e.tanb));
      const encontradas = [...new Set([...texto.matchAll(/TANB[^%]{0,80}?(\d{1,2}[,.]\d{1,4})\s?%/gi)].map((m) => Number(m[1].replace(',', '.'))))];
      const novas = encontradas.filter((x) => !conhecidas.has(x));
      p.historico = [
        ...(p.historico ?? []),
        {
          data: hoje,
          descricao: `Documento oficial alterado desde ${v.ultima}. ${novas.length ? `Percentagens junto a TANB não registadas: ${novas.join('; ')} %.` : 'Sem novas percentagens junto a TANB.'} Requer validação.`,
          anterior: { hashFonte: v.hashFonte, verificadoEm: v.ultima },
        },
      ];
      v.estado = 'desatualizada';
      v.notas = `Fonte alterada em ${hoje}: condições a validar antes de serem consideradas atuais.`;
      alterados++;
    }
    v.hashFonte = hash;
    if (v.estado !== 'desatualizada') v.ultima = hoje;
    v.proxima = somarDias(hoje, 7);
    console.log(`${p.id}: ${v.estado}`);
  } catch (e) {
    const v = p.verificacao;
    v.notas = `${v.notas ?? ''} Fonte inacessível em ${hoje} (${e.message}).`.trim().slice(-400);
    if (v.ultima < somarDias(hoje, -30)) v.estado = 'desatualizada';
    v.proxima = somarDias(hoje, 1);
    console.log(`${p.id}: fonte inacessível (${e.message})`);
  }
}

base.geradoEm = hoje;
writeFileSync(ficheiro, `${JSON.stringify(base, null, 2)}\n`);
console.log(`Concluído: ${alterados} produto(s) com documentação alterada.`);

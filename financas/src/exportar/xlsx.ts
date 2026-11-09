// Gerador mínimo de ficheiros Excel (.xlsx), sem dependências: SpreadsheetML dentro de um ZIP sem compressão.

export type Celula = string | number | null | { euro: number } | { data: string };

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: remove caracteres inválidos em XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function coluna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const serialData = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;

function folhaXml(linhas: Celula[][]): string {
  const larguras = (linhas[0] ?? []).map((_, j) => Math.min(48, Math.max(10, ...linhas.map((l) => String(typeof l[j] === 'object' && l[j] ? '000000000000' : (l[j] ?? '')).length + 2))));
  const cols = larguras.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('');
  const linhasXml = linhas
    .map((l, i) => {
      const cels = l
        .map((c, j) => {
          const ref = `${coluna(j)}${i + 1}`;
          if (c == null || c === '') return '';
          if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
          if (typeof c === 'object' && 'euro' in c) return `<c r="${ref}" s="1"><v>${Math.round(c.euro * 100) / 100}</v></c>`;
          if (typeof c === 'object' && 'data' in c) return `<c r="${ref}" s="2"><v>${serialData(c.data)}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${i === 0 ? ' s="3"' : ''}><is><t xml:space="preserve">${esc(String(c))}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${cels}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${linhasXml}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf xfId="0"/><xf numFmtId="164" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" xfId="0" applyNumberFormat="1"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ---------- ZIP (método "store") ----------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABELA_CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(ficheiros: { nome: string; conteudo: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of ficheiros) {
    const nome = enc.encode(f.nome);
    const dados = enc.encode(f.conteudo);
    const crc = crc32(dados);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true); // nomes em UTF-8
    loc.setUint16(8, 0, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, dados.length, true);
    loc.setUint32(22, dados.length, true);
    loc.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(loc.buffer), nome, dados);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, dados.length, true);
    cen.setUint32(24, dados.length, true);
    cen.setUint16(28, nome.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nome);
    offset += 30 + nome.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, ficheiros.length, true);
  fim.setUint16(10, ficheiros.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, offset, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of todas) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

/** Cria um livro Excel com várias folhas. */
export function livroXlsx(folhas: { nome: string; linhas: Celula[][] }[]): Blob {
  const nomes = folhas.map((f) => f.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const ficheiros = [
    {
      nome: '[Content_Types].xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nome: 'xl/styles.xml', conteudo: ESTILOS },
    ...folhas.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: folhaXml(f.linhas) })),
  ];
  return new Blob([zip(ficheiros)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

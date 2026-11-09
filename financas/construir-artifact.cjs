// Junta a aplicação num único ficheiro HTML para publicar como página no claude.ai.
// Uso: node construir-artifact.cjs [ficheiro-de-saida]   (por omissão: dist/financas.html)
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const ler = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const html = ler('index.html');

const titulo = html.match(/<title>[\s\S]*?<\/title>/)[0];
let corpo = html.match(/<body>([\s\S]*)<\/body>/)[1];
corpo = corpo.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
  const js = ler(f);
  if (js.includes('</script')) throw new Error(`${f} contém "</script"`);
  return `<script>\n${js}</script>`;
});

const saida = [
  titulo,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  `<style>\n${ler('styles.css')}</style>`,
  corpo.trim(),
  '',
].join('\n');

const destino = path.resolve(process.argv[2] || path.join(dir, 'dist', 'financas.html'));
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, saida);
console.log(`Criado ${destino} (${(saida.length / 1024).toFixed(1)} KB)`);

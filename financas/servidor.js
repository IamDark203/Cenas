// Servidor estático mínimo (opcional). A aplicação também abre diretamente com duplo clique no index.html.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORTA = Number(process.env.PORT) || 8080;
const RAIZ = __dirname;
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

http
  .createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const ficheiro = path.join(RAIZ, caminho === '/' ? 'index.html' : caminho);
    if (!ficheiro.startsWith(RAIZ + path.sep) || !TIPOS[path.extname(ficheiro)]) {
      res.writeHead(404).end('Não encontrado');
      return;
    }
    fs.readFile(ficheiro, (erro, dados) => {
      if (erro) return res.writeHead(404).end('Não encontrado');
      res.writeHead(200, { 'Content-Type': `${TIPOS[path.extname(ficheiro)]}; charset=utf-8` }).end(dados);
    });
  })
  .listen(PORTA, '127.0.0.1', () => console.log(`As Minhas Finanças: http://localhost:${PORTA}`));

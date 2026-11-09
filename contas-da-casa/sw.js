// Service worker: guarda os ficheiros da aplicação para funcionar sem internet.
// Ao alterar a aplicação, muda a VERSAO para os telemóveis receberem a versão nova.
// O nome começa por "minhas-financas-" para não apagar a cache das outras apps no mesmo site.
const PREFIXO = 'minhas-financas-';
const VERSAO = `${PREFIXO}v1`;
// Caches da app "Contas da Casa", que esta substituiu no mesmo endereço.
const PREFIXOS_ANTIGOS = ['contas-'];
const FICHEIROS = [
  './',
  'index.html',
  'styles.css',
  'calc.js',
  'graficos.js',
  'exemplo.js',
  'armazenamento.js',
  'app.js',
  'manifest.webmanifest',
  'icones/icone.svg',
  'icones/apple-touch-icon.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(FICHEIROS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter(
            (k) => (k.startsWith(PREFIXO) && k !== VERSAO) || PREFIXOS_ANTIGOS.some((p) => k.startsWith(p)),
          ).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (para receber atualizações); se não houver internet, usa a cópia guardada.
self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET' || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(ev.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(ev.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(ev.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

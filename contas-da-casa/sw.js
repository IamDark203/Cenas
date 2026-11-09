// Service worker: guarda a app para funcionar sem internet.
// Rede primeiro (recebe atualizações); sem ligação usa a última cópia guardada.
// Só apaga caches suas e das versões anteriores desta pasta (as outras apps do site não são tocadas).
const PREFIXO = 'capital-';
const VERSAO = `${PREFIXO}v1`;
const ANTIGOS = ['minhas-financas-', 'contas-'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((k) => (k.startsWith(PREFIXO) && k !== VERSAO) || ANTIGOS.some((p) => k.startsWith(p)))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const pedido = ev.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(pedido, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(pedido, copia));
        }
        return resp;
      })
      .catch(() =>
        caches
          .match(pedido, { ignoreSearch: true })
          .then((r) => r || (pedido.mode === 'navigate' ? caches.match('./index.html') : undefined))
          .then((r) => r || Response.error()),
      ),
  );
});

// Service worker enxuto: cache só de asset estático da própria origem.
// Nada de HTML, sessão ou chamada ao Supabase entra no cache.

const CACHE = "marginalia-v1";

const ESTATICOS = [
  "/pdf.worker.min.mjs",
  "/icons/192",
  "/icons/512",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ESTATICOS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheavel(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pdfjs/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/pdf.worker.min.mjs" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!cacheavel(url)) return; // deixa passar direto pra rede

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      });
    }),
  );
});

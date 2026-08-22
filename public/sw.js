// Service worker: cache de asset estático + um "casco" de navegação por rota,
// pra abrir o app do zero sem internet (livro baixado continua lendo offline).
// O casco nunca leva dado de sessão — as páginas buscam tudo no cliente agora.

const CACHE = "marginalia-v2";
const CACHE_CASCO = "marginalia-casco-v1";

const ESTATICOS = [
  "/pdf.worker.min.mjs",
  "/icons/192",
  "/icons/512",
  "/manifest.webmanifest",
];

// Chave sintética (não a URL de fato) — assim TODO /livro/<qualquer-id> reaproveita
// o mesmo casco em cache, em vez de só funcionar offline pro último livro visitado.
const CASCO_ESTANTE = "/";
const CASCO_LIVRO = "/__casco/livro";
const CASCO_MARCACOES = "/__casco/marcacoes";

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
        Promise.all(
          chaves
            .filter((k) => k !== CACHE && k !== CACHE_CASCO)
            .map((k) => caches.delete(k)),
        ),
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

/** null = rota sem casco offline (login etc.) — passa direto pra rede, sem cache. */
function chaveDoCasco(pathname) {
  if (pathname === "/") return CASCO_ESTANTE;
  if (pathname.startsWith("/livro/")) {
    // Telas diferentes, cascos diferentes: sem isto a página de marcações seria
    // guardada por cima da do leitor e voltaria no lugar dela offline.
    return pathname.endsWith("/marcacoes") ? CASCO_MARCACOES : CASCO_LIVRO;
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navegação de página (não asset): tenta a rede, guarda uma cópia genérica sob
  // uma chave fixa por rota e, se a rede falhar (offline), serve essa cópia.
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    const chave = chaveDoCasco(url.pathname);
    if (chave) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            // !res.redirected: se a sessão expirou e o servidor mandou pro /login no
            // meio do caminho, o fetch segue o redirect sozinho — sem essa checagem, a
            // gente guardaria a página de login como se fosse o casco da estante/leitor.
            if (res.ok && !res.redirected) {
              const copia = res.clone();
              caches.open(CACHE_CASCO).then((c) => c.put(chave, copia));
            }
            return res;
          })
          .catch(() => caches.match(chave, { cacheName: CACHE_CASCO })),
      );
    }
    return;
  }

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

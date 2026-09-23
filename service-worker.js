// service-worker.js
//
// Scope: makes the site installable and usable offline for pages already
// visited. Deliberately does NOT cache anything under
// /.netlify/functions/* — balance, staking, progress, and submission data
// must always be live, never served stale from a cache. Those requests
// are passed straight through to the network, untouched.
//
// Cache strategy:
//   - HTML navigations: network-first, falling back to cache when offline
//     (so a returning visitor always gets the freshest page when online).
//   - CSS/JS/fonts/icons: cache-first (rarely change, load instantly).
//   - Everything else (including all /.netlify/functions/* calls): not
//     intercepted at all — normal network request, browser's own rules.
//
// Bump CACHE_VERSION whenever the precached file list below changes, so
// returning visitors pick up the new shell instead of a stale one.

const CACHE_VERSION = "gradtoken-shell-v1";

const PRECACHE_URLS = [
  "/index.html",
  "/how-it-works.html",
  "/tokenomics.html",
  "/roadmap.html",
  "/security.html",
  "/courses.html",
  "/community.html",
  "/solidity-basics.html",
  "/dashboard.html",
  "/css/styles.css",
  "/css/gradlearn-project-form.css",
  "/js/main.js",
  "/js/wallet-connect.js",
  "/js/dashboard.js",
  "/js/project-submit-form.js",
  "/manifest.json",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-192.png",
  "/assets/icons/icon-maskable-512.png",
  "/fonts/fraunces-latin-400-normal.woff2",
  "/fonts/fraunces-latin-500-normal.woff2",
  "/fonts/fraunces-latin-500-italic.woff2",
  "/fonts/fraunces-latin-600-normal.woff2",
  "/fonts/fraunces-latin-600-italic.woff2",
  "/fonts/fraunces-latin-700-normal.woff2",
  "/fonts/work-sans-latin-400-normal.woff2",
  "/fonts/work-sans-latin-500-normal.woff2",
  "/fonts/work-sans-latin-600-normal.woff2",
  "/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "/fonts/ibm-plex-mono-latin-500-normal.woff2",
  "/fonts/ibm-plex-mono-latin-600-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls or cross-origin requests — always live.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/.netlify/functions/")) {
    return;
  }

  // Only handle GET; POST/PUT etc. (submissions, progress updates) always
  // go straight to the network untouched.
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    // Network-first for page navigations, falling back to cache offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/index.html"))
        )
    );
    return;
  }

  // Cache-first for static assets (css/js/fonts/icons).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

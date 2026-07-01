// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte
// STRATÉGIE : HTML toujours depuis le réseau, assets en cache
// ============================================================

const CACHE_NAME = 'mcr-flotte-v260701.1554';
const CACHE_ASSETS = ['./icon-192.png', './manifest.json'];

let rappelsProgrammes = [];
let timerResumeQuotidien = null;

// ── Installation ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_ASSETS))
      .catch(e => console.warn('SW cache partiel:', e))
  );
  self.skipWaiting();
});

// ── Activation ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.includes('firestore') || url.includes('firebase') ||
      url.includes('googleapis') || url.includes('gstatic') ||
      url.includes('google.com')) return;

  // HTML principal + vérification version → toujours réseau, jamais en cache
  const isHTML = url.includes('.html') || url.includes('nocache=') ||
                 url.endsWith('/') || url === self.location.origin + '/';
  if (isHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets (icônes, manifest) → cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
  );
});
